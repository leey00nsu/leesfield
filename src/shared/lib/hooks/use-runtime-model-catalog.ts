"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import type {
  RuntimeImageModel,
  RuntimeModelBase,
  RuntimeVideoModel,
} from "@/shared/model-catalog/runtime-utils";
import {
  isRuntimeImageModel,
  isRuntimeVideoModel,
} from "@/shared/model-catalog/runtime-utils";

type ModelCatalogResponse = {
  items: RuntimeModelBase[];
};

const RUNTIME_MODELS_QUERY_KEY = ["runtime-models"] as const;

async function fetchRuntimeModelCatalog(
  signal?: AbortSignal,
): Promise<RuntimeModelBase[]> {
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

  return Array.isArray(payload?.items) ? payload.items : [];
}

export function useRuntimeModelCatalog() {
  const queryResult = useQuery({
    queryKey: RUNTIME_MODELS_QUERY_KEY,
    queryFn: ({ signal }) => fetchRuntimeModelCatalog(signal),
    staleTime: 15_000,
    gcTime: 5 * 60_000,
    retry: 1,
  });

  const items = useMemo(() => queryResult.data ?? [], [queryResult.data]);
  const imageModels = useMemo<RuntimeImageModel[]>(
    () => items.filter(isRuntimeImageModel),
    [items],
  );
  const videoModels = useMemo<RuntimeVideoModel[]>(
    () => items.filter(isRuntimeVideoModel),
    [items],
  );

  return {
    items,
    imageModels,
    videoModels,
    isLoading: queryResult.isLoading,
    error:
      queryResult.error instanceof Error
        ? queryResult.error.message
        : queryResult.error
          ? "MODEL_CATALOG_FETCH_FAILED"
          : null,
    refetch: queryResult.refetch,
  };
}
