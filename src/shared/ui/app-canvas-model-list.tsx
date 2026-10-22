"use client";

import { Check, Sparkles } from "lucide-react";
import { useCanvasTranslation } from "@/shared/i18n/use-canvas-translation";
import { cn } from "@/shared/lib/utils";
import { AppResourceList, AppResourceEmpty, appResourceRowLayoutClassName } from "./app-resource-list";
import { ResourceListLoading } from "./resource-list-loading";
import { ResourceRowButton, resourceRowInteractiveClassName } from "./brand/resource-row-link/resource-row-link";
import { AppModelIdentity } from "./app-model-identity";
import { AppButton } from "./app-button";

export interface AppCanvasModelListItem {
  id: string;
  name: string;
  modelId?: string;
  provider: string;
  type: "image" | "video" | "audio" | "llm";
  modalities: readonly string[];
}

export interface AppCanvasModelListProps {
  items: readonly AppCanvasModelListItem[];
  recentIds?: readonly string[];
  onSelect: (id: string) => void;
  selectedId?: string | null;
  disabled?: boolean;
  loading: boolean;
  error: string | null;
  onRetry?: () => void;
  onClear?: () => void;
}

export function AppCanvasModelList({ items, recentIds, onSelect, selectedId, disabled, loading, error, onRetry, onClear }: AppCanvasModelListProps) {
  const tc = useCanvasTranslation();
  return <div className="min-h-0 flex-1 overflow-y-auto p-4">
    {onClear && <AppButton className="mb-3" variant="surface" onClick={onClear} disabled={disabled}>{tc("Remove fallback")}</AppButton>}
    {loading ? <ResourceListLoading label={tc("Loading models...")} /> : error ? (
      <AppResourceEmpty icon={<Sparkles />} description={error}>
        {onRetry && <AppButton variant="surface" onClick={onRetry}>{tc("Try Again")}</AppButton>}
      </AppResourceEmpty>
    ) : !items.length ? (
      <AppResourceEmpty icon={<Sparkles />} title={tc("No models found")} description={tc("Try adjusting your search or filters")} />
    ) : <AppResourceList>{items.map(model => <div role="listitem" key={model.id}>
      <article data-model-row="" data-selected={selectedId === model.id} className={cn(appResourceRowLayoutClassName, resourceRowInteractiveClassName, selectedId === model.id && "bg-data-accent/10")}>
        <AppModelIdentity
          identifier={model.modelId ?? model.id}
          badge={recentIds?.includes(model.id) ? <span className="text-xs text-muted-foreground">{tc("Recently Used")}</span> : undefined}
          name={<ResourceRowButton disabled={disabled} aria-pressed={selectedId === model.id} onClick={() => onSelect(model.id)} className="text-left">{model.name}</ResourceRowButton>}
          provider={model.provider}
          type={model.type}
          modalities={[tc(model.type === "llm" ? "LLM" : model.type[0].toUpperCase() + model.type.slice(1)), ...model.modalities]}
        />
        {selectedId === model.id && <Check aria-hidden className="size-4 text-data-accent-foreground" />}
      </article>
    </div>)}</AppResourceList>}
  </div>;
}
