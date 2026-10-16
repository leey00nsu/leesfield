/** Public ingress limits shared by request readers and API documentation. */
import { MAX_FILE_INPUT_LIMIT } from "@/shared/model-catalog/file-input-limits";
import { mediaUploadLimits } from "@/shared/media-assets/media-upload-limits.mjs";
export const generationBodyLimitBytes = 64 * 1024 * 1024;
export const bodyReadTimeoutMs = 30_000;
export const maxExternalFileBytes = Math.max(...Object.values(mediaUploadLimits()));
export const maxExternalFiles = MAX_FILE_INPUT_LIMIT;
export const maxExternalTotalFileBytes = 64 * 1024 * 1024;
export const maxIdempotencyKeyLength = 200;
