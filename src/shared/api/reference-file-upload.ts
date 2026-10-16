import { MediaAssetApiError, parseMediaError, uploadMediaFile } from "./media-upload";
import type { MediaType } from "@/shared/media-assets/media-asset-contract";
import { droppedMediaType, normalizeDroppedMediaFile } from "@/shared/media-assets/media-file-drop";

/** Query runtime policy once per selection; never copy deployment limits into the bundle. */
export async function uploadReferenceFiles(files: File[], media?: MediaType, signal?: AbortSignal) {
  const normalized = files.map(file => {
    const result = normalizeDroppedMediaFile(file);
    if (!result || (media && droppedMediaType(result.type) !== media)) {
      throw new MediaAssetApiError(400, "MEDIA_TYPE_INVALID");
    }
    return result;
  });
  const response = await fetch("/api/media-assets/upload-policy", { cache: "no-store", signal });
  if (!response.ok) return parseMediaError(response);
  const policy = await response.json();
  for (const file of normalized) {
    const type = droppedMediaType(file.type)!;
    const maxBytes = policy?.limits?.[type];
    if (!Number.isSafeInteger(maxBytes) || maxBytes <= 0) throw new MediaAssetApiError(502, "MEDIA_UPLOAD_POLICY_INVALID");
    if (file.size > maxBytes) throw new MediaAssetApiError(413, "MEDIA_FILE_TOO_LARGE", { maxBytes, actualBytes: file.size });
  }
  // Bound simultaneous large file buffers and preserve positional input ordering.
  const assets = [];
  for (const file of normalized) {
    signal?.throwIfAborted();
    assets.push(await uploadMediaFile(file, droppedMediaType(file.type)!, undefined, signal));
  }
  return assets;
}

export function mediaUploadErrorMessage(error: unknown, ko: boolean) {
  if (error instanceof MediaAssetApiError) {
    const limit = error.details.maxBytes;
    const message = error.status === 413 && typeof limit === "number"
      ? (ko ? `파일당 최대 ${limit / 1024 / 1024} MiB까지 업로드할 수 있습니다.` : `Upload files up to ${limit / 1024 / 1024} MiB each.`)
      : (ko ? `업로드하지 못했습니다. (${error.code})` : `Upload failed. (${error.code})`);
    return typeof error.details.requestId === "string" ? `${message} [${error.details.requestId}]` : message;
  }
  return ko ? "업로드하지 못했습니다. 다시 시도해 주세요." : "Upload failed. Please try again.";
}
