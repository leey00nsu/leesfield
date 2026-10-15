"use client";

import { useInfiniteQuery, useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import type { InfiniteData } from "@tanstack/react-query";

import type { MediaAssetCategory, MediaAssetListDto, MediaType } from "@/shared/media-assets/media-asset-contract";
import type { AssetProjectDto, CreateAssetProjectInput, UpdateAssetProjectInput } from "@/shared/media-assets/asset-project-contract";

import {
  deleteMediaAsset,
  getMediaAsset,
  listMediaAssets,
  resolveNodeAssets,
  uploadMediaAsset,
  getAssetOrganization,
  getAssetProjects,
  getAssetUsage,
  patchAssetMetadata,
  patchAssetBatch,
  assetOrganizationRequest,
  type AssetListFilters,
} from "../api/media-asset-api";
import type { UpdateAssetMetadataInput } from "@/shared/media-assets/asset-organization-contract";

export const mediaAssetKeys = {
  all: ["media-assets"] as const,
  list: (type?: MediaType, category?: MediaAssetCategory, filters?: AssetListFilters) =>
    [...mediaAssetKeys.all, "list", type, ...(category ? [category] : []), ...(filters ? [filters] : [])] as const,
  organization: ["media-assets", "organization"] as const,
  projects: ["media-assets", "projects"] as const,
  usage: (id: string) => [...mediaAssetKeys.all, "usage", id] as const,
  detail: (assetId: string) => [...mediaAssetKeys.all, "detail", assetId] as const,
  nodeOutput: (graphId: string, nodeId: string) =>
    [...mediaAssetKeys.all, "node-output", graphId, nodeId] as const,
};

export function useMediaAssets(type?: MediaType, enabled = true, category?: MediaAssetCategory, filters?: AssetListFilters) {
  return useInfiniteQuery({
    queryKey: mediaAssetKeys.list(type, category, filters),
    queryFn: ({ pageParam, signal }) => listMediaAssets(type, pageParam, signal, category, filters),
    initialPageParam: null as string | null,
    getNextPageParam: (page) => page.nextCursor ?? undefined,
    enabled,
  });
}

export function useAssetModelOptions(enabled = true) {
  return useQuery({ queryKey: [...mediaAssetKeys.all, "models"],
    queryFn: ({ signal }) => assetOrganizationRequest<{ models: string[] }>("/models", "GET", undefined, signal), enabled });
}

export function useAssetOrganization(enabled = true) {
  return useQuery({ queryKey: mediaAssetKeys.organization, queryFn: ({ signal }) => getAssetOrganization(signal), enabled });
}
export function useAssetProjects(enabled = true) {
  return useQuery({ queryKey: mediaAssetKeys.projects, queryFn: ({ signal }) => getAssetProjects(signal), enabled });
}
type ProjectWrite = { method: "POST"; body: CreateAssetProjectInput } | { method: "PATCH"; id: string; body: UpdateAssetProjectInput } | { method: "DELETE"; id: string; body: { expectedVersion: number } };
export function useWriteAssetProject() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (input: ProjectWrite) => {
      const result = await assetOrganizationRequest<{ project: AssetProjectDto } | undefined>(input.method === "POST" ? "/projects" : `/projects/${encodeURIComponent(input.id)}`, input.method, input.body);
      return result?.project;
    },
    onSettled: () => client.invalidateQueries({ queryKey: mediaAssetKeys.all }),
  });
}
export function useAssetUsage(id: string | null) {
  return useQuery({ queryKey: mediaAssetKeys.usage(id ?? "none"), queryFn: ({ signal }) => getAssetUsage(id!, signal), enabled: !!id });
}
export function usePatchAssetMetadata() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...input }: UpdateAssetMetadataInput & { id: string }) => patchAssetMetadata(id, input),
    onSuccess: async (asset, variables) => {
      client.setQueryData(mediaAssetKeys.detail(asset.id), asset);
      client.setQueriesData<InfiniteData<MediaAssetListDto>>({ queryKey: ["media-assets", "list"] }, previous => previous ? {
        ...previous, pages: previous.pages.map(page => ({ ...page, items: page.items.map(item => item.id === asset.id ? asset : item) })),
      } : previous);
      const starOnly = Object.keys(variables).every(key => ["id", "expectedVersion", "starred"].includes(key));
      if (starOnly) {
        await client.invalidateQueries({ queryKey: ["media-assets", "list"], predicate: query => query.queryKey.some(part => !!part && typeof part === "object" && "starred" in part && part.starred !== undefined) });
      } else await client.invalidateQueries({ queryKey: mediaAssetKeys.all });
    },
    onError: async (_error, variables) => {
      await client.invalidateQueries({ queryKey: mediaAssetKeys.detail(variables.id) });
      await client.invalidateQueries({ queryKey: ["media-assets", "list"] });
    },
  });
}
export function usePatchAssetBatch() {
  const client = useQueryClient();
  return useMutation({ mutationFn: (input: Parameters<typeof patchAssetBatch>[0]) => patchAssetBatch(input), onSettled: () => client.invalidateQueries({ queryKey: mediaAssetKeys.all }) });
}
export function useWriteAssetOrganization() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ path, method, body }: { path: string; method: "POST" | "PATCH" | "DELETE"; body: unknown }) => assetOrganizationRequest(path, method, body),
    onSettled: () => client.invalidateQueries({ queryKey: mediaAssetKeys.all }),
  });
}

export function useMediaAsset(assetId: string | null) {
  return useQuery({
    queryKey: mediaAssetKeys.detail(assetId ?? "none"),
    queryFn: ({ signal }) => getMediaAsset(assetId as string, signal),
    enabled: Boolean(assetId),
  });
}

export function useMediaAssetList(assetIds: readonly string[]) {
  return useQueries({
    queries: assetIds.map((assetId) => ({
      queryKey: mediaAssetKeys.detail(assetId),
      queryFn: ({ signal }: { signal: AbortSignal }) => getMediaAsset(assetId, signal),
      enabled: Boolean(assetId),
      refetchInterval: (query: { state: { status: string; error: unknown } }) => {
        if (query.state.status !== "error") return false;
        const error = query.state.error;
        const status = error && typeof error === "object" && "status" in error ? error.status : null;
        return status === 401 || status === 403 || status === 404 ? false : 15_000;
      },
    })),
  });
}

export function useUploadMediaAsset() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ file, type, binding }: {
      file: File;
      type: MediaType;
      binding?: { operationId: string; outputPortId: string; sortOrder: number };
    }) => uploadMediaAsset(file, type, binding),
    onSuccess: async (asset) => {
      queryClient.setQueryData(mediaAssetKeys.detail(asset.id), asset);
      await queryClient.invalidateQueries({ queryKey: mediaAssetKeys.list(asset.type) });
    },
  });
}

export function useDeleteMediaAsset() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (assetId: string) => deleteMediaAsset(assetId),
    onSuccess: async (_result, assetId) => {
      queryClient.removeQueries({ queryKey: mediaAssetKeys.detail(assetId) });
      await queryClient.invalidateQueries({ queryKey: mediaAssetKeys.all });
    },
  });
}

export function useResolvedNodeAssets(graphId: string, nodeId: string, enabled = true) {
  return useQuery({
    queryKey: mediaAssetKeys.nodeOutput(graphId, nodeId),
    queryFn: ({ signal }) => resolveNodeAssets(graphId, nodeId, signal),
    enabled,
    refetchInterval: 5_000,
  });
}
