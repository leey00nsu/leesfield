import { Prisma } from "@prisma/client";
import { randomUUID } from "node:crypto";

import { prisma } from "@/server/db/prisma";

export type GenerationMediaType = "image" | "video" | "audio";

export type GenerationLease = {
  token: string;
  version: number;
};

export type ClaimedGeneration = {
  id: string;
  requestId: string;
  prompt: string;
  requestParams: unknown;
  modelKey: string | null;
  status: string;
  progress: number;
  ownerEmail: string | null;
  graphNodeId: string | null;
  imageCount?: number | null;
  steps?: number | null;
  seed?: string | null;
  executionLeaseToken: string;
  executionLeaseUntil: Date;
  executionLeaseVersion: number;
};

export type ClaimPendingGenerationJobsInput = {
  mediaType: GenerationMediaType;
  modelKeys: string[];
  defaultKey: string;
  getModelLimit: (modelKey: string) => number;
  scanLimit?: number;
  globalLimit?: number;
  maxClaims?: number;
  now?: Date;
};

export const GENERATION_EXECUTION_GLOBAL_LIMIT = 4;
export const GENERATION_EXECUTION_LEASE_MS = 60_000;
export const GENERATION_EXECUTION_HEARTBEAT_MS = 10_000;
export const GENERATION_EXECUTION_SCAN_LIMIT = 60;

const EXECUTION_ADVISORY_LOCK_KEY = 2_147_483_641;
const ACTIVE_STATUSES = ["processing", "uploading"] as const;

type TransactionGenerationModel = Prisma.TransactionClient["imageGeneration"];

function generationModel(
  client: Prisma.TransactionClient,
  mediaType: GenerationMediaType,
): TransactionGenerationModel {
  if (mediaType === "image") return client.imageGeneration;
  if (mediaType === "video") return client.videoGeneration as unknown as TransactionGenerationModel;
  return client.audioGeneration as unknown as TransactionGenerationModel;
}

function activeGenerationWhere(now: Date) {
  return {
    status: { in: [...ACTIVE_STATUSES] },
    executionLeaseToken: { not: null },
    executionLeaseUntil: { gt: now },
  };
}

function recoverableGenerationWhere(now: Date) {
  return {
    status: { in: [...ACTIVE_STATUSES] },
    OR: [
      { executionLeaseToken: null },
      { executionLeaseUntil: null },
      { executionLeaseUntil: { lte: now } },
    ],
  };
}

async function recoverGenerationRows(
  client: Prisma.TransactionClient,
  mediaType: GenerationMediaType,
  now: Date,
) {
  const model = generationModel(client, mediaType);
  const where = recoverableGenerationWhere(now);

  await model.updateMany({
    where: { ...where, cancelRequestedAt: { not: null } },
    data: {
      status: "cancelled",
      progress: 0,
      errorMessage: null,
      executionLeaseToken: null,
      executionLeaseUntil: null,
    },
  });
  await model.updateMany({
    where: {
      ...where,
      cancelRequestedAt: null,
      OR: [
        { executionLeaseToken: null },
        { executionLeaseUntil: null },
      ],
    },
    data: {
      status: "failed",
      progress: 0,
      errorMessage: "EXECUTION_LEASE_RECOVERY_REQUIRED",
      executionLeaseToken: null,
      executionLeaseUntil: null,
    },
  });
  await model.updateMany({
    where: {
      ...where,
      cancelRequestedAt: null,
      executionLeaseToken: { not: null },
      executionLeaseUntil: { lte: now },
    },
    data: {
      status: "failed",
      progress: 0,
      errorMessage: "EXECUTION_LEASE_EXPIRED",
      executionLeaseToken: null,
      executionLeaseUntil: null,
    },
  });
}

async function recoverAllGenerationRows(
  client: Prisma.TransactionClient,
  now: Date,
) {
  await recoverGenerationRows(client, "image", now);
  await recoverGenerationRows(client, "video", now);
  await recoverGenerationRows(client, "audio", now);
}

async function countActiveGenerationRows(
  client: Prisma.TransactionClient,
  now: Date,
) {
  const where = activeGenerationWhere(now);
  const image = await client.imageGeneration.count({ where });
  const video = await client.videoGeneration.count({ where });
  const audio = await client.audioGeneration.count({ where });
  return image + video + audio;
}

