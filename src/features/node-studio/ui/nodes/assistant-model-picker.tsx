"use client";

import { useMemo } from "react";
import { ModelSearchDialog, type NodeBananaProviderModel } from "@node-banana-runtime/runtime-entry";
import type { RuntimeLlmModel } from "@/shared/model-catalog/runtime-utils";
import { useSpacePreferences } from "../../hook/use-space-preferences";

type Props = {
  models: readonly RuntimeLlmModel[];
  selectedKey: string | null;
  disabled: boolean;
  loading: boolean;
  error: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (key: string) => void;
  onRefresh: () => void;
};

/** Adapts Leesfield's LLM catalog to the same browse component as media nodes. */
export function AssistantModelPicker({ models, selectedKey, disabled, loading, error, open, onOpenChange, onSelect, onRefresh }: Props) {
  const preferences = useSpacePreferences();
  const hostedModels = useMemo<NodeBananaProviderModel[]>(() => models.filter(model => model.isActive).map(model => {
    const capabilities: NodeBananaProviderModel["capabilities"] = ["text-to-text"];
    if (model.providerConfig.supports_images) capabilities.push("image-to-text", "video-to-text");
    return {
      id: model.key,
      modelId: model.providerConfig.model_id,
      name: model.label,
      provider: "openai_compatible",
      providerLabel: model.vendor,
      capabilities,
      description: null,
    };
  }), [models]);
  const recentModels = useMemo(() => (preferences?.data?.recentModelKeys ?? []).flatMap((key, index) => {
    const model = hostedModels.find(item => item.id === key);
    return model ? [{ modelId: model.id, provider: model.provider, displayName: model.name, timestamp: -index }] : [];
  }), [preferences?.data?.recentModelKeys, hostedModels]);

  return <ModelSearchDialog
    isOpen={open}
    onClose={() => onOpenChange(false)}
    initialCapabilityFilter="llm"
    hosted={{
      hostedModels,
      recentModels,
      selectedModelId: selectedKey,
      disabled,
      capabilityFilters: ["llm"],
      isLoading: loading,
      error,
      onRefresh: async () => { onRefresh(); },
      onTrackModelUsage: model => preferences?.trackModel(model.modelId),
      onHostedModelSelected: model => onSelect(model.id),
    }}
  />;
}
