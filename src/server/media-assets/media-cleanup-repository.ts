import { Prisma } from "@prisma/client";
import { randomUUID } from "node:crypto";

import { prisma } from "@/server/db/prisma";

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

export type CleanupClient = Pick<Prisma.TransactionClient, "mediaCleanupTask">;

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

function db(client?: CleanupClient): CleanupClient {
  return client ?? prisma;
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

/** Registers an object before its remote upload starts. */
export async function createStorageCleanupIntent(
  client: CleanupClient | undefined,
  input: StorageCleanupIntent,
) {
  const now = input.now ?? new Date();
  return db(client).mediaCleanupTask.upsert({
    where: identity(input),
    create: {
      ownerEmail: input.ownerEmail ?? null,
      requestId: input.requestId ?? null,
      storageProvider: input.storageProvider,
      storageObjectId: input.storageObjectId,
      storageUrl: input.storageUrl ?? null,
      reason: input.reason,
      assetId: input.assetId ?? null,
      status: "uploading",
      retryAt: input.retryAt ?? cleanupUploadRetryAt(now),
    },
    update: {
      ownerEmail: input.ownerEmail ?? undefined,
      requestId: input.requestId ?? undefined,
      storageUrl: input.storageUrl ?? undefined,
      reason: input.reason,
      assetId: input.assetId ?? undefined,
      status: "uploading",
      attempts: 0,
      retryAt: input.retryAt ?? cleanupUploadRetryAt(now),
      leaseToken: null,
      leaseUntil: null,
      lastError: null,
    },
  });
}

/** Makes an already-created intent eligible for remote deletion. */
export async function queueStorageCleanup(
  client: CleanupClient | undefined,
  input: StorageCleanupIntent,
) {
  const now = input.now ?? new Date();
  return db(client).mediaCleanupTask.upsert({
    where: identity(input),
    create: {
      ownerEmail: input.ownerEmail ?? null,
      requestId: input.requestId ?? null,
      storageProvider: input.storageProvider,
      storageObjectId: input.storageObjectId,
      storageUrl: input.storageUrl ?? null,
      reason: input.reason,
      assetId: input.assetId ?? null,
      status: "pending",
      retryAt: input.retryAt ?? now,
    },
    update: {
      ownerEmail: input.ownerEmail ?? undefined,
      requestId: input.requestId ?? undefined,
      storageUrl: input.storageUrl ?? undefined,
      reason: input.reason,
      assetId: input.assetId ?? undefined,
      status: "pending",
      attempts: 0,
      retryAt: input.retryAt ?? now,
      leaseToken: null,
      leaseUntil: null,
      lastError: null,
    },
  });
}

/** Links the intent and the durable asset in one caller-owned transaction. */
export async function linkStorageCleanupToAsset(
  client: CleanupClient | undefined,
  input: StorageCleanupIntent & { assetId: string },
) {
  const now = input.now ?? new Date();
  return db(client).mediaCleanupTask.upsert({
    where: identity(input),
    create: {
      ownerEmail: input.ownerEmail ?? null,
      requestId: input.requestId ?? null,
      storageProvider: input.storageProvider,
      storageObjectId: input.storageObjectId,
      storageUrl: input.storageUrl ?? null,
      reason: input.reason,
      assetId: input.assetId,
      status: "linked",
      retryAt: now,
    },
    update: {
      ownerEmail: input.ownerEmail ?? undefined,
      requestId: input.requestId ?? undefined,
      storageUrl: input.storageUrl ?? undefined,
      reason: input.reason,
      assetId: input.assetId,
      status: "linked",
      retryAt: now,
      leaseToken: null,
      leaseUntil: null,
      lastError: null,
    },
  });
}

export async function completeStorageCleanup(
  client: CleanupClient | undefined,
  input: { id?: string; storageProvider?: string; storageObjectId?: string },
) {
  const task = db(client).mediaCleanupTask;
  const data = { status: "completed" as const, leaseToken: null, leaseUntil: null, lastError: null };
  if (input.id) {
    return task.updateMany({ where: { id: input.id }, data });
  }
  if (input.storageProvider && input.storageObjectId) {
    return task.updateMany({
      where: {
        storageProvider: input.storageProvider,
        storageObjectId: input.storageObjectId,
      },
      data,
    });
  }
  return { count: 0 };
}

/** Failed/expired submissions release their upload intents for reconciliation. */
export async function releaseStorageCleanupsForRequest(
  client: CleanupClient | undefined,
  requestId: string,
  now = new Date(),
) {
  return db(client).mediaCleanupTask.updateMany({
    where: {
      requestId,
      status: { in: ["uploading", "linked"] },
    },
    data: {
      status: "pending",
      reason: "submission_failed",
      attempts: 0,
      retryAt: now,
      leaseToken: null,
      leaseUntil: null,
      lastError: null,
    },
  });
}

export async function claimStorageCleanups(
  now = new Date(),
  limit = 20,
): Promise<ClaimedStorageCleanup[]> {
  return prisma.$transaction(async (tx) => {
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

/** Operator or a scheduled repair can make terminal failures retryable. */
export async function requeueFailedStorageCleanups(limit = 100) {
  const tasks = await prisma.mediaCleanupTask.findMany({
    where: { status: "failed" },
    orderBy: [{ updatedAt: "asc" }, { id: "asc" }],
    take: limit,
    select: { id: true },
  });
  if (tasks.length === 0) return 0;
  const result = await prisma.mediaCleanupTask.updateMany({
    where: { id: { in: tasks.map((task) => task.id) }, status: "failed" },
    data: { status: "pending", attempts: 0, retryAt: new Date(), lastError: null },
  });
  return result.count;
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
