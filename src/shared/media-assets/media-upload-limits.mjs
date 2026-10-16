export const DEFAULT_MEDIA_UPLOAD_BYTES = 50 * 1024 * 1024;

/** Server runtime policy. Only the returned numeric limits may be sent to clients. */
export function mediaUploadLimits(env = process.env) {
  const result = {};
  for (const media of ["image", "video", "audio"]) {
    const raw = env[`MEDIA_ASSET_MAX_${media.toUpperCase()}_BYTES`]?.trim();
    const value = raw && /^\d+$/.test(raw) ? Number(raw) : NaN;
    result[media] = Number.isSafeInteger(value) && value > 0
      ? value : DEFAULT_MEDIA_UPLOAD_BYTES;
  }
  return result;
}

/** The binary relay must fit before the route can enforce its per-file budget. */
export function mediaProxyBodyLimit(env = process.env) {
  return Math.max(64 * 1024 * 1024, ...Object.values(mediaUploadLimits(env)));
}
