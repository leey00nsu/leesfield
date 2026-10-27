// @vitest-environment node
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { prisma } from "@/server/db/prisma";
import { postgresIntegrationEnabled } from "@/test-utils/postgres-integration";
import { removeFixtureQueueJobs } from "@/test-utils/job-queue-postgres";
import { enqueueQueueJobTx } from "./job-queue-registration";
import { queueDatabaseNow, withQueueTransaction } from "./job-queue-transaction";
import { claimQueueJob } from "./job-queue-scheduler";
import { settleQueueFailure } from "./job-queue-settlement";
import { getSharedQueueSnapshot } from "./job-queue-snapshot";
import { getQueueMetrics } from "@/server/monitoring/queue-status";
import type { QueueHandler } from "./job-queue-handler";
import type { QueueJobKind, QueueSourceType } from "./contracts";

describe.skipIf(!postgresIntegrationEnabled)("common queue observability", () => {
  const digest = "9".repeat(64);
  const ids: string[] = [];
  const handler: QueueHandler = { kind: "generate_image", async prepareTx() {}, async execute() {}, async settleTx() { return "succeeded"; },
    async failTx() {}, classifyFailure() { return { code: "TEST_FAILED", phase: "execute", disposition: "terminal", executionStopped: true }; } };
  beforeAll(async () => { await prisma.queueRuntime.update({ where: { id: 1 }, data: { mode: "shared", migrationVerified: true } }); });
  afterAll(async () => {
    try {
      await removeFixtureQueueJobs(ids);
      await prisma.queueOrderGroup.deleteMany({ where: { ownerScopeDigest: digest } });
    } finally {
      await prisma.queueRuntime.update({ where: { id: 1 }, data: { mode: "paused", migrationVerified: false } });
    }
  });
  async function register(kind: QueueJobKind, type: QueueSourceType, key?: string, suspended = false) {
    const id = randomUUID(); ids.push(id);
    return withQueueTransaction(tx => enqueueQueueJobTx(tx, { kind, source: { type, id }, ownerScopeDigest: digest, snapshotRef: "metric-fixture", orderKey: key, suspended }));
  }
  it.each([-60_000, 60_000])("keeps reservation creation and release on the database clock with worker offset %i", async offset => {
    const job = await register("generate_image", "image_generation");
    try {
      vi.setSystemTime(new Date(Date.now() + offset));
      const claim = (await claimQueueJob(randomUUID()))!;
      const now = await withQueueTransaction(queueDatabaseNow);
      const reservations = await prisma.queueReservation.findMany({ where: { attemptId: claim.attemptId } });
      const attempt = await prisma.queueAttempt.findUniqueOrThrow({ where: { id: claim.attemptId } });
      expect(reservations.length).toBeGreaterThan(0);
      expect(reservations.every(r => r.createdAt <= now)).toBe(true);
      expect(reservations.every(r => r.createdAt.getTime() === attempt.startedAt.getTime())).toBe(true);
      await settleQueueFailure(claim.lease, handler, { code: "TEST_FAILED", phase: "execute", disposition: "terminal", executionStopped: true });
      const released = await prisma.queueReservation.findMany({ where: { attemptId: claim.attemptId } });
      expect(released.every(r => r.releasedAt && r.releasedAt >= r.createdAt)).toBe(true);
      const unfinished = await register("generate_image", "image_generation");
      const active = await claimQueueJob(randomUUID());
      expect(active?.job.id).toBe(unfinished.id);
      // Teardown must also use the DB clock while this worker clock is offset.
      await removeFixtureQueueJobs([unfinished.sourceId]);
      expect(await prisma.queueJob.findUnique({ where: { id: unfinished.id } })).toBeNull();
    } finally { vi.useRealTimers(); await removeFixtureQueueJobs([job.sourceId]); }
  });
  it("counts all six kinds, retry/block/uncertain resources and DLQ history once", async () => {
    const key = randomUUID();
    await register("generate_image", "image_generation", key);
    await register("generate_image", "image_generation", key);
    let claim = (await claimQueueJob(randomUUID()))!;
    await settleQueueFailure(claim.lease, handler, { code: "TEST_FAILED", phase: "execute", disposition: "terminal", executionStopped: true });
    await register("generate_image", "image_generation");
    claim = (await claimQueueJob(randomUUID()))!;
    await settleQueueFailure(claim.lease, handler, { code: "REMOTE_UNKNOWN", phase: "execute", disposition: "reconciliation", executionStopped: false });
    const retry = await register("media_operation", "media_operation");
    await prisma.queueJob.update({ where: { id: retry.id }, data: { maxAttempts: 3, retryDelayMs: 60_000 } });
    claim = (await claimQueueJob(randomUUID()))!;
    await settleQueueFailure(claim.lease, handler, { code: "TEST_RETRY", phase: "execute", disposition: "retry", executionStopped: true });
    await register("generate_video", "video_generation"); await claimQueueJob(randomUUID());
    await register("generate_audio", "audio_generation");
    const assistant = await register("assistant", "assistant_execution");
    const databaseNow = await withQueueTransaction(queueDatabaseNow);
    await prisma.queueJob.update({ where: { id: assistant.id }, data: { createdAt: new Date(databaseNow.getTime() - 180_000) } });
    await register("storage_cleanup", "storage_cleanup", undefined, true);
    const snapshot = await getSharedQueueSnapshot();
    expect(snapshot.pending).toBe(4); expect(snapshot.processing).toBe(1);
    expect(snapshot.byKind.generate_image).toMatchObject({ blocked: 1, finalFailed: 1, reconciliationRequired: 1, attempts: 2 });
    expect(snapshot.byKind.media_operation.retryWait).toBe(1);
    expect(snapshot.byKind.storage_cleanup.suspended).toBe(1);
    expect(snapshot.byKind.assistant.ready).toBe(1);
    expect(snapshot.oldestPendingAgeSeconds).toBeGreaterThanOrEqual(180);
    expect(snapshot.resources.find(r => r.key === "generation")).toMatchObject({ capacity: 4, reserved: 2, uncertain: 1 });
    expect(snapshot.deadLetters).toMatchObject({ unresolved: 2, reconciliation: 1 });
    const metrics = await getQueueMetrics();
    expect(metrics).toMatchObject({ pending: 4, processing: 1, failedCleanup: 0 });
    expect(JSON.stringify(snapshot)).not.toContain(digest);
  });
});
