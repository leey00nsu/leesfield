"use client";

import { useMediaAssetList } from "@/features/media-assets/hook/use-media-assets";

import type { NodeExecutionDto } from "../../model/node-execution-types";

export function useOperationOutputAssets(
  executions: readonly NodeExecutionDto[] | undefined,
  selectedOutputAssetId: string | null,
) {
  const latestCompleted = executions?.find(
    (execution) =>
      execution.executionKind === "media_operation" &&
      execution.status === "completed" &&
      execution.outputAssetIds.length > 0,
  );
  // A completed execution is history, not the current output selection. Once
  // the canonical selection is cleared, controls must stop preferring the
  // latest result and let the operation fall back to its input/source state.
  const assetIds = selectedOutputAssetId ? [selectedOutputAssetId] : [];
  const assetQueries = useMediaAssetList(assetIds);
  const assets = assetQueries.flatMap((query) => query.data ? [query.data] : []);

  return {
    assets,
    assetIds,
    latestCompleted,
    isLoading: assetQueries.some((query) => query.isLoading),
    isError: assetQueries.some((query) => query.isError),
  };
}
