import type { MediaAssetDto, MediaType, MediaUploadSessionDto } from "@/shared/media-assets/media-asset-contract";

export class MediaAssetApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    readonly details: Record<string, unknown> = {},
  ) {
    super(code);
    this.name = "MediaAssetApiError";
  }
}

export async function parseMediaError(response: Response): Promise<never> {
  const payload = await response.json().catch(() => null) as Record<string, unknown> | null;
  throw new MediaAssetApiError(
    response.status,
    typeof payload?.message === "string" ? payload.message : "MEDIA_ASSET_REQUEST_FAILED",
    { ...payload, requestId: response.headers.get("x-request-id") ?? payload?.requestId },
  );
}

export type MediaOperationUploadBinding = {
  operationId: string;
  outputPortId: string;
  sortOrder: number;
};

export async function uploadMediaFile(
  file: File,
  intendedType: MediaType,
  binding?: MediaOperationUploadBinding,
  signal?: AbortSignal,
): Promise<MediaAssetDto> {
  const createResponse = await fetch("/api/media-assets/uploads", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      intendedType,
      fileName: file.name,
      declaredMimeType: file.type,
      declaredBytes: file.size,
      ...binding,
    }),
    signal,
  });
  if (!createResponse.ok) return parseMediaError(createResponse);
  const created = await createResponse.json() as { upload: MediaUploadSessionDto };
  const uploadResponse = await fetch(created.upload.upload.url, {
    method: created.upload.upload.method,
    headers: created.upload.upload.headers,
    body: file,
    signal,
  });
  if (!uploadResponse.ok) {
    return parseMediaError(uploadResponse);
  }
  const confirmResponse = await fetch(`/api/media-assets/uploads/${encodeURIComponent(created.upload.id)}/confirm`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{}",
    signal,
  });
  if (!confirmResponse.ok) return parseMediaError(confirmResponse);
  const confirmed = await confirmResponse.json() as { asset: MediaAssetDto };
  return confirmed.asset;
}

