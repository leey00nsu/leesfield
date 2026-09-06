"use client";

import { useInfiniteQuery, useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";

import type { MediaAssetCategory, MediaType } from "@/shared/media-assets/media-asset-contract";

import {
  deleteMediaAsset,
  getMediaAsset,
  listMediaAssets,
  resolveNodeAssets,
  uploadMediaAsset,
} from "../api/media-asset-api";

export const mediaAssetKeys = {
  all: ["media-assets"] as const,
  list: (type: MediaType, category?: MediaAssetCategory) => category
    ? [...mediaAssetKeys.all, "list", type, category] as const
    : [...mediaAssetKeys.all, "list", type] as const,
  detail: (assetId: string) => [...mediaAssetKeys.all, "detail", assetId] as const,
  nodeOutput: (graphId: string, nodeId: string) =>
    [...mediaAssetKeys.all, "node-output", graphId, nodeId] as const,
};

export function useMediaAssets(type: MediaType, enabled = true, category?: MediaAssetCategory) {
  return useInfiniteQuery({
    queryKey: mediaAssetKeys.list(type, category),
    queryFn: ({ pageParam, signal }) => listMediaAssets(type, pageParam, signal, category),
    initialPageParam: null as string | null,
    getNextPageParam: (page) => page.nextCursor ?? undefined,
    enabled,
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
