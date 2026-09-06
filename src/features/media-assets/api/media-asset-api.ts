import type {
  MediaAssetCategory,
  MediaAssetDto,
  MediaAssetListDto,
  MediaType,
  MediaUploadSessionDto,
  ResolvedNodeAssetsDto,
} from "@/shared/media-assets/media-asset-contract";

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

async function parseError(response: Response): Promise<never> {
  const payload = await response.json().catch(() => null) as Record<string, unknown> | null;
  throw new MediaAssetApiError(
    response.status,
    typeof payload?.message === "string" ? payload.message : "MEDIA_ASSET_REQUEST_FAILED",
    payload ?? {},
  );
}

export async function listMediaAssets(
  type: MediaType,
  cursor: string | null,
  signal?: AbortSignal,
  category?: MediaAssetCategory,
): Promise<MediaAssetListDto> {
  const params = new URLSearchParams({ type, limit: "24" });
  if (category) params.set("category", category);
  if (cursor) params.set("cursor", cursor);
  const response = await fetch(`/api/media-assets?${params}`, { cache: "no-store", signal });
  if (!response.ok) return parseError(response);
  return response.json() as Promise<MediaAssetListDto>;
}

export async function getMediaAsset(assetId: string, signal?: AbortSignal): Promise<MediaAssetDto> {
  const response = await fetch(`/api/media-assets/${encodeURIComponent(assetId)}`, {
    cache: "no-store",
    signal,
  });
  if (!response.ok) return parseError(response);
  const payload = await response.json() as { asset: MediaAssetDto };
  return payload.asset;
}

export type MediaOperationUploadBinding = {
  operationId: string;
  outputPortId: string;
  sortOrder: number;
};

export async function uploadMediaAsset(
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
  if (!createResponse.ok) return parseError(createResponse);
  const created = await createResponse.json() as { upload: MediaUploadSessionDto };
  const uploadResponse = await fetch(created.upload.upload.url, {
    method: created.upload.upload.method,
    headers: created.upload.upload.headers,
    body: file,
    signal,
  });
  if (!uploadResponse.ok) {
    throw new MediaAssetApiError(uploadResponse.status, "MEDIA_UPLOAD_FAILED");
  }
  const confirmResponse = await fetch(`/api/media-assets/uploads/${encodeURIComponent(created.upload.id)}/confirm`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{}",
    signal,
  });
  if (!confirmResponse.ok) return parseError(confirmResponse);
  const confirmed = await confirmResponse.json() as { asset: MediaAssetDto };
  return confirmed.asset;
}

export async function deleteMediaAsset(assetId: string) {
  const response = await fetch(`/api/media-assets/${encodeURIComponent(assetId)}`, { method: "DELETE" });
  if (!response.ok) return parseError(response);
}

export async function resolveNodeAssets(
  graphId: string,
  nodeId: string,
  signal?: AbortSignal,
): Promise<ResolvedNodeAssetsDto> {
  const response = await fetch(
    `/api/generation-graphs/${encodeURIComponent(graphId)}/nodes/${encodeURIComponent(nodeId)}/outputs`,
    { cache: "no-store", signal },
  );
  if (!response.ok) return parseError(response);
  const payload = await response.json() as { output: ResolvedNodeAssetsDto };
  return payload.output;
}
