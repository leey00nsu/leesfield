/** Public ingress limits shared by request readers and API documentation. */
import { MAX_FILE_INPUT_LIMIT } from "@/shared/model-catalog/file-input-limits";
export const generationBodyLimitBytes = 64 * 1024 * 1024;
export const bodyReadTimeoutMs = 30_000;
export const maxExternalFileBytes = 10 * 1024 * 1024;
export const maxExternalFiles = MAX_FILE_INPUT_LIMIT;
export const maxExternalTotalFileBytes = 64 * 1024 * 1024;
export const maxIdempotencyKeyLength = 200;
