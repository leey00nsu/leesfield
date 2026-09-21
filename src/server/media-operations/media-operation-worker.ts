import { uploadMediaOperationImages } from "@/server/image-generation/storage/adapters/leemage-storage-adapter";
import { mediaAssetRepository } from "@/server/media-assets/media-asset-repository";
import { mediaAssetService } from "@/server/media-assets/media-asset-service";
import { releaseStorageCleanupsForRequest } from "@/server/media-assets/media-cleanup-repository";
import {
  isMediaOperationLeaseLost,
  requireMediaOperationLease,
  startMediaOperationLeaseMonitor,
} from "./media-operation-lease";

import { removeImageBackground } from "./hf-background-removal-adapter";
import { recordWorkerFailure } from "@/server/observability/metrics";
import { logStructured } from "@/server/observability/request-observability";

const WORKER_INTERVAL_MS = 2_000;
const WORKER_TOKEN = Symbol("media-operation-worker");
export const MEDIA_OPERATION_WORKER_DRAIN_TIMEOUT_MS = 25_000;

type WorkerGlobal = typeof globalThis & {
  __mediaOperationWorkerToken?: symbol;
  __mediaOperationWorkerRunning?: boolean;
  __mediaOperationWorkerStopping?: boolean;
  __mediaOperationWorkerInterval?: ReturnType<typeof setInterval>;
  __mediaOperationWorkerStopPromise?: Promise<void>;
  __mediaOperationWorkerLastHeartbeatAt?: number;
};

type ProcessMediaOperationJobsOptions = {
  awaitCompletion?: boolean;
};

const inFlightMediaOperations = new Map<string, Promise<void>>();
let activeMediaOperationPass: Promise<number> | null = null;

function scheduleMediaOperation(operationId: string) {
  const existing = inFlightMediaOperations.get(operationId);
  if (existing) return existing;

  const execution = Promise.resolve().then(() => handleOperation(operationId));
  inFlightMediaOperations.set(operationId, execution);
  const settle = () => {
    if (inFlightMediaOperations.get(operationId) === execution) {
      inFlightMediaOperations.delete(operationId);
    }
  };
  execution.then(settle, settle);
  return execution;
}

async function handleOperation(operationId: string) {
  const claimed = await mediaAssetRepository.claimPendingServerOperation(operationId);
  if (!claimed) return;
  const { operation } = claimed;
  const ownedLease = requireMediaOperationLease(
    operation,
    operation.id,
  );
  const monitor = startMediaOperationLeaseMonitor(operation.id, ownedLease);
  try {
    const input = operation.inputs[0];
    if (!input) throw new Error("NODE_INPUT_INVALID");
    const asset = await mediaAssetService.get(operation.ownerEmail, input.assetId);
    monitor.assertOwned();
    const result = await removeImageBackground(asset.url);
    monitor.assertOwned();
    const current = await mediaAssetRepository.getOperation(operation.ownerEmail, operation.id);
    if (current.status !== "processing") return;
    monitor.assertOwned();
    const artifacts = await uploadMediaOperationImages(operation.id, [{
      dataUrl: result.dataUrl,
      width: asset.width,
      height: asset.height,
    }]);
    monitor.assertOwned();
    await mediaAssetRepository.completeServerOperation(
      operation.ownerEmail,
      operation.id,
      artifacts,
      new Date(),
      ownedLease,
    );
  } catch (error) {
    recordWorkerFailure("media-operation");
    logStructured("job.failure", {
      worker: "media-operation",
      jobId: operation.id,
      errorType: error instanceof Error ? error.name : typeof error,
    }, "error");
    await releaseStorageCleanupsForRequest(undefined, operation.id).catch(() => undefined);
    const code = error instanceof Error && error.message === "PROCESSOR_UNAVAILABLE"
      ? "PROCESSOR_UNAVAILABLE"
      : "PROCESSOR_FAILED";
    if (isMediaOperationLeaseLost(error)) return;
    try {
      await mediaAssetRepository.failOperation(
        operation.ownerEmail,
        operation.id,
        code,
        ownedLease,
      );
    } catch (failure) {
      if (!isMediaOperationLeaseLost(failure)) throw failure;
    }
  } finally {
    monitor.stop();
  }
}