async function listActiveModelRows(
  client: Prisma.TransactionClient,
  mediaType: GenerationMediaType,
  now: Date,
) {
  return generationModel(client, mediaType).findMany({
    where: activeGenerationWhere(now),
    select: { modelKey: true, requestParams: true },
  });
}

function resolveStoredConcurrentLimit(meta: unknown) {
  if (meta && typeof meta === "object" && !Array.isArray(meta)) {
    const value = (meta as Record<string, unknown>).concurrent_limit;
    if (typeof value === "number" && Number.isFinite(value) && value > 0) {
      return Math.max(1, Math.floor(value));
    }
  }
  return 1;
}

async function listAuthoritativeModelLimits(
  client: Prisma.TransactionClient,
  modelKeys: string[],
) {
  const keys = [...new Set(modelKeys.filter((key) => key.length > 0))];
  if (keys.length === 0) return new Map<string, number>();

  const rows = await client.modelCatalog.findMany({
    where: { key: { in: keys } },
    select: { key: true, meta: true },
  });
  return new Map(rows.map((row) => [row.key, resolveStoredConcurrentLimit(row.meta)]));
}

export function resolveGenerationModelKey(
  modelKey: string | null | undefined,
  requestParams: unknown,
  modelKeys: string[],
  defaultKey: string,
) {
  if (typeof modelKey === "string" && modelKeys.includes(modelKey)) {
    return modelKey;
  }
  if (requestParams && typeof requestParams === "object") {
    const requested = (requestParams as Record<string, unknown>).model;
    if (typeof requested === "string" && modelKeys.includes(requested)) {
      return requested;
    }
  }
  return defaultKey;
}

async function claimOneGeneration(
  client: Prisma.TransactionClient,
  mediaType: GenerationMediaType,
  id: string,
  now: Date,
) {
  const model = generationModel(client, mediaType);
  const token = randomUUID();
  const leaseUntil = new Date(now.getTime() + GENERATION_EXECUTION_LEASE_MS);
  const updated = await model.updateMany({
    where: {
      id,
      status: "pending",
      executionLeaseToken: null,
      executionLeaseUntil: null,
    },
    data: {
      status: "processing",
      progress: 92,
      executionLeaseToken: token,
      executionLeaseUntil: leaseUntil,
      executionLeaseVersion: { increment: 1 },
    },
  });
  if (updated.count !== 1) return null;

  const record = await model.findUnique({ where: { id } });
  if (!record) return null;
  return record as unknown as ClaimedGeneration;
}

/**
 * Claims pending work while holding one short PostgreSQL transaction lock.
 * The lock serializes the cross-table global/model accounting; provider and
 * storage I/O happens after this function returns.
 */
export async function claimPendingGenerationJobs({
  mediaType,
  modelKeys,
  defaultKey,
  getModelLimit,
  scanLimit = GENERATION_EXECUTION_SCAN_LIMIT,
  globalLimit = GENERATION_EXECUTION_GLOBAL_LIMIT,
  maxClaims = globalLimit,
  now = new Date(),
}: ClaimPendingGenerationJobsInput): Promise<ClaimedGeneration[]> {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw(
      Prisma.sql`SELECT pg_advisory_xact_lock(${EXECUTION_ADVISORY_LOCK_KEY})`,
    );
    await recoverAllGenerationRows(tx, now);

    const claimLimit = Math.max(0, Math.floor(maxClaims));
    if (claimLimit === 0) return [];

    let globalUsed = await countActiveGenerationRows(tx, now);
    if (globalUsed >= globalLimit) return [];

    const activeRows = await listActiveModelRows(tx, mediaType, now);
    const modelUsed = new Map<string, number>();
    for (const row of activeRows) {
      const key = resolveGenerationModelKey(
        row.modelKey,
        row.requestParams,
        modelKeys,
        defaultKey,
      );
      modelUsed.set(key, (modelUsed.get(key) ?? 0) + 1);
    }

    // Runtime catalog data is process-local and may be stale on another
    // instance. Read the current model limit in the same transaction as the
    // claim so a config update cannot be bypassed by an old cache.
    const authoritativeModelLimits = await listAuthoritativeModelLimits(
      tx,
      modelKeys,
    );

    const model = generationModel(tx, mediaType);
    const pending = await model.findMany({
      where: {
        status: "pending",
        executionLeaseToken: null,
        executionLeaseUntil: null,
      },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      take: Math.max(1, Math.min(scanLimit, GENERATION_EXECUTION_SCAN_LIMIT)),
    });

    const claimed: ClaimedGeneration[] = [];
    for (const candidate of pending) {
      if (globalUsed >= globalLimit || claimed.length >= claimLimit) break;
      const key = resolveGenerationModelKey(
        candidate.modelKey,
        candidate.requestParams,
        modelKeys,
        defaultKey,
      );
      const used = modelUsed.get(key) ?? 0;
      const limit = authoritativeModelLimits.has(key)
        ? authoritativeModelLimits.get(key)!
        : Math.max(0, Math.floor(getModelLimit(key)));
      if (used >= limit) continue;

      const record = await claimOneGeneration(tx, mediaType, candidate.id, now);
      if (!record) continue;
      claimed.push(record);
      globalUsed += 1;
      modelUsed.set(key, used + 1);
    }
    return claimed;
  });
}

