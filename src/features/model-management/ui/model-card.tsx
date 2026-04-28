import { AudioLines, Image as ImageIcon, Sparkles, Video } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ModelCatalogItem } from "@/features/model-management/model/model-catalog";
import { cn } from "@/shared/lib/utils";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { resolveModelOutcomeMetadata } from "@/shared/generation/model-outcome-metadata";
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
    className: "border-primary/30 bg-primary/10 text-primary",
    icon: ImageIcon,
    accentText: "text-primary",
    glowClass: "from-primary/20 via-creative-surface to-transparent",
  },
  video: {
    className: "border-accent-purple/30 bg-accent-purple/10 text-accent-purple",
    icon: Video,
    accentText: "text-accent-purple",
    glowClass: "from-accent-purple/20 via-creative-surface to-transparent",
  },
  audio: {
    className: "border-cyan-400/30 bg-cyan-400/10 text-cyan-300",
    icon: AudioLines,
    accentText: "text-cyan-300",
    glowClass: "from-cyan-400/20 via-creative-surface to-transparent",
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

function buildMeta(item: ModelCatalogItem, t: (key: string) => string) {
  const modalities = resolveCatalogModalities(item);
  const base = (modalities: string[]) => [
    { label: t("meta.provider"), value: item.provider },
    { label: t("meta.modality"), value: modalities.join(" · ") },
  ];

  if (item.type === "image") {
    return [
      ...base(modalities),
      { label: t("meta.pipeline"), value: item.meta.pipeline },
      {
        label: t("meta.size"),
        value: `${item.meta.defaultWidth}x${item.meta.defaultHeight}`,
      },
      {
        label: t("meta.input"),
        value: `${item.meta.maxInputImages}`,
      },
    ];
  }

  if (item.type === "video") {
    return [
      ...base(modalities),
      {
        label: t("meta.mode"),
        value: modalities.includes("I2V") ? "I2V" : "T2V",
      },
      {
        label: t("meta.size"),
        value: `${item.meta.defaultWidth}x${item.meta.defaultHeight}`,
      },
      {
        label: t("meta.duration"),
        value: `${item.meta.defaultDurationSec}s`,
      },
    ];
  }

  return [
    ...base(modalities),
    {
      label: t("meta.model"),
      value: item.meta.modelId,
    },
    {
      label: t("meta.speed"),
      value: `${item.meta.defaultSpeed}x`,
    },
    {
      label: t("meta.input"),
      value: item.meta.supportsInputAudio ? "A2A" : "T2A",
    },
  ];
}

export function ModelCard({ item, onEdit }: ModelCardProps) {
  const tCard = useTranslations("model.card");
  const tOutcome = useTranslations("model.outcome");
  const config = typeConfig[item.type];
  const TypeIcon = config.icon;
  const metaItems = buildMeta(item, tCard);
  const modalities = resolveCatalogModalities(item);
  const outcome = resolveModelOutcomeMetadata({
    key: item.key,
    type: item.type,
    modalities,
  });

  return (
    <article className="group relative break-inside-avoid overflow-hidden rounded-xl border border-creative-surface-border bg-creative-surface-muted transition-all hover:border-primary/45">
      <div className="relative min-h-40 w-full overflow-hidden bg-creative-surface">
        <div
          className={cn(
            "absolute inset-0 bg-linear-to-br opacity-90 transition-opacity duration-300 group-hover:opacity-100",
            config.glowClass,
          )}
        />
        <div
          className={cn(
            "absolute left-3 top-3 inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-[10px] font-mono uppercase tracking-widest",
            config.className,
          )}
        >
          <TypeIcon className="h-3.5 w-3.5" />
          {tCard(`type.${item.type}`)}
        </div>
        <div className="absolute right-3 top-3 flex flex-col items-end gap-2">
          {item.isDefault ? (
            <div className="inline-flex items-center gap-1 rounded-md border border-primary/40 bg-primary/90 px-2 py-1 text-[10px] font-mono uppercase tracking-widest text-black">
              <Sparkles className="h-3.5 w-3.5" />
              {tCard("default")}
            </div>
          ) : null}
          {!item.isActive ? (
            <div className="inline-flex items-center gap-1 rounded-md border border-white/10 bg-white/5 px-2 py-1 text-[10px] font-mono uppercase tracking-widest text-gray-300">
              {tCard("inactive")}
            </div>
          ) : null}
        </div>
        <div className="absolute inset-x-4 bottom-4 flex items-end justify-between gap-4">
          <div>
            <h3 className="text-lg font-bold leading-tight text-white">
              {item.label}
            </h3>
          </div>
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-black/20">
            <TypeIcon className={cn("h-6 w-6", config.accentText)} />
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-4 border-t border-white/5 p-4">
        <div className="grid gap-3">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-gray-500 font-mono">
              {tOutcome("labels.bestFor")}
            </p>
            <p className="mt-1 text-sm font-semibold text-white">
              {tOutcome(`profiles.${outcome.profile}.bestFor`)}
            </p>
          </div>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-gray-500 font-mono">
              {tOutcome("labels.style")}
            </p>
            <p className="mt-1 text-sm text-gray-300">
              {tOutcome(`profiles.${outcome.profile}.style`)}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {outcome.strengthKeys.map((strengthKey) => (
            <Badge
              key={`${item.key}-${strengthKey}`}
              variant="primary"
              className="px-2 py-0.5"
            >
              {tOutcome(
                `profiles.${outcome.profile}.strengths.${strengthKey}`,
              )}
            </Badge>
          ))}
        </div>

        <div className="flex flex-col gap-2 border-t border-white/5 pt-3">
          <p className="text-[10px] font-bold uppercase tracking-widest text-gray-500 font-mono">
            {tOutcome("labels.technical")}
          </p>
          <div className="flex flex-wrap gap-2">
            <Badge variant="outline" className="px-2 py-0.5 text-gray-300">
              {tOutcome("labels.key")}: {item.key}
            </Badge>
            <Badge variant="outline" className="px-2 py-0.5 text-gray-300">
              {item.vendor}
            </Badge>
            {metaItems.map((meta) => (
              <Badge
                key={`${item.key}-${meta.label}`}
                variant="muted"
                className="px-2 py-0.5 text-gray-400"
              >
                {meta.label}: {meta.value}
              </Badge>
            ))}
          </div>
        </div>

        {onEdit ? (
          <Button
            type="button"
            variant="surface"
            size="sm"
            className="mt-2 w-full"
            onClick={() => onEdit(item.key)}
          >
            {tCard("edit")}
          </Button>
        ) : null}
      </div>
    </article>
  );
}
