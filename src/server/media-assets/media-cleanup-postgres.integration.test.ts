// @vitest-environment node
import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it, vi } from "vitest";
import { prisma } from "@/server/db/prisma";
import { postgresIntegrationEnabled } from "@/test-utils/postgres-integration";
import { expireFixtureQueueAttempt, useSharedQueueFixture } from "@/test-utils/job-queue-postgres";
import { createStorageCleanupIntent, queueStorageCleanup, MEDIA_CLEANUP_MAX_ATTEMPTS } from "./media-cleanup-repository";
import { createStorageCleanupHandler } from "@/server/job-queue/handlers/storage-cleanup-handler";
import { createQueueRunner } from "@/server/job-queue/job-queue-runner";
import { claimQueueJob } from "@/server/job-queue/job-queue-scheduler";
import { recoverExpiredQueueAttempts } from "@/server/job-queue/job-queue-recovery";
import { expireStaleSubmissions, setSubmissionLedgerForTests } from "../generation-admission/submission-ledger";

describe.skipIf(!postgresIntegrationEnabled)("Media cleanup ledger PostgreSQL lifecycle", () => {
  const suffix = randomUUID();
  const ownerEmail = "cleanup-" + suffix + "@example.com";
  const now = new Date("2026-09-16T00:00:00.000Z");
  const deletion = vi.fn().mockResolvedValue(undefined);
  const handler = createStorageCleanupHandler({ name: "leemage", delete: deletion } as never);
  useSharedQueueFixture(() => [ownerEmail]);
  setSubmissionLedgerForTests(null);
  afterAll(async () => {
    await prisma.generationSubmission.deleteMany({ where: { ownerEmail } });
    await prisma.generationInputAsset.deleteMany({ where: { ownerEmail } });
    await prisma.mediaCleanupTask.deleteMany({ where: { ownerEmail } });
    await prisma.mediaAsset.deleteMany({ where: { ownerEmail } });
  });
  async function run() {
    const runner = createQueueRunner([handler]);
    try { await runner.pump(); await runner.drain(); } finally { await runner.stop(); }
  }
  it("releases upload intents when a preparing submission expires", async () => {
    const requestId = "expired-" + suffix;
    await prisma.generationSubmission.create({ data: { requestId, ownerEmail, scope: "session:" + ownerEmail,
      idempotencyHash: "expired-key-" + suffix, payloadHash: "expired-payload-" + suffix, state: "preparing", expiresAt: new Date(now.getTime() - 1) } });
    const task = await createStorageCleanupIntent(undefined, { ownerEmail, requestId, storageProvider: "leemage",
      storageObjectId: "expired-upload-" + suffix, reason: "upload_session", now, retryAt: new Date(now.getTime() + 60_000) });
    expect(await expireStaleSubmissions(now, 10)).toBe(1);
    expect(await prisma.generationSubmission.findUnique({ where: { requestId } })).toMatchObject({ state: "expired" });
    expect(await prisma.mediaCleanupTask.findUnique({ where: { id: task.id } })).toMatchObject({ status: "pending", reason: "submission_failed", retryAt: now });
    await run();
  });
  it("allows one common claimant and preserves a stale attempt in DLQ without re-execution", async () => {
    const task = await queueStorageCleanup(undefined, { ownerEmail, storageProvider: "leemage", storageObjectId: "concurrent-" + suffix, reason: "submission_failed", now });
    const claim = () => claimQueueJob(randomUUID(), (tx, job, lease) => handler.prepareTx(tx, job, lease));
    const claimed = (await Promise.all([claim(), claim()])).filter(c => c !== null);
    expect(claimed).toHaveLength(1); expect(claimed[0]!.job.sourceId).toBe(task.id);
    expect(await prisma.mediaCleanupTask.findUnique({ where: { id: task.id } })).toMatchObject({ status: "processing", attempts: 1 });
    await expireFixtureQueueAttempt(claimed[0]!.attemptId);
    await recoverExpiredQueueAttempts(new Map([[handler.kind, handler]]));
    expect(await claim()).toBeNull();
    expect(await prisma.queueDeadLetter.count({ where: { jobId: claimed[0]!.job.id, safeErrorCode: "QUEUE_LEASE_EXPIRED" } })).toBe(1);
  });
  it("moves five failed deletions to the common operator DLQ", async () => {
    deletion.mockRejectedValue(new Error("remote unavailable"));
    const task = await queueStorageCleanup(undefined, { ownerEmail, storageProvider: "leemage", storageObjectId: "retry-" + suffix, reason: "submission_failed", now });
    for (let n = 1; n <= MEDIA_CLEANUP_MAX_ATTEMPTS; n++) {
      await prisma.queueJob.updateMany({ where: { sourceId: task.id }, data: { availableAt: new Date(Date.now() - 1000) } });
      await run();
    }
    expect(await prisma.mediaCleanupTask.findUnique({ where: { id: task.id } })).toMatchObject({ status: "failed", attempts: 5, lastError: "MEDIA_CLEANUP_FAILED" });
    expect(await prisma.queueDeadLetter.count({ where: { job: { sourceId: task.id } } })).toBe(1);
    deletion.mockResolvedValue(undefined);
  });
  it("protects a referenced asset and deletes an unreferenced failed submission", async () => {
    deletion.mockClear();
    const referenced = await prisma.mediaAsset.create({ data: { ownerEmail, type: "image", origin: "upload", storageProvider: "leemage", storageObjectId: "referenced-" + suffix, mimeType: "image/png" } });
    await prisma.generationInputAsset.create({ data: { requestId: "request-" + suffix, generationType: "image", ownerEmail, field: "initImages", assetId: referenced.id } });
    const protectedTask = await queueStorageCleanup(undefined, { ownerEmail, storageProvider: "leemage", storageObjectId: referenced.storageObjectId, reason: "submission_failed", assetId: referenced.id, now });
    await run(); expect(deletion).not.toHaveBeenCalled();
    expect(await prisma.mediaCleanupTask.findUnique({ where: { id: protectedTask.id } })).toMatchObject({ status: "linked" });
    const orphan = await prisma.mediaAsset.create({ data: { ownerEmail, type: "image", origin: "upload", storageProvider: "leemage", storageObjectId: "orphan-" + suffix, mimeType: "image/png" } });
    const task = await queueStorageCleanup(undefined, { ownerEmail, storageProvider: "leemage", storageObjectId: orphan.storageObjectId, reason: "submission_failed", assetId: orphan.id, now });
    await run(); expect(deletion).toHaveBeenCalledExactlyOnceWith(orphan.storageObjectId);
    expect(await prisma.mediaAsset.findUnique({ where: { id: orphan.id } })).toBeNull();
    expect(await prisma.mediaCleanupTask.findUnique({ where: { id: task.id } })).toMatchObject({ status: "completed" });
  });
});
