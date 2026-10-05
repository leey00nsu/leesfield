"use client";
import { useQuery } from "@tanstack/react-query";
import { listPromptPresets } from "../api/prompt-preset-api";
import type { PromptPresetModality } from "@/shared/prompt-presets/prompt-preset-contract";

export const promptPresetQueryKey = ["prompt-presets"] as const;
export function usePromptPresetCatalog(modality?: PromptPresetModality, includeInactive = false, enabled = true) {
  return useQuery({
    queryKey: [...promptPresetQueryKey, modality ?? "all", includeInactive],
    queryFn: ({ signal }) => listPromptPresets(modality, includeInactive, signal),
    enabled, staleTime: 15_000, retry: 1,
  });
}

