import type { MediaType } from "./media-asset-contract";

type AssetNameSource = {
  id: string;
  type: MediaType;
  createdAt: string | Date;
  displayName?: string | null;
  originalFileName?: string | null;
};

const mediaLabels: Record<MediaType, string> = { image: "Image", video: "Video", audio: "Audio" };
export function getMediaAssetReferenceId(asset: { id: string; referenceId?: string | null }): string {
  return asset.referenceId ?? asset.id;
}
export function getMediaAssetName(asset: AssetNameSource): string {
  if (asset.displayName?.trim()) return asset.displayName.trim();
  if (asset.originalFileName?.trim()) return asset.originalFileName.trim();
  const date = typeof asset.createdAt === "string" ? new Date(asset.createdAt) : asset.createdAt;
  return `${mediaLabels[asset.type]} ${date.toISOString().slice(0, 10)} ${asset.id}`;
}

const mimeExtensions: Record<string, string> = {
  "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "image/gif": "gif", "image/avif": "avif",
  "video/mp4": "mp4", "video/webm": "webm", "video/quicktime": "mov",
  "audio/wav": "wav", "audio/mpeg": "mp3", "audio/ogg": "ogg", "audio/flac": "flac", "audio/aac": "aac", "audio/mp4": "m4a",
};
export function getMediaAssetDownloadName(asset: AssetNameSource & { mimeType: string }): string {
  const extension = mimeExtensions[asset.mimeType.toLowerCase()] ?? "bin";
  const name = getMediaAssetName(asset).normalize("NFC")
    .replace(/[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/gu, "")
    .replace(/[\\/<>:"|?*]/g, "_").replace(/^[. ]+|[. ]+$/g, "");
  const stem = name.replace(/\.[a-z0-9]{1,8}$/i, "").slice(0, 240) || asset.id;
  return `${stem}.${extension}`;
}
