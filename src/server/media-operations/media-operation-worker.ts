import { uploadMediaOperationImages } from "@/server/image-generation/storage/adapters/leemage-storage-adapter";
import { mediaAssetRepository } from "@/server/media-assets/media-asset-repository";
import { mediaAssetService } from "@/server/media-assets/media-asset-service";
import { leemageMediaStorageAdapter } from "@/server/media-assets/leemage-media-storage";
import type { GeneratedMediaArtifact } from "@/server/media-assets/generated-media-artifact";

import { removeImageBackground } from "./hf-background-removal-adapter";

const WORKER_INTERVAL_MS = 2_000;
const WORKER_TOKEN = Symbol("media-operation-worker");

type WorkerGlobal = typeof globalThis & {
  __mediaOperationWorkerToken?: symbol;
  __mediaOperationWorkerRunning?: boolean;
  __mediaOperationWorkerInterval?: ReturnType<typeof setInterval>;
};

async function handleOperation(operationId: string) {
  const operation = await mediaAssetRepository.claimPendingServerOperation(operationId);
  if (!operation) return;
  let artifacts: GeneratedMediaArtifact[] = [];
  try {
    const input = operation.inputs[0];
    if (!input) throw new Error("NODE_INPUT_INVALID");
    const asset = await mediaAssetService.get(operation.ownerEmail, input.assetId);
    const result = await removeImageBackground(asset.url);
    const current = await mediaAssetRepository.getOperation(operation.ownerEmail, operation.id);
    if (current.status !== "processing") return;
    artifacts = await uploadMediaOperationImages(operation.id, [{
      dataUrl: result.dataUrl,
      width: asset.width,
      height: asset.height,
    }]);
    await mediaAssetRepository.completeServerOperation(
      operation.ownerEmail,
      operation.id,
      artifacts,
      new Date(),
    );
  } catch (error) {
    await Promise.allSettled(
      artifacts.map((artifact) => leemageMediaStorageAdapter.delete(artifact.storageObjectId)),
    );
    const code = error instanceof Error && error.message === "PROCESSOR_UNAVAILABLE"
      ? "PROCESSOR_UNAVAILABLE"
      : "PROCESSOR_FAILED";
    await mediaAssetRepository.failOperation(operation.ownerEmail, operation.id, code);
  }
}

export async function processMediaOperationJobs() {
  const ids = await mediaAssetRepository.listPendingServerOperationIds(20);
  await Promise.all(ids.map(({ id }) => handleOperation(id)));
}

async function tick() {
  const global = globalThis as WorkerGlobal;
  if (global.__mediaOperationWorkerRunning) return;
  global.__mediaOperationWorkerRunning = true;
  try {
    await processMediaOperationJobs();
  } catch (error) {
    console.error("[media-operation-worker] pass failed", error);
  } finally {
    global.__mediaOperationWorkerRunning = false;
  }
}

export function startMediaOperationWorker() {
  const global = globalThis as WorkerGlobal;
  if (global.__mediaOperationWorkerToken === WORKER_TOKEN && global.__mediaOperationWorkerInterval) return;
  if (global.__mediaOperationWorkerInterval) clearInterval(global.__mediaOperationWorkerInterval);
  global.__mediaOperationWorkerToken = WORKER_TOKEN;
  global.__mediaOperationWorkerInterval = setInterval(() => void tick(), WORKER_INTERVAL_MS);
  global.__mediaOperationWorkerInterval.unref?.();
  queueMicrotask(() => void tick());
}
