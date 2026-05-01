import { AudioLines, Circle, Image as ImageIcon, MoreVertical, Sparkles, Video } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ModelCatalogItem } from "@/features/model-management/model/model-catalog";
import { cn } from "@/shared/lib/utils";
import { AppButton } from "@/shared/ui/app-button";
import {
  resolveAudioModalities,
  resolveImageModalities,
  resolveVideoModalities,
} from "@/shared/model-catalog/modality";

interface ModelCardProps {
  item: ModelCatalogItem;
  onEdit?: (key: string) => void;
}

const typeConfig = {
  image: {
    icon: ImageIcon,
    iconClassName: "text-primary",
    surfaceClassName: "border-primary/18 bg-primary/[0.055]",
  },
  video: {
    icon: Video,
    iconClassName: "text-primary",
    surfaceClassName: "border-primary/18 bg-primary/[0.055]",
  },
  audio: {
    icon: AudioLines,
    iconClassName: "text-primary",
    surfaceClassName: "border-primary/18 bg-primary/[0.055]",
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
        "grid gap-4 border border-transparent border-b-white/8 px-3 py-3 transition-colors last:border-b-transparent hover:bg-white/[0.026] md:grid-cols-[4.75rem_minmax(16rem,1fr)_5.75rem_2.25rem] md:items-center md:px-4",
        item.isDefault && "rounded-[1.05rem] !border-primary/70 bg-primary/[0.035] ring-1 ring-primary/35",
      )}
    >
      <div
        data-model-type-icon=""
        className={cn(
          "flex h-14 w-14 items-center justify-center rounded-2xl border shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] md:h-16 md:w-16",
          config.surfaceClassName,
        )}
      >
        <TypeIcon className={cn("h-6 w-6", config.iconClassName)} />
      </div>

      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="truncate text-base font-semibold text-white md:text-lg">
            {item.label}
          </h3>
          {item.isDefault ? (
            <span className="inline-flex items-center gap-1 rounded-full border border-primary/45 bg-primary/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-primary">
              <Sparkles className="h-3 w-3" />
              {tCard("default")}
            </span>
          ) : null}
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs font-semibold text-white/46">
          <span>{item.vendor}</span>
          <span className="h-1 w-1 rounded-full bg-white/22" aria-hidden="true" />
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

      <div className="flex items-center gap-2 md:justify-start">
        <Circle
          className={cn(
            "h-3 w-3 fill-current",
            isEnabled ? "text-primary" : "text-white/34",
          )}
        />
        <span className={cn("text-sm font-semibold", isEnabled ? "text-white/76" : "text-white/42")}>
          {isEnabled ? tCard("enabled") : tCard("disabled")}
        </span>
      </div>

      <div className="flex items-center justify-end gap-2">
        {onEdit ? (
          <AppButton
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={tCard("edit")}
            onClick={() => onEdit(item.key)}
            className="text-white/52"
          >
            <MoreVertical className="h-5 w-5" />
          </AppButton>
        ) : null}
      </div>
    </article>
  );
}
