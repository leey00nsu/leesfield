import { processSharedQueueJobs, startSharedQueueBackground, stopSharedQueue, getSharedQueueState } from "@/server/job-queue/job-queue-runtime";
export const GENERATION_WORKER_DRAIN_TIMEOUT_MS = 25_000;
export type ProcessGenerationJobsOptions = { awaitCompletion?: boolean; refillOnCompletion?: boolean; maxClaims?: number };
/** Compatibility entry points share the same registry and cluster scheduler. */
export const processImageJobs = (options: ProcessGenerationJobsOptions = {}) => processSharedQueueJobs(options);
export const processVideoJobs = (options: ProcessGenerationJobsOptions = {}) => processSharedQueueJobs(options);
export const processAudioJobs = (options: ProcessGenerationJobsOptions = {}) => processSharedQueueJobs(options);
export const pumpGenerationJobs = () => processSharedQueueJobs({ awaitCompletion: false });
export const startGenerationWorker = startSharedQueueBackground;
export const stopGenerationWorker = stopSharedQueue;
export const getGenerationWorkerState = getSharedQueueState;
