/** Public ingress limits shared by request readers and API documentation. */
export const generationBodyLimitBytes = 64 * 1024 * 1024;
export const bodyReadTimeoutMs = 30_000;
export const maxExternalFileBytes = 10 * 1024 * 1024;
export const maxExternalFiles = 8;
export const maxExternalTotalFileBytes = 64 * 1024 * 1024;
export const maxIdempotencyKeyLength = 200;
