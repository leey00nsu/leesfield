import type {
  MediaAssetCategory,
  MediaAssetDto,
  MediaAssetListDto,
  MediaType,
  ResolvedNodeAssetsDto,
  ListMediaAssetsInput,
} from "@/shared/media-assets/media-asset-contract";
import type { AssetOrganizationDto, AssetUsageDto, UpdateAssetMetadataInput, BatchAssetMetadataInput } from "@/shared/media-assets/asset-organization-contract";
import type { AssetProjectDto } from "@/shared/media-assets/asset-project-contract";

export type AssetListFilters = Pick<ListMediaAssetsInput, "query" | "folderId" | "projectId" | "starred" | "tagIds" | "sort" | "classification" | "managementStatus" | "dateFrom" | "dateTo" | "model">;

import { parseMediaError as parseError } from "@/shared/api/media-upload";
export { MediaAssetApiError } from "@/shared/api/media-upload";

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

export { uploadMediaFile as uploadMediaAsset } from "@/shared/api/media-upload";
export type { MediaOperationUploadBinding } from "@/shared/api/media-upload";

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
