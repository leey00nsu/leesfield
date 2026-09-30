"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import type {
  RuntimeAudioModel,
  RuntimeImageModel,
  RuntimeLlmModel,
  RuntimeModelBase,
  RuntimeVideoModel,
} from "@/shared/model-catalog/runtime-utils";
import {
  isRuntimeAudioModel,
  isRuntimeImageModel,
  isRuntimeVideoModel,
} from "@/shared/model-catalog/runtime-utils";

type ModelCatalogResponse = {
  items: (RuntimeModelBase | RuntimeLlmModel)[];
};

const RUNTIME_MODELS_QUERY_KEY = ["runtime-models"] as const;

async function fetchRuntimeModelCatalog(
  signal?: AbortSignal,
): Promise<(RuntimeModelBase | RuntimeLlmModel)[]> {
  const response = await fetch("/api/models", {
    method: "GET",
    cache: "no-store",
    signal,
  });
  const payload = (await response.json().catch(() => null)) as
    | ModelCatalogResponse
    | { message?: string }
    | null;

  if (!response.ok) {
    const message = payload && "message" in payload ? payload.message : null;
    throw new Error(message ?? "MODEL_CATALOG_FETCH_FAILED");
  }

  if (
    payload &&
    typeof payload === "object" &&
    "items" in payload &&
    Array.isArray(payload.items)
  ) {
    return payload.items;
  }
  return [];
}

type UseRuntimeModelCatalogOptions = {
  enabled?: boolean;
};

export function useRuntimeModelCatalog(
  options: UseRuntimeModelCatalogOptions = {},
) {
  const enabled = options.enabled ?? true;
  const queryResult = useQuery({
    queryKey: RUNTIME_MODELS_QUERY_KEY,
    queryFn: ({ signal }) => fetchRuntimeModelCatalog(signal),
    staleTime: 15_000,
    gcTime: 5 * 60_000,
    retry: 1,
    enabled,
  });

  const items = useMemo(() => queryResult.data ?? [], [queryResult.data]);
  const mediaItems = useMemo(() => items.filter((item): item is RuntimeModelBase => item.type !== "llm"), [items]);
  const imageModels = useMemo<RuntimeImageModel[]>(
    () => mediaItems.filter(isRuntimeImageModel),
    [mediaItems],
  );
  const videoModels = useMemo<RuntimeVideoModel[]>(
    () => mediaItems.filter(isRuntimeVideoModel),
    [mediaItems],
  );
  const audioModels = useMemo<RuntimeAudioModel[]>(
    () => mediaItems.filter(isRuntimeAudioModel),
    [mediaItems],
  );
  const llmModels = useMemo<RuntimeLlmModel[]>(
    () => items.filter((item): item is RuntimeLlmModel => item.type === "llm"),
    [items],
  );

  return {
    items,
    imageModels,
    videoModels,
    audioModels,
    llmModels,
    isLoading: enabled ? queryResult.isLoading : false,
    error: !enabled
      ? null
      : queryResult.error instanceof Error
        ? queryResult.error.message
        : queryResult.error
          ? "MODEL_CATALOG_FETCH_FAILED"
          : null,
    refetch: queryResult.refetch,
  };
}
