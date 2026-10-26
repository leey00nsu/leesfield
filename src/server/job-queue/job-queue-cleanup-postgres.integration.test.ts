// @vitest-environment node
import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { prisma } from "@/server/db/prisma";
import { postgresIntegrationEnabled } from "@/test-utils/postgres-integration";
import { removeFixtureQueueJobs } from "@/test-utils/job-queue-postgres";
import { createStorageCleanupIntent, queueStorageCleanup, linkStorageCleanupToAsset,
  activateExpiredCleanupIntents, retireLinkedStorageCleanupJobs, releaseStorageCleanupsForRequest,
  requeueFailedStorageCleanups } from "@/server/media-assets/media-cleanup-repository";
import { withQueueTransaction } from "./job-queue-transaction";
import { enqueueQueueJobTx, queueScopeDigest } from "./job-queue-registration";
import { createStorageCleanupHandler } from "./handlers/storage-cleanup-handler";
import type { MediaStorageAdapter } from "@/server/media-assets/media-storage";
import { createQueueRunner } from "./job-queue-runner";

describe.skipIf(!postgresIntegrationEnabled)("cleanup common queue", () => {
  const ownerEmail = "queue-cleanup-" + randomUUID() + "@example.com";
  const deletion = vi.fn();
  const storage = { name: "leemage", delete: deletion } as unknown as MediaStorageAdapter;
  const handler = createStorageCleanupHandler(storage);
  let runner: ReturnType<typeof createQueueRunner> | undefined;
  beforeAll(async () => {
    await prisma.queueRuntime.update({ where: { id: 1 }, data: { mode: "shared", migrationVerified: true } });
  });
  afterEach(async () => {
    await runner?.stop(); runner = undefined;
    const tasks = await prisma.mediaCleanupTask.findMany({ where: { ownerEmail } });
    await removeFixtureQueueJobs(tasks.map(t => t.id));
    await prisma.mediaCleanupTask.deleteMany({ where: { ownerEmail } });
    await prisma.generationGraph.deleteMany({ where: { ownerEmail } });
    await prisma.mediaAsset.deleteMany({ where: { ownerEmail } });
    deletion.mockReset();
  });
  afterAll(async () => {
    await prisma.queueRuntime.update({ where: { id: 1 }, data: { mode: "paused", migrationVerified: false } });
  });
  function input() {
    return { ownerEmail, storageProvider: "leemage", storageObjectId: randomUUID(), reason: "upload_failed" as const };
  }
  async function run() {
    runner ??= createQueueRunner([handler]);
    await runner.pump(); await runner.drain();
  }
  async function legacyJob(task: Awaited<ReturnType<typeof createStorageCleanupIntent>>) {
    return withQueueTransaction(tx => enqueueQueueJobTx(tx, {
      kind: "storage_cleanup", source: { type: "storage_cleanup", id: task.id, revision: task.queueRevision },
      ownerScopeDigest: queueScopeDigest(ownerEmail), snapshotRef: `cleanup:${task.id}:${task.queueRevision}`,
      availableAt: task.retryAt, suspended: true,
    }));
  }
  it("persists protection without queue work, atomically links assets and queues expiry exactly once", async () => {
    const first = await createStorageCleanupIntent(undefined, input());
    expect(first.status).toBe("uploading");
    expect(await prisma.queueJob.count({ where: { sourceId: first.id } })).toBe(0);
    await run(); expect(deletion).not.toHaveBeenCalled();
    const asset = await prisma.mediaAsset.create({ data: { ownerEmail, type: "image", origin: "upload", storageProvider: first.storageProvider,
      storageObjectId: first.storageObjectId, mimeType: "image/png" } });
    const linked = await linkStorageCleanupToAsset(undefined, { ...first, assetId: asset.id, reason: "upload_session" });
    expect(linked.queueRevision).toBe(first.queueRevision + 1);
    expect(linked.status).toBe("linked");
    expect(await prisma.queueJob.count({ where: { sourceId: first.id } })).toBe(0);
    await activateExpiredCleanupIntents(new Date(Date.now() + 3_600_000));
    await run(); expect(deletion).not.toHaveBeenCalled();
    const expired = await createStorageCleanupIntent(undefined, { ...input(), retryAt: new Date(Date.now() - 1000) });
    await Promise.all([activateExpiredCleanupIntents(), activateExpiredCleanupIntents()]);
    expect(await prisma.queueJob.count({ where: { sourceId: expired.id } })).toBe(1);
    await run();
    expect(deletion).toHaveBeenCalledExactlyOnceWith(expired.storageObjectId);
  });
  it("activates an old suspended upload without duplication and fences its revision when linked", async () => {
    const task = await createStorageCleanupIntent(undefined, { ...input(), retryAt: new Date(Date.now() - 1000) });
    const old = await legacyJob(task);
    await activateExpiredCleanupIntents();
    expect(await prisma.queueJob.findUniqueOrThrow({ where: { id: old.id } })).toMatchObject({ status: "ready", sourceRevision: task.queueRevision });
    const asset = await prisma.mediaAsset.create({ data: { ownerEmail, type: "image", origin: "upload", storageProvider: task.storageProvider,
      storageObjectId: task.storageObjectId, mimeType: "image/png" } });
    await expect(prisma.$transaction(async tx => {
      await linkStorageCleanupToAsset(tx, { ...task, assetId: asset.id, reason: "upload_session" });
      throw Error("ROLLBACK_LINK");
    })).rejects.toThrow("ROLLBACK_LINK");
    expect((await prisma.queueJob.findUniqueOrThrow({ where: { id: old.id } })).status).toBe("ready");
    await linkStorageCleanupToAsset(undefined, { ...task, assetId: asset.id, reason: "upload_session" });
    expect((await prisma.queueJob.findUniqueOrThrow({ where: { id: old.id } })).status).toBe("cancelled");
    expect(await prisma.queueJob.count({ where: { sourceId: task.id } })).toBe(1);
    await run(); expect(deletion).not.toHaveBeenCalled();
  });
  it("retires only proven valid legacy protection and keeps missing assets and storage unchanged", async () => {
    const valid = await createStorageCleanupIntent(undefined, input());
    const asset = await prisma.mediaAsset.create({ data: { ownerEmail, type: "image", origin: "upload", storageProvider: valid.storageProvider,
      storageObjectId: valid.storageObjectId, mimeType: "image/png" } });
    const linked = await linkStorageCleanupToAsset(undefined, { ...valid, assetId: asset.id, reason: "upload_session" });
    const known = await legacyJob(linked);
    const missing = await createStorageCleanupIntent(undefined, input());
    await prisma.mediaCleanupTask.update({ where: { id: missing.id }, data: { status: "linked" } });
    const unknown = await legacyJob(missing);
    expect(await retireLinkedStorageCleanupJobs()).toEqual({ count: 1 });
    expect(await retireLinkedStorageCleanupJobs()).toEqual({ count: 0 });
    expect((await prisma.queueJob.findUniqueOrThrow({ where: { id: known.id } })).status).toBe("cancelled");
    expect((await prisma.queueJob.findUniqueOrThrow({ where: { id: unknown.id } })).status).toBe("suspended");
    expect(await prisma.mediaAsset.findUniqueOrThrow({ where: { id: asset.id } })).toMatchObject({ status: "completed" });
    expect(await prisma.mediaCleanupTask.findUniqueOrThrow({ where: { id: valid.id } })).toMatchObject({ status: "linked" });
    expect(deletion).not.toHaveBeenCalled();
  });
  it("keeps linked request intent available for failed submission cleanup and explicit deletion", async () => {
    const requestId = randomUUID();
    const first = await createStorageCleanupIntent(undefined, { ...input(), requestId });
    const asset = await prisma.mediaAsset.create({ data: { ownerEmail, type: "image", origin: "upload", storageProvider: first.storageProvider,
      storageObjectId: first.storageObjectId, mimeType: "image/png" } });
    await linkStorageCleanupToAsset(undefined, { ...first, assetId: asset.id, reason: "generation_input" });
    expect(await releaseStorageCleanupsForRequest(undefined, requestId)).toEqual({ count: 1 });
    expect(await releaseStorageCleanupsForRequest(undefined, requestId)).toEqual({ count: 0 });
    expect(await prisma.queueJob.count({ where: { sourceId: first.id, status: "ready" } })).toBe(1);
    // A new explicit delete request supersedes unclaimed cleanup, without a duplicate runnable job.
    await prisma.mediaAsset.update({ where: { id: asset.id }, data: { status: "deleting" } });
    const pending = await queueStorageCleanup(undefined, { ...first, assetId: asset.id, reason: "history_delete", retryAt: new Date() });
    expect(pending.status).toBe("pending");
    expect(await prisma.queueJob.count({ where: { sourceId: first.id, status: "ready" } })).toBe(1);
    await run(); expect(deletion).toHaveBeenCalledExactlyOnceWith(first.storageObjectId);
  });
  it("protects graph references and restores deleting assets without calling storage", async () => {
    const i = input();
    const asset = await prisma.mediaAsset.create({ data: { ownerEmail, type: "image", origin: "upload", storageProvider: i.storageProvider,
      storageObjectId: i.storageObjectId, status: "deleting", mimeType: "image/png" } });
    await prisma.generationGraph.create({ data: { ownerEmail, title: "reference", nodes: { create: {
      id: randomUUID(), kind: "input.image", x: 0, y: 0, configVersion: 1, config: { assetId: asset.id },
    } } } });
    const task = await queueStorageCleanup(undefined, { ...i, reason: "asset_delete", assetId: asset.id });
    await run();
    expect(deletion).not.toHaveBeenCalled();
    expect((await prisma.mediaAsset.findUniqueOrThrow({ where: { id: asset.id } })).status).toBe("completed");
    const settled = await prisma.queueJob.findFirstOrThrow({ where: { sourceId: task.id } });
    expect(settled.status).toBe("cancelled");
    expect(await prisma.queueAttempt.findUniqueOrThrow({ where: { id: settled.currentAttemptId! } })).toMatchObject({ outcome: "protected", phase: "ended" });
    expect(await prisma.queueReservation.count({ where: { attemptId: settled.currentAttemptId!, releasedAt: null } })).toBe(0);
  });
  it("uses exactly five attempts with backoff and preserves exhausted work for operator redrive", async () => {
    deletion.mockRejectedValue(new Error("DELETE_FAILED"));
    const task = await queueStorageCleanup(undefined, input());
    for (let n = 1; n <= 5; n++) {
      await run();
      const job = await prisma.queueJob.findFirstOrThrow({ where: { sourceId: task.id } });
      expect(job.status).toBe(n < 5 ? "retry_wait" : "dead_letter");
      expect(deletion).toHaveBeenCalledTimes(n);
      if (n < 5) {
        expect(job.availableAt.getTime()).toBeGreaterThan(Date.now() + 50_000);
        await prisma.queueJob.update({ where: { id: job.id }, data: { availableAt: new Date(Date.now() - 1000) } });
      }
    }
    expect(await prisma.queueAttempt.count({ where: { job: { sourceId: task.id } } })).toBe(5);
    expect(await prisma.queueDeadLetter.count({ where: { job: { sourceId: task.id }, classification: "terminal" } })).toBe(1);
    await expect(requeueFailedStorageCleanups()).rejects.toThrow("QUEUE_USE_DLQ_REDRIVE");
    await expect(queueStorageCleanup(undefined, { ...input(), storageObjectId: task.storageObjectId })).rejects.toThrow("QUEUE_CLEANUP_REQUIRES_OPERATOR");
    await run(); expect(deletion).toHaveBeenCalledTimes(5);
  });
  it("reserves only two cluster slots and prevents relinking a deletion in progress", async () => {
    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    deletion.mockImplementation(async () => gate);
    const tasks = [];
    for (let i = 0; i < 5; i++) tasks.push(await queueStorageCleanup(undefined, input()));
    runner = createQueueRunner([handler]);
    const other = createQueueRunner([handler]);
    try {
      await Promise.all([runner.pump(), other.pump()]);
      expect(await prisma.queueReservation.count({ where: { resourceKey: "storage-cleanup", releasedAt: null } })).toBe(2);
      const active = await prisma.mediaCleanupTask.findFirstOrThrow({ where: { ownerEmail, status: "processing" } });
      await expect(createStorageCleanupIntent(undefined, { ...input(), storageObjectId: active.storageObjectId })).rejects.toThrow("QUEUE_CLEANUP_REQUIRES_OPERATOR");
    } finally { release(); await other.stop(); await runner.drain(); }
  });
});
