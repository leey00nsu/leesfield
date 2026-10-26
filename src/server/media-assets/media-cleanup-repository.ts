import { Prisma, type MediaCleanupTask } from "@prisma/client";
import { randomUUID } from "node:crypto";

import { prisma } from "@/server/db/prisma";
import { withQueueTransaction, lockQueueTransaction } from "@/server/job-queue/job-queue-transaction";
import { enqueueQueueJobTx, queueScopeDigest } from "@/server/job-queue/job-queue-registration";
import { QueueContractError } from "@/server/job-queue/contracts";

export const MEDIA_CLEANUP_MAX_ATTEMPTS = 5;
export const MEDIA_CLEANUP_LEASE_MS = 60_000;
export const MEDIA_CLEANUP_UPLOAD_GRACE_MS = 15 * 60_000;
export const MEDIA_CLEANUP_RETRY_BASE_MS = 60_000;
export const MEDIA_CLEANUP_RETRY_MAX_MS = 60 * 60_000;

export type MediaCleanupReason =
  | "upload_session"
  | "upload_failed"
  | "generation_input"
  | "generation_output"
  | "media_operation_output"
  | "asset_delete"
  | "history_delete"
  | "submission_failed"
  | "expired_upload";

export type CleanupClient = Prisma.TransactionClient;

export function isCleanupClient(client: unknown): client is CleanupClient {
  return Boolean(client && typeof client === "object" && "mediaCleanupTask" in client);
}

export type StorageCleanupIntent = {
  ownerEmail?: string | null;
  requestId?: string | null;
  storageProvider: string;
  storageObjectId: string;
  storageUrl?: string | null;
  reason: MediaCleanupReason;
  assetId?: string | null;
  now?: Date;
  retryAt?: Date;
};

export type ClaimedStorageCleanup = Prisma.MediaCleanupTaskGetPayload<{
  include: {
    asset: {
      select: {
        id: true;
        ownerEmail: true;
        status: true;
        storageProvider: true;
        storageObjectId: true;
        storageUrl: true;
        legacyUrl: true;
      };
    };
  };
}>;

function inCleanupTransaction<T>(client: CleanupClient | undefined, run: (tx: CleanupClient) => Promise<T>) {
  return client ? run(client) : withQueueTransaction(run);
}

function retryDelayMs(attempt: number) {
  return Math.min(
    MEDIA_CLEANUP_RETRY_MAX_MS,
    MEDIA_CLEANUP_RETRY_BASE_MS * 2 ** Math.max(0, attempt - 1),
  );
}

export function cleanupRetryAt(now: Date, attempt: number) {
  return new Date(now.getTime() + retryDelayMs(attempt));
}

export function cleanupUploadRetryAt(now: Date, uploadExpiresAt?: Date) {
  const graceAt = new Date(now.getTime() + MEDIA_CLEANUP_UPLOAD_GRACE_MS);
  if (!uploadExpiresAt) return graceAt;
  return new Date(Math.max(graceAt.getTime(), uploadExpiresAt.getTime()));
}

/** Keeps provider errors, URLs, and credentials out of the cleanup ledger. */
export function safeCleanupError(error: unknown) {
  if (error instanceof Error && /^[A-Z0-9_]+$/.test(error.message)) {
    return error.message.slice(0, 120);
  }
  return "MEDIA_CLEANUP_FAILED";
}

function identity(input: Pick<StorageCleanupIntent, "storageProvider" | "storageObjectId">) {
  return {
    storageProvider_storageObjectId: {
      storageProvider: input.storageProvider,
      storageObjectId: input.storageObjectId,
    },
  };
}

/** New revisions fence earlier cleanup work; active deletion cannot be relinked. */
async function changeIntent(tx: CleanupClient, input: StorageCleanupIntent, status: "uploading" | "pending" | "linked") {
  await lockQueueTransaction(tx);
  const old = await tx.mediaCleanupTask.findUnique({ where: identity(input) });
  if (old) {
    const jobs = await tx.queueJob.findMany({ where: { sourceType: "storage_cleanup", sourceId: old.id,
      OR: [
        { status: { in: ["active", "reconciliation_required", "dead_letter"] } },
        { attempts: { some: { reservations: { some: { releasedAt: null } } } } },
      ] } });
    if (jobs.length) throw new QueueContractError("QUEUE_CLEANUP_REQUIRES_OPERATOR");
    await tx.queueJob.updateMany({ where: { sourceType: "storage_cleanup", sourceId: old.id,
      status: { in: ["ready", "suspended", "retry_wait"] } }, data: { status: "cancelled", version: { increment: 1 } } });
  }
  const now = input.now ?? new Date();
  const task = await tx.mediaCleanupTask.upsert({
    where: identity(input),
    create: { ownerEmail: input.ownerEmail ?? null, requestId: input.requestId ?? null,
      storageProvider: input.storageProvider, storageObjectId: input.storageObjectId,
      storageUrl: input.storageUrl ?? null, reason: input.reason, assetId: input.assetId ?? null,
      status, retryAt: input.retryAt ?? (status === "uploading" ? cleanupUploadRetryAt(now) : now) },
    update: { ownerEmail: input.ownerEmail ?? undefined, requestId: input.requestId ?? undefined,
      storageUrl: input.storageUrl ?? undefined, reason: input.reason, assetId: input.assetId ?? undefined,
      status, retryAt: input.retryAt ?? (status === "uploading" ? cleanupUploadRetryAt(now) : now),
      attempts: 0, leaseToken: null, leaseUntil: null, lastError: null, queueRevision: { increment: 1 } },
  });
  // Protection is a durable storage ledger, not executable queue work.
  if (status === "pending") await enqueueCleanupTaskTx(tx, task);
  return task;
}

