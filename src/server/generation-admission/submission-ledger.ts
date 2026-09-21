import { createHmac } from "node:crypto";

import { Prisma } from "@prisma/client";

import { prisma } from "@/server/db/prisma";
import { getServerEnv } from "@/server/runtime/env";
import { releaseStorageCleanupsForRequest } from "@/server/media-assets/media-cleanup-repository";

/**
 * Admission and idempotency ledger for generation submissions.
 *
 * A reservation is written before any file upload or provider call, inside one
 * transaction that also serializes admission decisions with a transaction-scoped
 * advisory lock. That keeps the queue budget exact across processes and lets a
 * retry reuse the request that is already in flight.
 */

export type SubmissionState =
  | "preparing"
  | "submitted"
  | "failed"
  | "expired";

export type AdmissionLimits = {
  globalPending: number;
  ownerPending: number;
  providerPending: number;
  reservationTtlMs: number;
};

export const DEFAULT_ADMISSION_LIMITS: AdmissionLimits = {
  globalPending: 100,
  ownerPending: 20,
  providerPending: 50,
  reservationTtlMs: 5 * 60 * 1000,
};

export type AdmissionRejectionReason =
  | "OWNER_LIMIT"
  | "GLOBAL_LIMIT"
  | "PROVIDER_LIMIT";

export type BeginSubmissionResult =
  | { kind: "created"; requestId: string }
  | {
      kind: "existing";
      requestId: string;
      state: SubmissionState;
    }
  | { kind: "conflict"; requestId: string }
  | {
      kind: "rejected";
      reason: AdmissionRejectionReason;
      pending: number;
    }
  | { kind: "model-unavailable" };

export type BeginSubmissionInput = {
  requestId: string;
  ownerEmail: string;
  apiKeyId?: string | null;
  idempotencyKey?: string | null;
  payloadHash: string;
  providerKey?: string | null;
  /** The model checked at the request boundary, using the DB as the source of truth. */
  modelKey?: string | null;
  modelType?: "image" | "video" | "audio";
  graphNodeId?: string | null;
  now?: Date;
  limits?: Partial<AdmissionLimits>;
};

const PENDING_STATUSES = ["pending", "processing", "uploading"] as const;

/** One bucket per credential so two API keys cannot share an idempotency key. */
export function submissionScope(
  ownerEmail: string,
  apiKeyId?: string | null,
): string {
  return apiKeyId ? "key:" + apiKeyId : "session:" + ownerEmail;
}

export function hashIdempotencyKey(scope: string, key: string): string {
  const pepper = getServerEnv().sessionPassword;
  return createHmac("sha256", pepper)
    .update(scope + "|idempotency|" + key)
    .digest("hex");
}

/**
 * Stable digest of the normalized submission inputs. Callers pass resolved file
 * identities (not volatile upload URLs) so an identical retry hashes equally.
 */
export function hashSubmissionPayload(payload: unknown): string {
  return createHmac("sha256", getServerEnv().sessionPassword)
    .update(canonicalJson(payload))
    .digest("hex");
}

export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value ?? null) ?? "null";
  }
  if (Array.isArray(value)) {
    return "[" + value.map((entry) => canonicalJson(entry)).join(",") + "]";
  }
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, entry]) => entry !== undefined)
    .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0));
  return (
    "{" +
    entries
      .map(
        ([key, entry]) =>
          JSON.stringify(key) + ":" + canonicalJson(entry),
      )
      .join(",") +
    "}"
  );
}

type AdmissionCounts = {
  global_count: number;
  owner_count: number;
  provider_count: number;
};

