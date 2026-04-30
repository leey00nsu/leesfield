import Image from "next/image";
import { AudioLines, Circle, Image as ImageIcon, MoreVertical, Sparkles, Video } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
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
    preview: "/assets/creative-studio/mirror-portrait.jpg",
    previewClassName: "from-primary/16 to-white/5",
  },
  video: {
    icon: Video,
    preview: "/assets/creative-studio/film-production.jpg",
    previewClassName: "from-accent-purple/16 to-white/5",
  },
  audio: {
    icon: AudioLines,
    preview: "/assets/creative-studio/audio-console.jpg",
    previewClassName: "from-primary/14 to-white/5",
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

function resolvePrimarySpec(item: ModelCatalogItem) {
  if (item.type === "image") {
    return `${item.meta.defaultWidth}:${item.meta.defaultHeight}`;
  }

  if (item.type === "video") {
    return `${item.meta.defaultDurationSec}s`;
  }

  return `${item.meta.defaultSpeed}x`;
}

function resolveSecondarySpec(item: ModelCatalogItem) {
  if (item.type === "image") {
    return `${item.meta.defaultSteps} steps`;
  }

  if (item.type === "video") {
    return `${item.meta.defaultFps} fps`;
  }

  return item.meta.supportsInputAudio ? "A2A" : "T2A";
}

function formatDate(value: string | undefined, locale: string) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";

  return new Intl.DateTimeFormat(locale, {
    month: "short",
    day: "numeric",
  }).format(date);
}

export function ModelCard({ item, onEdit }: ModelCardProps) {
  const tCard = useTranslations("model.card");
  const locale = useLocale();
  const config = typeConfig[item.type];
  const TypeIcon = config.icon;
  const modalities = resolveCatalogModalities(item);
  const isEnabled = item.isActive;

  return (
    <article
      data-model-row=""
      data-default={item.isDefault ? "true" : "false"}
      className={cn(
        "grid gap-4 border-b border-white/8 px-3 py-3 transition-colors last:border-b-0 hover:bg-white/[0.026] md:grid-cols-[8rem_minmax(16rem,1fr)_6.25rem_6.25rem_5.75rem_2.25rem] md:items-center md:px-4",
        item.isDefault && "rounded-[1.05rem] border border-primary/70 bg-primary/[0.035] shadow-[0_0_0_1px_rgba(212,240,50,0.12)]",
      )}
    >
      <div className="relative h-20 overflow-hidden rounded-xl border border-white/10 md:h-[4.8rem]">
        <Image
          src={config.preview}
          alt=""
          fill
          sizes="176px"
          className="object-cover opacity-80 saturate-[0.9]"
        />
        <div className={cn("absolute inset-0 bg-linear-to-br", config.previewClassName)} />
        <div className="absolute left-2 top-2 flex h-8 w-8 items-center justify-center rounded-lg border border-white/12 bg-background-dark/70 text-primary backdrop-blur">
          <TypeIcon className="h-4 w-4" />
        </div>
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

      <MetaColumn label={tCard("meta.updated")} value={formatDate(item.updatedAt, locale)} />
      <MetaColumn label={tCard("meta.defaultValue")} value={resolvePrimarySpec(item)} />
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
        <span className="ml-2 rounded-md border border-white/10 px-2 py-0.5 text-xs text-white/46 md:hidden">
          {resolveSecondarySpec(item)}
        </span>
      </div>

      <div className="flex items-center justify-end gap-2">
        <span className="hidden rounded-md border border-white/10 px-2 py-1 text-xs text-white/46 md:inline-flex">
          {resolveSecondarySpec(item)}
        </span>
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

function MetaColumn({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <div className="truncate text-sm font-semibold text-white/82 md:text-base">
        {value}
      </div>
      <div className="mt-1 text-xs font-semibold text-white/38">
        {label}
      </div>
    </div>
  );
}
