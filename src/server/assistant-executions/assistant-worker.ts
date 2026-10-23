import { processSharedQueueJobs, startSharedQueueBackground, stopSharedQueue, getSharedQueueState } from "@/server/job-queue/job-queue-runtime";
export const ASSISTANT_WORKER_DRAIN_TIMEOUT_MS = 25_000;
export const processAssistantJobs = (options: { awaitCompletion?: boolean } = {}) => processSharedQueueJobs(options);
export const startAssistantWorker = startSharedQueueBackground;
export const stopAssistantWorker = stopSharedQueue;
export const getAssistantWorkerState = getSharedQueueState;
