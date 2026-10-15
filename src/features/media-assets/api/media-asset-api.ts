import type {
  MediaAssetCategory,
  MediaAssetDto,
  MediaAssetListDto,
  MediaType,
  MediaUploadSessionDto,
  ResolvedNodeAssetsDto,
  ListMediaAssetsInput,
} from "@/shared/media-assets/media-asset-contract";
import type { AssetOrganizationDto, AssetUsageDto, UpdateAssetMetadataInput, BatchAssetMetadataInput } from "@/shared/media-assets/asset-organization-contract";
import type { AssetProjectDto } from "@/shared/media-assets/asset-project-contract";

export type AssetListFilters = Pick<ListMediaAssetsInput, "query" | "folderId" | "projectId" | "starred" | "tagIds" | "sort" | "classification" | "managementStatus" | "dateFrom" | "dateTo" | "model">;

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
  type: MediaType | undefined,
  cursor: string | null,
  signal?: AbortSignal,
  category?: MediaAssetCategory,
  filters?: AssetListFilters,
): Promise<MediaAssetListDto> {
  const params = new URLSearchParams({ limit: "24" });
  if (type) { params.delete("limit"); params.set("type", type); params.set("limit", "24"); }
  if (category) params.set("category", category);
  for (const key of ["query", "folderId", "projectId", "starred", "sort", "classification", "managementStatus", "dateFrom", "dateTo", "model"] as const) {
    if (filters?.[key] !== undefined) params.set(key, String(filters[key]));
  }
  for (const id of filters?.tagIds ?? []) params.append("tagIds", id);
  if (cursor) params.set("cursor", cursor);
  const response = await fetch(`/api/media-assets?${params}`, { cache: "no-store", signal });
  if (!response.ok) return parseError(response);
  return response.json() as Promise<MediaAssetListDto>;
}

export async function assetOrganizationRequest<T>(path: string, method = "GET", body?: unknown, signal?: AbortSignal): Promise<T> {
  const response = await fetch(`/api/media-assets${path}`, {
    method, cache: "no-store", signal,
    ...(body === undefined ? {} : { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }),
  });
  if (!response.ok) return parseError(response);
  return response.status === 204 ? undefined as T : response.json() as Promise<T>;
}
export const getAssetOrganization = (signal?: AbortSignal) => assetOrganizationRequest<AssetOrganizationDto>("/organization", "GET", undefined, signal);
export const getAssetProjects = async (signal?: AbortSignal) => (await assetOrganizationRequest<{ projects: AssetProjectDto[] }>("/projects", "GET", undefined, signal)).projects;
export const getAssetUsage = (id: string, signal?: AbortSignal) => assetOrganizationRequest<AssetUsageDto>(`/${encodeURIComponent(id)}/usage`, "GET", undefined, signal);
export const patchAssetMetadata = async (id: string, input: UpdateAssetMetadataInput) =>
  (await assetOrganizationRequest<{ asset: MediaAssetDto }>(`/${encodeURIComponent(id)}`, "PATCH", input)).asset;
export const patchAssetBatch = (input: BatchAssetMetadataInput) => assetOrganizationRequest<{ assetIds: string[] }>("/batch", "PATCH", input);

export async function getMediaAsset(assetId: string, signal?: AbortSignal): Promise<MediaAssetDto> {
  const response = await fetch(`/api/media-assets/${encodeURIComponent(assetId)}`, {
    cache: "no-store",
    signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(30_000)]) : AbortSignal.timeout(30_000),
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
