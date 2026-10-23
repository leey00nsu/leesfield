import { processSharedQueueJobs, startSharedQueueBackground, stopSharedQueue, getSharedQueueState } from "@/server/job-queue/job-queue-runtime";
export const MEDIA_OPERATION_WORKER_DRAIN_TIMEOUT_MS = 25_000;
export const processMediaOperationJobs = (options: { awaitCompletion?: boolean } = {}) => processSharedQueueJobs(options);
export const startMediaOperationWorker = startSharedQueueBackground;
export const stopMediaOperationWorker = stopSharedQueue;
export const getMediaOperationWorkerState = getSharedQueueState;
