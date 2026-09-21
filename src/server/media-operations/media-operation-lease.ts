import { Prisma } from "@prisma/client";

import { prisma } from "@/server/db/prisma";

export type MediaOperationLease = {
  token: string;
  version: number;
};

export const MEDIA_OPERATION_GLOBAL_LIMIT = 2;
export const MEDIA_OPERATION_LEASE_MS = 60_000;
export const MEDIA_OPERATION_HEARTBEAT_MS = 10_000;
export const MEDIA_OPERATION_WORKER_TYPE = "edit.image.removeBackground";

const MEDIA_OPERATION_ADVISORY_LOCK_KEY = 2_147_483_639;
const ACTIVE_OPERATION_STATUSES = ["processing", "uploading"] as const;

export class MediaOperationLeaseLostError extends Error {
  readonly operationId: string;

  constructor(operationId: string) {
    super("MEDIA_OPERATION_LEASE_LOST");
    this.name = "MediaOperationLeaseLostError";
    this.operationId = operationId;
  }
}

export function isMediaOperationLeaseLost(
  error: unknown,
): error is MediaOperationLeaseLostError {
  return error instanceof MediaOperationLeaseLostError;
}

export function mediaOperationLeaseWhere(
  lease: MediaOperationLease,
  now = new Date(),
) {
  return {
    executionLeaseToken: lease.token,
    executionLeaseVersion: lease.version,
    executionLeaseUntil: { gt: now },
  };
}

export function requireMediaOperationLease(record: {
  executionLeaseToken?: string | null;
  executionLeaseVersion?: number | null;
}, operationId: string) {
  if (
    typeof record.executionLeaseToken !== "string" ||
    !record.executionLeaseToken ||
    typeof record.executionLeaseVersion !== "number" ||
    !Number.isSafeInteger(record.executionLeaseVersion) ||
    record.executionLeaseVersion < 1
  ) {
    throw new MediaOperationLeaseLostError(operationId);
  }
  return {
    token: record.executionLeaseToken,
    version: record.executionLeaseVersion,
  } satisfies MediaOperationLease;
}

export async function recoverMediaOperationRows(
  client: Prisma.TransactionClient,
  now: Date,
) {
  const model = client.mediaOperation;
  await model.updateMany({
    where: {
      type: MEDIA_OPERATION_WORKER_TYPE,
      status: { in: [...ACTIVE_OPERATION_STATUSES] },
      OR: [
        { executionLeaseToken: null },
        { executionLeaseUntil: null },
      ],
    },
    data: {
      status: "failed",
      progress: 0,
      errorCode: "MEDIA_OPERATION_LEASE_RECOVERY_REQUIRED",
      errorMessage: null,
      executionLeaseToken: null,
      executionLeaseUntil: null,
    },
  });
  await model.updateMany({
    where: {
      type: MEDIA_OPERATION_WORKER_TYPE,
      status: { in: [...ACTIVE_OPERATION_STATUSES] },
      executionLeaseToken: { not: null },
      executionLeaseUntil: { lte: now },
    },
    data: {
      status: "failed",
      progress: 0,
      errorCode: "MEDIA_OPERATION_LEASE_EXPIRED",
      errorMessage: null,
      executionLeaseToken: null,
      executionLeaseUntil: null,
    },
  });
}

export async function countActiveMediaOperations(
  client: Prisma.TransactionClient,
  now: Date,
) {
  return client.mediaOperation.count({
    where: {
      type: MEDIA_OPERATION_WORKER_TYPE,
      status: { in: [...ACTIVE_OPERATION_STATUSES] },
      executionLeaseToken: { not: null },
      executionLeaseUntil: { gt: now },
    },
  });
}

export async function renewMediaOperationLease(
  operationId: string,
  lease: MediaOperationLease,
  now = new Date(),
) {
  const updated = await prisma.mediaOperation.updateMany({
    where: {
      id: operationId,
      status: { in: [...ACTIVE_OPERATION_STATUSES] },
      ...mediaOperationLeaseWhere(lease, now),
    },
    data: {
      executionLeaseUntil: new Date(now.getTime() + MEDIA_OPERATION_LEASE_MS),
    },
  });
  if (updated.count !== 1) {
    throw new MediaOperationLeaseLostError(operationId);
  }
}

export type MediaOperationLeaseMonitor = {
  assertOwned(): void;
  stop(): void;
};

export function startMediaOperationLeaseMonitor(
  operationId: string,
  lease: MediaOperationLease,
): MediaOperationLeaseMonitor {
  let stopped = false;
  let lost: MediaOperationLeaseLostError | null = null;
  let renewal: Promise<void> | null = null;
  const interval = setInterval(() => {
    if (stopped || lost || renewal) return;
    renewal = renewMediaOperationLease(operationId, lease)
      .catch((error) => {
        lost = isMediaOperationLeaseLost(error)
          ? error
          : new MediaOperationLeaseLostError(operationId);
      })
      .finally(() => {
        renewal = null;
      });
    void renewal;
  }, MEDIA_OPERATION_HEARTBEAT_MS);
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

export async function lockMediaOperationClaims(
  client: Prisma.TransactionClient,
) {
  await client.$executeRaw(
    Prisma.sql`SELECT pg_advisory_xact_lock(${MEDIA_OPERATION_ADVISORY_LOCK_KEY})`,
  );
}