export async function processMediaOperationJobs({
  awaitCompletion = true,
}: ProcessMediaOperationJobsOptions = {}) {
  if (isMediaOperationWorkerStopping()) return 0;

  const pass = (async () => {
    const ids = await mediaAssetRepository.listPendingServerOperationIds(20);
    if (isMediaOperationWorkerStopping()) return 0;
    const executions = ids.map(({ id }) => scheduleMediaOperation(id));
    if (awaitCompletion) await Promise.all(executions);
    return executions.length;
  })();
  activeMediaOperationPass = pass;
  try {
    return await pass;
  } finally {
    if (activeMediaOperationPass === pass) activeMediaOperationPass = null;
  }
}

async function tick() {
  const global = globalThis as WorkerGlobal;
  if (global.__mediaOperationWorkerStopping) return;
  if (global.__mediaOperationWorkerRunning) return;
  global.__mediaOperationWorkerLastHeartbeatAt = Date.now();
  global.__mediaOperationWorkerRunning = true;
  try {
    await processMediaOperationJobs({ awaitCompletion: false });
  } catch (error) {
    recordWorkerFailure("media-operation.pass");
    logStructured("worker.pass.failure", {
      worker: "media-operation",
      errorType: error instanceof Error ? error.name : typeof error,
    }, "error");
  } finally {
    global.__mediaOperationWorkerRunning = false;
  }
}

export function startMediaOperationWorker() {
  const global = globalThis as WorkerGlobal;
  if (global.__mediaOperationWorkerStopping) return;
  if (global.__mediaOperationWorkerToken === WORKER_TOKEN && global.__mediaOperationWorkerInterval) return;
  if (global.__mediaOperationWorkerInterval) clearInterval(global.__mediaOperationWorkerInterval);
  global.__mediaOperationWorkerToken = WORKER_TOKEN;
  global.__mediaOperationWorkerInterval = setInterval(() => void tick(), WORKER_INTERVAL_MS);
  global.__mediaOperationWorkerInterval.unref?.();
  queueMicrotask(() => void tick());
}

function isMediaOperationWorkerStopping() {
  return Boolean((globalThis as WorkerGlobal).__mediaOperationWorkerStopping);
}

export async function stopMediaOperationWorker({
  drainTimeoutMs = MEDIA_OPERATION_WORKER_DRAIN_TIMEOUT_MS,
}: { drainTimeoutMs?: number } = {}) {
  const global = globalThis as WorkerGlobal;
  if (global.__mediaOperationWorkerStopPromise) {
    return global.__mediaOperationWorkerStopPromise;
  }

  global.__mediaOperationWorkerStopping = true;
  if (global.__mediaOperationWorkerInterval) {
    clearInterval(global.__mediaOperationWorkerInterval);
    global.__mediaOperationWorkerInterval = undefined;
  }

  const draining = Promise.allSettled([
    ...(activeMediaOperationPass ? [activeMediaOperationPass] : []),
    ...inFlightMediaOperations.values(),
  ]).then(() => undefined);
  const timeout = new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, Math.max(0, drainTimeoutMs));
    timer.unref?.();
  });
  global.__mediaOperationWorkerStopPromise = Promise.race([draining, timeout]);
  return global.__mediaOperationWorkerStopPromise;
}

export function getMediaOperationWorkerState() {
  const global = globalThis as WorkerGlobal;
  return {
    started: Boolean(global.__mediaOperationWorkerInterval),
    stopping: Boolean(global.__mediaOperationWorkerStopping),
    running: Boolean(global.__mediaOperationWorkerRunning),
    inFlight: inFlightMediaOperations.size,
    lastHeartbeatAt: global.__mediaOperationWorkerLastHeartbeatAt
      ? new Date(global.__mediaOperationWorkerLastHeartbeatAt).toISOString()
      : null,
    heartbeatAgeSeconds: global.__mediaOperationWorkerLastHeartbeatAt
      ? Math.max(0, Math.floor((Date.now() - global.__mediaOperationWorkerLastHeartbeatAt) / 1000))
      : null,
  };
}