async function countPending(
  tx: Prisma.TransactionClient,
  ownerEmail: string,
  providerKey: string | null,
  now: Date,
): Promise<AdmissionCounts> {
  const rows = await tx.$queryRaw<AdmissionCounts[]>(Prisma.sql`
    WITH pending AS (
      SELECT "ownerEmail" AS owner_email, "modelKey" AS provider_key
        FROM "ImageGeneration" WHERE status IN (${PENDING_STATUSES[0]}, ${PENDING_STATUSES[1]}, ${PENDING_STATUSES[2]})
      UNION ALL
      SELECT "ownerEmail", "modelKey"
        FROM "VideoGeneration" WHERE status IN (${PENDING_STATUSES[0]}, ${PENDING_STATUSES[1]}, ${PENDING_STATUSES[2]})
      UNION ALL
      SELECT "ownerEmail", "modelKey"
        FROM "AudioGeneration" WHERE status IN (${PENDING_STATUSES[0]}, ${PENDING_STATUSES[1]}, ${PENDING_STATUSES[2]})
      UNION ALL
      SELECT "ownerEmail", "providerKey"
        FROM "GenerationSubmission"
        WHERE state = 'preparing' AND "expiresAt" > ${now}
    )
    SELECT
      count(*)::int AS global_count,
      count(*) FILTER (WHERE owner_email = ${ownerEmail})::int AS owner_count,
      count(*) FILTER (WHERE provider_key IS NOT NULL AND provider_key = ${providerKey})::int AS provider_count
    FROM pending
  `);
  return rows[0] ?? { global_count: 0, owner_count: 0, provider_count: 0 };
}

export type SubmissionLedgerSeam = {
  begin(input: BeginSubmissionInput): Promise<BeginSubmissionResult>;
  finalize(
    requestId: string,
    state: Exclude<SubmissionState, "preparing">,
  ): Promise<void>;
  expireStale(now: Date, limit: number): Promise<number>;
};

let ledgerOverride: SubmissionLedgerSeam | null = null;

/** Test seam: keeps route tests off the shared database. */
export function setSubmissionLedgerForTests(
  next: SubmissionLedgerSeam | null,
): void {
  ledgerOverride = next;
}

/** Small in-memory stand-in mirroring created/existing/conflict semantics. */
export function createInMemorySubmissionLedger(): SubmissionLedgerSeam {
  const rows = new Map<
    string,
    { requestId: string; payloadHash: string; state: SubmissionState }
  >();
  return {
    async begin(input) {
      const scope = submissionScope(input.ownerEmail, input.apiKeyId);
      const key = input.idempotencyKey
        ? scope + "|" + input.idempotencyKey
        : null;
      const existing = key ? rows.get(key) : undefined;
      if (existing && existing.state !== "expired") {
        if (existing.payloadHash !== input.payloadHash) {
          return { kind: "conflict" as const, requestId: existing.requestId };
        }
        if (existing.state === "failed") {
          existing.state = "preparing";
          return { kind: "created" as const, requestId: existing.requestId };
        }
        return {
          kind: "existing" as const,
          requestId: existing.requestId,
          state: existing.state,
        };
      }
      if (key) {
        rows.set(key, {
          requestId: input.requestId,
          payloadHash: input.payloadHash,
          state: "preparing",
        });
      }
      return { kind: "created" as const, requestId: input.requestId };
    },
    async finalize(requestId, state) {
      for (const row of rows.values()) {
        if (row.requestId === requestId) row.state = state;
      }
    },
    async expireStale() {
      return 0;
    },
  };
}

