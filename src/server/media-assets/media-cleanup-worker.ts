import { processSharedQueueJobs, startSharedQueueBackground, stopSharedQueue, getSharedQueueState } from "@/server/job-queue/job-queue-runtime";
export const MEDIA_CLEANUP_WORKER_DRAIN_TIMEOUT_MS = 25_000;
export const processMediaCleanupJobs = (options: { awaitCompletion?: boolean } = {}) => processSharedQueueJobs(options);
export const startMediaCleanupWorker = startSharedQueueBackground;
export const stopMediaCleanupWorker = stopSharedQueue;
export const getMediaCleanupWorkerState = getSharedQueueState;

/** Unfenced task execution is no longer supported; use the shared runner. */
export async function processStorageCleanupTask(
  task: import("./media-cleanup-repository").ClaimedStorageCleanup,
  storage?: import("./media-storage").MediaStorageAdapter,
): Promise<void> {
  void task; void storage;
  throw new Error("QUEUE_USE_SHARED_RUNNER");
}
