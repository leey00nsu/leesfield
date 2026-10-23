// @vitest-environment node
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/server/db/prisma";
import { postgresIntegrationEnabled } from "@/test-utils/postgres-integration";
import { removeFixtureQueueJobs } from "@/test-utils/job-queue-postgres";
import { enqueueQueueJobTx } from "./job-queue-registration";
import { withQueueTransaction } from "./job-queue-transaction";
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
    await removeFixtureQueueJobs(ids);
    await prisma.queueOrderGroup.deleteMany({ where: { ownerScopeDigest: digest } });
    await prisma.queueRuntime.update({ where: { id: 1 }, data: { mode: "paused", migrationVerified: false } });
  });
  async function register(kind: QueueJobKind, type: QueueSourceType, key?: string, suspended = false) {
    const id = randomUUID(); ids.push(id);
    return withQueueTransaction(tx => enqueueQueueJobTx(tx, { kind, source: { type, id }, ownerScopeDigest: digest, snapshotRef: "metric-fixture", orderKey: key, suspended }));
  }
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
    await prisma.queueJob.update({ where: { id: assistant.id }, data: { createdAt: new Date(Date.now() - 180_000) } });
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
