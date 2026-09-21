import { Prisma } from "@prisma/client";

import { prisma } from "@/server/db/prisma";
import { expireStaleSubmissions } from "@/server/generation-admission/submission-ledger";

import { mediaAssetRepository } from "./media-asset-repository";
import { deleteHistoryStorageFile } from "./leemage-media-storage";
import { leemageMediaStorageAdapter } from "./leemage-media-storage";
import type { MediaStorageAdapter } from "./media-storage";
import {
  claimStorageCleanups,
  completeStorageCleanup,
  failStorageCleanup,
  linkStorageCleanupToAsset,
  MEDIA_CLEANUP_LEASE_MS,
  type ClaimedStorageCleanup,
} from "./media-cleanup-repository";
import { recordWorkerFailure } from "@/server/observability/metrics";
import { logStructured } from "@/server/observability/request-observability";

const WORKER_INTERVAL_MS = 2_000;
const WORKER_TOKEN = Symbol("media-cleanup-worker-instance");
export const MEDIA_CLEANUP_WORKER_DRAIN_TIMEOUT_MS = 25_000;
const CLEANUP_CONCURRENCY = 2;

type WorkerGlobal = typeof globalThis & {
  __mediaCleanupWorkerToken?: symbol;
  __mediaCleanupWorkerRunning?: boolean;
  __mediaCleanupWorkerStopping?: boolean;
  __mediaCleanupWorkerInterval?: ReturnType<typeof setInterval>;
  __mediaCleanupWorkerStopPromise?: Promise<void>;
  __mediaCleanupWorkerLastHeartbeatAt?: number;
};

const inFlightCleanups = new Map<string, Promise<void>>();
let activeCleanupPass: Promise<number> | null = null;

function hasUsage(usage: { graphIds: string[]; operationIds: string[]; generationRequestIds: string[] }) {
  return usage.graphIds.length > 0 || usage.operationIds.length > 0 || usage.generationRequestIds.length > 0;
}

function taskIdentity(task: ClaimedStorageCleanup, asset?: ClaimedStorageCleanup["asset"]) {
  return {
    ownerEmail: task.ownerEmail ?? asset?.ownerEmail ?? null,
    requestId: task.requestId,
    storageProvider: task.storageProvider,
    storageObjectId: task.storageObjectId,
    storageUrl: task.storageUrl ?? asset?.storageUrl ?? asset?.legacyUrl ?? null,
    reason: task.reason as Parameters<typeof linkStorageCleanupToAsset>[1]["reason"],
    now: new Date(),
  };
}

async function findCurrentAsset(task: ClaimedStorageCleanup) {
  if (task.assetId) {
    const byId = await prisma.mediaAsset.findUnique({
      where: { id: task.assetId },
      select: {
        id: true,
        ownerEmail: true,
        status: true,
        storageProvider: true,
        storageObjectId: true,
        storageUrl: true,
        legacyUrl: true,
      },
    });
    if (byId) return byId;
  }
  return prisma.mediaAsset.findUnique({
    where: {
      storageProvider_storageObjectId: {
        storageProvider: task.storageProvider,
        storageObjectId: task.storageObjectId,
      },
    },
    select: {
      id: true,
      ownerEmail: true,
      status: true,
      storageProvider: true,
      storageObjectId: true,
      storageUrl: true,
      legacyUrl: true,
    },
  });
}

async function protectReferencedAsset(task: ClaimedStorageCleanup, asset: NonNullable<Awaited<ReturnType<typeof findCurrentAsset>>>) {
  await prisma.$transaction(async (tx) => {
    if (asset.status === "deleting") {
      await tx.mediaAsset.updateMany({
        where: { id: asset.id, status: "deleting" },
        data: { status: "completed" },
      });
    }
    await linkStorageCleanupToAsset(tx, {
      ...taskIdentity(task, asset),
      assetId: asset.id,
    });
  });
}

function shouldProtectCompletedAsset(task: ClaimedStorageCleanup, asset: NonNullable<Awaited<ReturnType<typeof findCurrentAsset>>>) {
  if (asset.status !== "completed") return false;
  return [
    "upload_session",
    "generation_input",
    "generation_output",
    "media_operation_output",
    "asset_delete",
  ].includes(task.reason);
}

async function finalizeRemoteDeletion(
  task: ClaimedStorageCleanup,
  asset: Awaited<ReturnType<typeof findCurrentAsset>>,
) {
  await prisma.$transaction(async (tx) => {
    if (task.reason === "history_delete") {
      if (asset) {
        await tx.mediaAsset.updateMany({
          where: { id: asset.id },
          data: {
            status: "failed",
            storageUrl: null,
            legacyUrl: null,
            imageVariants: Prisma.DbNull,
          },
        });
      }
    } else if (asset) {
      const removed = await tx.mediaAsset.deleteMany({
        where: {
          id: asset.id,
          status: { in: ["deleting", "failed", "completed"] },
        },
      });
      if (removed.count !== 1) {
        throw new Error("MEDIA_CLEANUP_ASSET_STATE_CHANGED");
      }
    }
    await completeStorageCleanup(tx, { id: task.id });
  });
}

async function deleteRemote(task: ClaimedStorageCleanup, storage: MediaStorageAdapter) {
  if (task.storageProvider === "legacy_url") {
    await deleteHistoryStorageFile(null, task.storageUrl);
    return;
  }
  if (task.storageProvider !== storage.name) {
    throw new Error("MEDIA_CLEANUP_PROVIDER_UNSUPPORTED");
  }
  await storage.delete(task.storageObjectId);
}