async function enqueueCleanupTaskTx(tx: CleanupClient, task: MediaCleanupTask) {
  return enqueueQueueJobTx(tx, {
    kind: "storage_cleanup", source: { type: "storage_cleanup", id: task.id, revision: task.queueRevision },
    snapshotRef: "cleanup:" + task.id + ":" + task.queueRevision,
    ownerScopeDigest: queueScopeDigest(task.ownerEmail ?? "storage:" + task.storageProvider),
    availableAt: task.retryAt,
  });
}
export function createStorageCleanupIntent(client: CleanupClient | undefined, input: StorageCleanupIntent) {
  return inCleanupTransaction(client, tx => changeIntent(tx, input, "uploading"));
}
export function queueStorageCleanup(client: CleanupClient | undefined, input: StorageCleanupIntent) {
  return inCleanupTransaction(client, tx => changeIntent(tx, input, "pending"));
}
export function linkStorageCleanupToAsset(client: CleanupClient | undefined, input: StorageCleanupIntent & { assetId: string }) {
  return inCleanupTransaction(client, tx => changeIntent(tx, input, "linked"));
}
export function completeStorageCleanup(client: CleanupClient | undefined,
  input: { id?: string; storageProvider?: string; storageObjectId?: string }) {
  return inCleanupTransaction(client, async tx => {
    await lockQueueTransaction(tx);
    const where = input.id ? { id: input.id } : input.storageProvider && input.storageObjectId
      ? { storageProvider: input.storageProvider, storageObjectId: input.storageObjectId } : { id: "" };
    const tasks = await tx.mediaCleanupTask.findMany({ where });
    const ids = tasks.map(t => t.id);
    if (await tx.queueJob.count({ where: { sourceType: "storage_cleanup", sourceId: { in: ids },
      status: { in: ["active", "reconciliation_required"] } } })) throw new QueueContractError("QUEUE_CLEANUP_REQUIRES_OPERATOR");
    await tx.queueJob.updateMany({ where: { sourceType: "storage_cleanup", sourceId: { in: ids },
      status: { in: ["ready", "retry_wait", "suspended"] } }, data: { status: "cancelled", version: { increment: 1 } } });
    return tx.mediaCleanupTask.updateMany({ where, data: { status: "completed", leaseToken: null, leaseUntil: null, lastError: null } });
  });
}
export function releaseStorageCleanupsForRequest(client: CleanupClient | undefined, requestId: string, now = new Date()) {
  return inCleanupTransaction(client, async tx => {
    await lockQueueTransaction(tx);
    const tasks = await tx.mediaCleanupTask.findMany({ where: { requestId, status: { in: ["uploading", "linked"] } } });
    for (const task of tasks) await changeIntent(tx, { ...task, reason: "submission_failed", now, retryAt: now }, "pending");
    return { count: tasks.length };
  });
}

/** Grace expiry keeps the revision and never reclaims active remote deletion. */
export function activateExpiredCleanupIntents(now = new Date(), limit = 100) {
  return withQueueTransaction(async tx => {
    const tasks = await tx.mediaCleanupTask.findMany({ where: { status: "uploading", retryAt: { lte: now } },
      orderBy: [{ retryAt: "asc" }, { id: "asc" }], take: limit });
    for (const task of tasks) {
      await tx.mediaCleanupTask.update({ where: { id: task.id }, data: { status: "pending" } });
      // New intents have no QueueJob. Old deployments may have a suspended one.
      // Both paths retain the revision and converge under the same queue lock.
      await enqueueCleanupTaskTx(tx, task);
      await tx.queueJob.updateMany({ where: { sourceType: "storage_cleanup", sourceId: task.id, sourceRevision: task.queueRevision, status: "suspended" },
        data: { status: "ready", availableAt: now, version: { increment: 1 } } });
    }
    return tasks.length;
  });
}

/** Retire old protective jobs only when a valid, same-owner asset is proven.
 * No file or ledger is deleted; unlinked/uncertain/ordered work stays untouched.
 */
