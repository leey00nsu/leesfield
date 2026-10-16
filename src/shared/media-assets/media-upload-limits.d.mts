export type MediaUploadLimits = Record<"image" | "video" | "audio", number>;
export const DEFAULT_MEDIA_UPLOAD_BYTES: number;
export function mediaUploadLimits(env?: Record<string, string | undefined>): MediaUploadLimits;
export function mediaProxyBodyLimit(env?: Record<string, string | undefined>): number;
