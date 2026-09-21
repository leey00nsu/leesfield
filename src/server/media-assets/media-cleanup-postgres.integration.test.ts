// @vitest-environment node

import { randomUUID } from "node:crypto";

import { afterAll, describe, expect, it, vi } from "vitest";

import { prisma } from "@/server/db/prisma";
import { postgresIntegrationEnabled } from "@/test-utils/postgres-integration";

import {
  claimStorageCleanups,
  createStorageCleanupIntent,
  failStorageCleanup,
  queueStorageCleanup,
  MEDIA_CLEANUP_MAX_ATTEMPTS,
} from "./media-cleanup-repository";
import { processStorageCleanupTask } from "./media-cleanup-worker";
import {
  expireStaleSubmissions,
  setSubmissionLedgerForTests,
} from "../generation-admission/submission-ledger";

const integration = describe.skipIf(!postgresIntegrationEnabled);

integration("Media cleanup ledger PostgreSQL lifecycle", () => {
  const suffix = randomUUID();
  const ownerEmail = `cleanup-${suffix}@example.com`;
  const now = new Date("2026-09-16T00:00:00.000Z");

  setSubmissionLedgerForTests(null);

  afterAll(async () => {
    await prisma.generationSubmission.deleteMany({ where: { ownerEmail } });
    await prisma.generationInputAsset.deleteMany({ where: { ownerEmail } });
    await prisma.mediaCleanupTask.deleteMany({ where: { ownerEmail } });
    await prisma.mediaAsset.deleteMany({ where: { ownerEmail } });
  });

  it("releases upload intents when a preparing submission expires", async () => {
    const requestId = `expired-${suffix}`;
    await prisma.generationSubmission.create({
      data: {
        requestId,
        ownerEmail,
        scope: `session:${ownerEmail}`,
        idempotencyHash: `expired-key-${suffix}`,
        payloadHash: `expired-payload-${suffix}`,
        state: "preparing",
        expiresAt: new Date(now.getTime() - 1),
      },
    });
    const task = await createStorageCleanupIntent(undefined, {
      ownerEmail,
      requestId,
      storageProvider: "leemage",
      storageObjectId: `expired-upload-${suffix}`,
      reason: "upload_session",
      now,
      retryAt: new Date(now.getTime() + 60_000),
    });

    await expect(expireStaleSubmissions(now, 10)).resolves.toBe(1);
    await expect(prisma.generationSubmission.findUnique({ where: { requestId } })).resolves.toMatchObject({ state: "expired" });
    await expect(prisma.mediaCleanupTask.findUnique({ where: { id: task.id } })).resolves.toMatchObject({
      status: "pending",
      reason: "submission_failed",
      retryAt: now,
    });
    await prisma.mediaCleanupTask.delete({ where: { id: task.id } });
    await prisma.generationSubmission.delete({ where: { requestId } });
  });

  it("allows one concurrent claimant and recovers a stale lease", async () => {
    const task = await queueStorageCleanup(undefined, {
      ownerEmail,
      storageProvider: "leemage",
      storageObjectId: `concurrent-${suffix}`,
      storageUrl: `https://storage.example/concurrent-${suffix}`,
      reason: "submission_failed",
      now,
    });

    const [first, second] = await Promise.all([
      claimStorageCleanups(now, 1),
      claimStorageCleanups(now, 1),
    ]);
    expect(first.length + second.length).toBe(1);
    const claimed = first[0] ?? second[0];
    expect(claimed).toMatchObject({ id: task.id, status: "processing", attempts: 1 });

    await prisma.mediaCleanupTask.update({
      where: { id: task.id },
      data: { leaseUntil: new Date(now.getTime() - 1) },
    });
    const recovered = await claimStorageCleanups(now, 1);
    expect(recovered).toHaveLength(1);
    expect(recovered[0]).toMatchObject({ id: task.id, status: "processing", attempts: 2 });
    await prisma.mediaCleanupTask.delete({ where: { id: task.id } });
  });

  it("moves repeated failures to an operator-visible terminal state", async () => {
    const task = await queueStorageCleanup(undefined, {
      ownerEmail,
      storageProvider: "leemage",
      storageObjectId: `retry-${suffix}`,
      reason: "submission_failed",
      now,
    });
    let retryAt = now;
    for (let attempt = 1; attempt <= MEDIA_CLEANUP_MAX_ATTEMPTS; attempt += 1) {
      const claimed = await claimStorageCleanups(retryAt, 1);
      expect(claimed).toHaveLength(1);
      expect(claimed[0].id).toBe(task.id);
      await failStorageCleanup(
        { id: task.id, leaseToken: claimed[0].leaseToken!, attempts: claimed[0].attempts },
        new Error("remote unavailable"),
        retryAt,
      );
      const state = await prisma.mediaCleanupTask.findUnique({ where: { id: task.id } });
      retryAt = state?.retryAt ?? new Date(retryAt.getTime() + 60 * 60 * 60_000);
    }
    await expect(
      prisma.mediaCleanupTask.findUnique({ where: { id: task.id } }),
    ).resolves.toMatchObject({ status: "failed", attempts: MEDIA_CLEANUP_MAX_ATTEMPTS, lastError: "MEDIA_CLEANUP_FAILED" });
  });

  it("protects a referenced asset and deletes an unreferenced failed submission", async () => {
    const referencedAsset = await prisma.mediaAsset.create({
      data: {
        ownerEmail,
        type: "image",
        origin: "upload",
        storageProvider: "leemage",
        storageObjectId: `referenced-${suffix}`,
        storageUrl: `https://storage.example/referenced-${suffix}`,
        mimeType: "image/png",
        bytes: BigInt(10),
      },
    });
    await prisma.generationInputAsset.create({
      data: {
        requestId: `request-${suffix}`,
        generationType: "image",
        ownerEmail,
        field: "initImages",
        assetId: referencedAsset.id,
      },
    });
    const protectedTask = await queueStorageCleanup(undefined, {
      ownerEmail,
      requestId: `request-${suffix}`,
      storageProvider: "leemage",
      storageObjectId: referencedAsset.storageObjectId,
      storageUrl: referencedAsset.storageUrl,
      reason: "submission_failed",
      assetId: referencedAsset.id,
      now,
    });
    const protectedClaim = (await claimStorageCleanups(now, 1)).find((item) => item.id === protectedTask.id);
    expect(protectedClaim).toBeDefined();
    const deleteSpy = vi.fn().mockResolvedValue(undefined);
    const storage = { name: "leemage" as const, assertAvailable() {}, presign: vi.fn(), confirm: vi.fn(), inspect: vi.fn(), resolveReadUrl: vi.fn(), delete: deleteSpy };
    await processStorageCleanupTask(protectedClaim!, storage);
    expect(deleteSpy).not.toHaveBeenCalled();
    await expect(prisma.mediaCleanupTask.findUnique({ where: { id: protectedTask.id } })).resolves.toMatchObject({ status: "linked" });

    await prisma.generationInputAsset.deleteMany({ where: { assetId: referencedAsset.id } });
    const orphan = await prisma.mediaAsset.create({
      data: {
        ownerEmail,
        type: "image",
        origin: "upload",
        storageProvider: "leemage",
        storageObjectId: `orphan-${suffix}`,
        storageUrl: `https://storage.example/orphan-${suffix}`,
        mimeType: "image/png",
        bytes: BigInt(10),
      },
    });
    const orphanTask = await queueStorageCleanup(undefined, {
      ownerEmail,
      storageProvider: "leemage",
      storageObjectId: orphan.storageObjectId,
      storageUrl: orphan.storageUrl,
      reason: "submission_failed",
      assetId: orphan.id,
      now,
    });
    const orphanClaim = (await claimStorageCleanups(now, 2)).find((item) => item.id === orphanTask.id);
    expect(orphanClaim).toBeDefined();
    await processStorageCleanupTask(orphanClaim!, storage);
    expect(deleteSpy).toHaveBeenCalledWith(orphan.storageObjectId);
    await expect(prisma.mediaAsset.findUnique({ where: { id: orphan.id } })).resolves.toBeNull();
    await expect(prisma.mediaCleanupTask.findUnique({ where: { id: orphanTask.id } })).resolves.toMatchObject({ status: "completed" });
  });
});
