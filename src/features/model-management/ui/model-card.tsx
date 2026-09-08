import {
  AudioLines,
  Circle,
  Image as ImageIcon,
  MoreVertical,
  Video,
} from "lucide-react";
import { useTranslations } from "next-intl";
import type { ModelCatalogItem } from "@/features/model-management/model/model-catalog";
import { cn } from "@/shared/lib/utils";
import {
  ResourceRowButton,
  resourceRowInteractiveClassName,
} from "@/shared/ui/brand/resource-row-link/resource-row-link";
import { Badge } from "@/shared/ui/brand/badge/badge";
import {
  resolveAudioModalities,
  resolveImageModalities,
  resolveVideoModalities,
} from "@/shared/model-catalog/modality";

interface ModelCardProps {
  item: ModelCatalogItem;
  onEdit?: (key: string) => void;
}

const neutralTypeCardIconClassName = "text-white/66";
const neutralTypeCardSurfaceClassName = "border-white/10 bg-white/[0.035]";

const typeConfig = {
  image: {
    icon: ImageIcon,
    iconClassName: neutralTypeCardIconClassName,
    surfaceClassName: neutralTypeCardSurfaceClassName,
  },
  video: {
    icon: Video,
    iconClassName: neutralTypeCardIconClassName,
    surfaceClassName: neutralTypeCardSurfaceClassName,
  },
  audio: {
    icon: AudioLines,
    iconClassName: neutralTypeCardIconClassName,
    surfaceClassName: neutralTypeCardSurfaceClassName,
  },
};

function resolveCatalogModalities(item: ModelCatalogItem) {
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

  return resolveAudioModalities({
    supportsInputAudio: item.meta.supportsInputAudio,
  });
}

export function ModelCard({ item, onEdit }: ModelCardProps) {
  const tCard = useTranslations("model.card");
  const config = typeConfig[item.type];
  const TypeIcon = config.icon;
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
      <div
        data-model-type-icon=""
        className={cn(
          "flex size-10 items-center justify-center rounded-md border",
          config.surfaceClassName,
        )}
      >
        <TypeIcon className={cn("h-6 w-6", config.iconClassName)} />
      </div>

      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="truncate text-sm font-medium text-foreground">
            {onEdit ? (
              <ResourceRowButton
                onClick={() => onEdit(item.key)}
                className="text-left"
              >
                {item.label}
              </ResourceRowButton>
            ) : (
              item.label
            )}
          </h3>
          {item.isDefault ? (
            <Badge variant="secondary">{tCard("default")}</Badge>
          ) : null}
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <span>{item.vendor}</span>
          <span
            className="h-1 w-1 rounded-full bg-white/22"
            aria-hidden="true"
          />
          <span>{tCard(`type.${item.type}`)}</span>
          {modalities.map((modality) => (
            <span
              key={`${item.key}-${modality}`}
              className="rounded-md border border-white/10 bg-white/[0.035] px-2 py-1 text-white/62"
            >
              {modality}
            </span>
          ))}
        </div>
      </div>

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

export const modelRowLayoutClassName = "grid grid-cols-[2.5rem_minmax(0,1fr)_auto] items-center gap-4 border-b px-4 py-5 md:grid-cols-[2.5rem_minmax(0,1fr)_6rem_2rem]";
