import {
  Circle,
  MoreVertical,
} from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import type { ModelCatalogItem } from "@/features/model-management/model/model-catalog";
import { cn } from "@/shared/lib/utils";
import {
  ResourceRowButton,
  resourceRowInteractiveClassName,
} from "@/shared/ui/brand/resource-row-link/resource-row-link";
import { AppModelIdentity } from "@/shared/ui/app-model-identity";
import { Badge } from "@/shared/ui/brand/badge/badge";
import { appResourceRowLayoutClassName } from "@/shared/ui/app-resource-list";
import {
  resolveAudioModalities,
  resolveImageModalities,
  resolveVideoModalities,
} from "@/shared/model-catalog/modality";

interface ModelCardProps {
  item: ModelCatalogItem;
  onEdit?: (key: string) => void;
}

function resolveCatalogModalities(item: ModelCatalogItem) {
  if (item.modalities) return item.modalities;
  if (item.type === "image") {
    return resolveImageModalities({
      maxInputImages: item.meta.maxInputImages,
    });
  }

  if (item.type === "video") {
    return resolveVideoModalities({
      supportsInitImage: item.meta.supportsInitImage,
      t2vModelId: item.meta.t2vModelId,
      i2vModelId: item.meta.i2vModelId,
    });
  }

  if (item.type === "llm") return item.meta.supportsImages ? ["Text", "Image", "Video"] : ["Text"];

  return resolveAudioModalities({
    supportsInputAudio: item.meta.supportsInputAudio,
  });
}

export function ModelCard({ item, onEdit }: ModelCardProps) {
  const ko = useLocale() === "ko";
  const tCard = useTranslations("model.card");
  const modalities = resolveCatalogModalities(item);
  const isEnabled = item.isActive;

  return (
    <article
      data-model-row=""
      data-default={item.isDefault ? "true" : "false"}
      className={cn(
        modelRowLayoutClassName,
        onEdit && resourceRowInteractiveClassName,
      )}
    >
      <AppModelIdentity identifier={item.key} provider={item.provider} type={item.type} modalities={[tCard(`type.${item.type}`), ...modalities]}
        name={onEdit ? <ResourceRowButton onClick={()=>onEdit(item.key)} className="text-left">{item.label}</ResourceRowButton> : item.label}
        badge={item.isDefault ? <Badge variant="secondary">{tCard("default")}</Badge> : undefined}
        audioLabel={item.audioReference ? ko ? "오디오 참조 지원" : "Audio reference supported" : undefined} />

      <div className="col-start-2 flex items-center gap-2 md:col-auto md:justify-start">
        <Circle
          className={cn(
            "h-3 w-3 fill-current",
            isEnabled ? "text-success-foreground" : "text-white/34",
          )}
        />
        <span
          className={cn(
            "text-xs font-medium",
            isEnabled ? "text-white/76" : "text-white/42",
          )}
        >
          {isEnabled ? tCard("enabled") : tCard("disabled")}
        </span>
      </div>

      <div className="flex items-center justify-end gap-2">
        {onEdit ? (
          <MoreVertical className="size-4 text-muted-foreground" aria-hidden />
        ) : null}
      </div>
    </article>
  );
}

export const modelRowLayoutClassName = appResourceRowLayoutClassName;