export async function beginSubmission(
  input: BeginSubmissionInput,
): Promise<BeginSubmissionResult> {
  if (ledgerOverride) return await ledgerOverride.begin(input);
  const limits: AdmissionLimits = {
    ...DEFAULT_ADMISSION_LIMITS,
    ...(input.limits ?? {}),
  };
  const now = input.now ?? new Date();
  const scope = submissionScope(input.ownerEmail, input.apiKeyId);
  const idempotencyHash = input.idempotencyKey
    ? hashIdempotencyKey(scope, input.idempotencyKey)
    : null;
  const expiresAt = new Date(now.getTime() + limits.reservationTtlMs);

  return await prisma.$transaction(async (tx) => {
    // Serializes admission across processes: counts and inserts stay consistent.
    await tx.$executeRaw(
      Prisma.sql`SELECT pg_advisory_xact_lock(hashtext('leesfield:generation-admission'))`,
    );

    let retryExisting: { id: string; requestId: string } | null = null;
    if (idempotencyHash) {
      const existing = await tx.generationSubmission.findUnique({
        where: {
          scope_idempotencyHash: { scope, idempotencyHash },
        },
      });
      // A preparation that outlived its window is reclaimable, even before the
      // expiry sweep has run.
      const stale =
        existing?.state === "expired" ||
        (existing?.state === "preparing" && existing.expiresAt <= now);
      if (existing && !stale) {
        if (existing.payloadHash !== input.payloadHash) {
          return { kind: "conflict" as const, requestId: existing.requestId };
        }
        if (
          existing.state === "failed" &&
          input.modelKey &&
          input.modelType
        ) {
          const model = await tx.modelCatalog.findUnique({
            where: { key: input.modelKey },
            select: { type: true, isActive: true },
          });
          if (!model || !model.isActive || model.type !== input.modelType) {
            return { kind: "model-unavailable" as const };
          }
        }
        if (existing.state === "failed") {
          retryExisting = { id: existing.id, requestId: existing.requestId };
        } else {
          return {
            kind: "existing" as const,
            requestId: existing.requestId,
            state: existing.state as SubmissionState,
          };
        }
      }
      if (existing && !retryExisting) {
        // An expired reservation no longer blocks a fresh attempt.
        await tx.generationSubmission.delete({ where: { id: existing.id } });
      }
    }

    if (input.modelKey && input.modelType) {
      const model = await tx.modelCatalog.findUnique({
        where: { key: input.modelKey },
        select: { type: true, isActive: true },
      });
      if (!model || !model.isActive || model.type !== input.modelType) {
        return { kind: "model-unavailable" as const };
      }
    }

    const counts = await countPending(
      tx,
      input.ownerEmail,
      input.providerKey ?? null,
      now,
    );
    if (counts.owner_count >= limits.ownerPending) {
      return {
        kind: "rejected" as const,
        reason: "OWNER_LIMIT" as const,
        pending: counts.owner_count,
      };
    }
    if (counts.global_count >= limits.globalPending) {
      return {
        kind: "rejected" as const,
        reason: "GLOBAL_LIMIT" as const,
        pending: counts.global_count,
      };
    }
    if (
      input.providerKey &&
      counts.provider_count >= limits.providerPending
    ) {
      return {
        kind: "rejected" as const,
        reason: "PROVIDER_LIMIT" as const,
        pending: counts.provider_count,
      };
    }

    if (retryExisting) {
      await tx.generationSubmission.update({
        where: { id: retryExisting.id },
        data: {
          state: "preparing",
          expiresAt,
          providerKey: input.providerKey ?? null,
          graphNodeId: input.graphNodeId ?? null,
        },
      });
      return { kind: "created" as const, requestId: retryExisting.requestId };
    }

    await tx.generationSubmission.create({
      data: {
        requestId: input.requestId,
        ownerEmail: input.ownerEmail,
        apiKeyId: input.apiKeyId ?? null,
        scope,
        idempotencyHash,
        payloadHash: input.payloadHash,
        providerKey: input.providerKey ?? null,
        graphNodeId: input.graphNodeId ?? null,
        state: "preparing",
        expiresAt,
      },
    });

    return { kind: "created" as const, requestId: input.requestId };
  });
}

export async function finalizeSubmission(
  requestId: string,
  state: Exclude<SubmissionState, "preparing">,
): Promise<void> {
  if (ledgerOverride) {
    await ledgerOverride.finalize(requestId, state);
    return;
  }
  await prisma.$transaction(async (tx) => {
    await tx.generationSubmission.updateMany({
      where: { requestId },
      data: { state },
    });
    if (state === "failed" || state === "expired") {
      await releaseStorageCleanupsForRequest(tx, requestId);
    }
  });
}

/** Marks reservations that outlived their preparation window. */
export async function expireStaleSubmissions(
  now: Date = new Date(),
  limit = 200,
): Promise<number> {
  if (ledgerOverride) return await ledgerOverride.expireStale(now, limit);
  return prisma.$transaction(async (tx) => {
    const stale = await tx.generationSubmission.findMany({
      where: { state: "preparing", expiresAt: { lt: now } },
      select: { id: true, requestId: true },
      take: limit,
    });
    if (stale.length === 0) return 0;
    let count = 0;
    for (const row of stale) {
      const result = await tx.generationSubmission.updateMany({
        where: { id: row.id, state: "preparing", expiresAt: { lt: now } },
        data: { state: "expired" },
      });
      if (result.count !== 1) continue;
      await releaseStorageCleanupsForRequest(tx, row.requestId, now);
      count += result.count;
    }
    return count;
  });
}

export async function findSubmissionByRequestId(requestId: string) {
  return await prisma.generationSubmission.findUnique({ where: { requestId } });
}