export class GenerationLeaseLostError extends Error {
  readonly mediaType: GenerationMediaType;
  readonly generationId: string;

  constructor(mediaType: GenerationMediaType, generationId: string) {
    super("GENERATION_LEASE_LOST");
    this.name = "GenerationLeaseLostError";
    this.mediaType = mediaType;
    this.generationId = generationId;
  }
}

export function isGenerationLeaseLost(error: unknown): error is GenerationLeaseLostError {
  return error instanceof GenerationLeaseLostError;
}

export function requireGenerationLease(record: {
  executionLeaseToken?: string | null;
  executionLeaseVersion?: number | null;
}, mediaType: GenerationMediaType, generationId: string) {
  if (
    typeof record.executionLeaseToken !== "string" ||
    !record.executionLeaseToken ||
    typeof record.executionLeaseVersion !== "number" ||
    !Number.isSafeInteger(record.executionLeaseVersion) ||
    record.executionLeaseVersion < 1
  ) {
    throw new GenerationLeaseLostError(mediaType, generationId);
  }
  return {
    token: record.executionLeaseToken,
    version: record.executionLeaseVersion,
  } satisfies GenerationLease;
}

export async function renewGenerationLease(
  mediaType: GenerationMediaType,
  generationId: string,
  lease: GenerationLease,
  now = new Date(),
) {
  const model = mediaType === "image"
    ? prisma.imageGeneration
    : mediaType === "video"
      ? prisma.videoGeneration
      : prisma.audioGeneration;
  const updated = await (model.updateMany as typeof prisma.imageGeneration.updateMany)({
    where: {
      id: generationId,
      status: { in: [...ACTIVE_STATUSES] },
      executionLeaseToken: lease.token,
      executionLeaseVersion: lease.version,
      executionLeaseUntil: { gt: now },
    },
    data: {
      executionLeaseUntil: new Date(now.getTime() + GENERATION_EXECUTION_LEASE_MS),
    },
  });
  if (updated.count !== 1) {
    throw new GenerationLeaseLostError(mediaType, generationId);
  }
}

export type GenerationLeaseMonitor = {
  assertOwned(): void;
  stop(): void;
};

export function startGenerationLeaseMonitor(
  mediaType: GenerationMediaType,
  generationId: string,
  lease: GenerationLease,
): GenerationLeaseMonitor {
  let stopped = false;
  let lost: GenerationLeaseLostError | null = null;
  let renewal: Promise<void> | null = null;
  const interval = setInterval(() => {
    if (stopped || lost || renewal) return;
    renewal = renewGenerationLease(mediaType, generationId, lease).catch((error) => {
      lost = isGenerationLeaseLost(error)
        ? error
        : new GenerationLeaseLostError(mediaType, generationId);
    }).finally(() => {
      renewal = null;
    });
    void renewal;
  }, GENERATION_EXECUTION_HEARTBEAT_MS);
  interval.unref?.();

  return {
    assertOwned() {
      if (lost) throw lost;
    },
    stop() {
      if (stopped) return;
      stopped = true;
      clearInterval(interval);
    },
  };
}