export async function processStorageCleanupTask(
  task: ClaimedStorageCleanup,
  storage: MediaStorageAdapter = leemageMediaStorageAdapter,
) {
  const asset = await findCurrentAsset(task);

  if (task.reason === "history_delete") {
    await deleteRemote(task, storage);
    await finalizeRemoteDeletion(task, asset);
    return;
  }

  if (asset) {
    const usage = await mediaAssetRepository.getAssetUsage(asset.ownerEmail, asset.id);
    if (hasUsage(usage)) {
      await protectReferencedAsset(task, asset);
      return;
    }
    if (shouldProtectCompletedAsset(task, asset)) {
      await protectReferencedAsset(task, asset);
      return;
    }
  }

  await deleteRemote(task, storage);
  await finalizeRemoteDeletion(task, asset);
}

async function scheduleCleanup(task: ClaimedStorageCleanup) {
  const existing = inFlightCleanups.get(task.id);
  if (existing) return existing;
  const execution = Promise.resolve().then(async () => {
    try {
      await processStorageCleanupTask(task);
    } catch (error) {
      try {
        await failStorageCleanup(
          { id: task.id, leaseToken: task.leaseToken ?? "", attempts: task.attempts },
          error,
        );
      } catch (failure) {
        recordWorkerFailure("media-cleanup.state-update");
        logStructured("cleanup.state-update.failure", {
          worker: "media-cleanup",
          jobId: task.id,
          errorType: failure instanceof Error ? failure.name : typeof failure,
        }, "error");
      }
    }
  });
  inFlightCleanups.set(task.id, execution);
  const settle = () => {
    if (inFlightCleanups.get(task.id) === execution) inFlightCleanups.delete(task.id);
  };
  execution.then(settle, settle);
  return execution;
}

export async function processMediaCleanupJobs({ awaitCompletion = true } = {}) {
  if ((globalThis as WorkerGlobal).__mediaCleanupWorkerStopping) return 0;
  const pass = (async () => {
    await expireStaleSubmissions(new Date(), 100);
    const tasks = await claimStorageCleanups(new Date(), CLEANUP_CONCURRENCY);
    if ((globalThis as WorkerGlobal).__mediaCleanupWorkerStopping) return 0;
    const executions = tasks.map(scheduleCleanup);
    if (awaitCompletion) await Promise.all(executions);
    return executions.length;
  })();
  activeCleanupPass = pass;
  try {
    return await pass;
  } finally {
    if (activeCleanupPass === pass) activeCleanupPass = null;
  }
}

async function tick() {
  const global = globalThis as WorkerGlobal;
  if (global.__mediaCleanupWorkerStopping || global.__mediaCleanupWorkerRunning) return;
  global.__mediaCleanupWorkerLastHeartbeatAt = Date.now();
  global.__mediaCleanupWorkerRunning = true;
  try {
    await processMediaCleanupJobs({ awaitCompletion: false });
  } catch (error) {
    recordWorkerFailure("media-cleanup.pass");
    logStructured("worker.pass.failure", {
      worker: "media-cleanup",
      errorType: error instanceof Error ? error.name : typeof error,
    }, "error");
  } finally {
    global.__mediaCleanupWorkerRunning = false;
  }
}

export function startMediaCleanupWorker() {
  const global = globalThis as WorkerGlobal;
  if (global.__mediaCleanupWorkerStopping) return;
  if (global.__mediaCleanupWorkerToken === WORKER_TOKEN && global.__mediaCleanupWorkerInterval) return;
  if (global.__mediaCleanupWorkerInterval) clearInterval(global.__mediaCleanupWorkerInterval);
  global.__mediaCleanupWorkerToken = WORKER_TOKEN;
  global.__mediaCleanupWorkerInterval = setInterval(() => void tick(), WORKER_INTERVAL_MS);
  global.__mediaCleanupWorkerInterval.unref?.();
  queueMicrotask(() => void tick());
}

export async function stopMediaCleanupWorker({
  drainTimeoutMs = MEDIA_CLEANUP_WORKER_DRAIN_TIMEOUT_MS,
}: { drainTimeoutMs?: number } = {}) {
  const global = globalThis as WorkerGlobal;
  if (global.__mediaCleanupWorkerStopPromise) return global.__mediaCleanupWorkerStopPromise;
  global.__mediaCleanupWorkerStopping = true;
  if (global.__mediaCleanupWorkerInterval) {
    clearInterval(global.__mediaCleanupWorkerInterval);
    global.__mediaCleanupWorkerInterval = undefined;
  }
  const draining = Promise.allSettled([
    ...(activeCleanupPass ? [activeCleanupPass] : []),
    ...inFlightCleanups.values(),
  ]).then(() => undefined);
  const timeout = new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, Math.max(0, drainTimeoutMs));
    timer.unref?.();
  });
  global.__mediaCleanupWorkerStopPromise = Promise.race([draining, timeout]);
  return global.__mediaCleanupWorkerStopPromise;
}

export function getMediaCleanupWorkerState() {
  const global = globalThis as WorkerGlobal;
  return {
    started: Boolean(global.__mediaCleanupWorkerInterval),
    stopping: Boolean(global.__mediaCleanupWorkerStopping),
    running: Boolean(global.__mediaCleanupWorkerRunning),
    inFlight: inFlightCleanups.size,
    leaseMs: MEDIA_CLEANUP_LEASE_MS,
    lastHeartbeatAt: global.__mediaCleanupWorkerLastHeartbeatAt
      ? new Date(global.__mediaCleanupWorkerLastHeartbeatAt).toISOString()
      : null,
    heartbeatAgeSeconds: global.__mediaCleanupWorkerLastHeartbeatAt
      ? Math.max(0, Math.floor((Date.now() - global.__mediaCleanupWorkerLastHeartbeatAt) / 1000))
      : null,
  };
}