export function retireLinkedStorageCleanupJobs(limit = 100) {
  return withQueueTransaction(async tx => {
    const rows = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT j.id FROM "QueueJob" j
      JOIN "MediaCleanupTask" t ON t.id = j."sourceId" AND t."queueRevision" = j."sourceRevision"
      JOIN "MediaAsset" a ON a."storageProvider" = t."storageProvider"
        AND a."storageObjectId" = t."storageObjectId" AND a."ownerEmail" = t."ownerEmail"
      WHERE j.kind = 'storage_cleanup' AND j."sourceType" = 'storage_cleanup'
        AND j.status = 'suspended' AND j."currentAttemptId" IS NULL AND j."orderGroupId" IS NULL
        AND t.status = 'linked' AND t.attempts = 0 AND t."leaseToken" IS NULL AND t."leaseUntil" IS NULL
        AND a.status = 'completed' AND (t."assetId" IS NULL OR t."assetId" = a.id)
        AND NOT EXISTS (SELECT 1 FROM "QueueJob" other WHERE other."sourceType" = 'storage_cleanup'
          AND other."sourceId" = t.id AND (other.status IN ('active','dead_letter','reconciliation_required')
            OR EXISTS (SELECT 1 FROM "QueueAttempt" p WHERE p."jobId" = other.id
              AND (p."finishedAt" IS NULL OR EXISTS (SELECT 1 FROM "QueueReservation" r
                WHERE r."attemptId" = p.id AND r."releasedAt" IS NULL)))
            OR EXISTS (SELECT 1 FROM "QueueDeadLetter" d WHERE d."jobId" = other.id AND d.state IN ('open','redriven'))))
      ORDER BY j."createdAt", j.id LIMIT ${Math.max(1, Math.min(100, Math.trunc(limit) || 100))}
      FOR UPDATE OF j`);
    return tx.queueJob.updateMany({ where: { id: { in: rows.map(row => row.id) }, status: "suspended" },
      data: { status: "cancelled", version: { increment: 1 } } });
  });
}

export async function claimStorageCleanups(
  now = new Date(),
  limit = 20,
): Promise<ClaimedStorageCleanup[]> {
  return prisma.$transaction(async (tx) => {
    if ((await tx.queueRuntime.findUnique({ where: { id: 1 } }))?.mode === "shared") return [];
    await tx.mediaCleanupTask.updateMany({
      where: { status: "processing", leaseUntil: { lte: now } },
      data: { status: "pending", retryAt: now, leaseToken: null, leaseUntil: null },
    });
    await tx.mediaCleanupTask.updateMany({
      where: { status: "uploading", retryAt: { lte: now } },
      data: { status: "pending", retryAt: now, leaseToken: null, leaseUntil: null },
    });

    const candidates = await tx.mediaCleanupTask.findMany({
      where: {
        status: "pending",
        retryAt: { lte: now },
        attempts: { lt: MEDIA_CLEANUP_MAX_ATTEMPTS },
      },
      orderBy: [{ retryAt: "asc" }, { id: "asc" }],
      take: limit,
      select: { id: true },
    });
    const claimed: ClaimedStorageCleanup[] = [];
    for (const candidate of candidates) {
      const token = randomUUID();
      const updated = await tx.mediaCleanupTask.updateMany({
        where: {
          id: candidate.id,
          status: "pending",
          retryAt: { lte: now },
          attempts: { lt: MEDIA_CLEANUP_MAX_ATTEMPTS },
        },
        data: {
          status: "processing",
          attempts: { increment: 1 },
          leaseToken: token,
          leaseUntil: new Date(now.getTime() + MEDIA_CLEANUP_LEASE_MS),
        },
      });
      if (updated.count !== 1) continue;
      const task = await tx.mediaCleanupTask.findUnique({
        where: { id: candidate.id },
        include: {
          asset: {
            select: {
              id: true,
              ownerEmail: true,
              status: true,
              storageProvider: true,
              storageObjectId: true,
              storageUrl: true,
              legacyUrl: true,
            },
          },
        },
      });
      if (task) claimed.push(task);
    }
    return claimed;
  });
}

export async function failStorageCleanup(
  input: { id: string; leaseToken: string; attempts: number },
  error: unknown,
  now = new Date(),
) {
  const terminal = input.attempts >= MEDIA_CLEANUP_MAX_ATTEMPTS;
  return prisma.mediaCleanupTask.updateMany({
    where: { id: input.id, status: "processing", leaseToken: input.leaseToken },
    data: {
      status: terminal ? "failed" : "pending",
      retryAt: terminal ? now : cleanupRetryAt(now, input.attempts),
      lastError: safeCleanupError(error),
      leaseToken: null,
      leaseUntil: null,
    },
  });
}

/** Redrive requires an authenticated operator request and preserved DLQ history. */
export async function requeueFailedStorageCleanups(limit = 100): Promise<number> {
  void limit;
  throw new QueueContractError("QUEUE_USE_DLQ_REDRIVE");
}

export async function queueExpiredUploadCleanup(
  client: CleanupClient | undefined,
  input: {
    ownerEmail: string;
    requestId?: string | null;
    storageProvider: string;
    storageObjectId: string;
    storageUrl?: string | null;
    now: Date;
  },
) {
  return queueStorageCleanup(client, {
    ...input,
    reason: "expired_upload",
    retryAt: input.now,
  });
}
