import { Image as ImageIcon, Sparkles, Video } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ModelCatalogItem } from "@/features/model-management/model/model-catalog";
import { cn } from "@/shared/lib/utils";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import {
  resolveImageModalities,
  resolveVideoModalities,
} from "@/shared/model-catalog/modality";

interface ModelCardProps {
  item: ModelCatalogItem;
  onEdit?: (key: string) => void;
}

const typeConfig = {
  image: {
    className: "border-white/10 bg-black/80 text-primary",
    icon: ImageIcon,
    accentText: "text-primary",
    glowClass: "from-primary/35 via-transparent to-transparent",
  },
  video: {
    className: "border-white/10 bg-black/80 text-accent-purple",
    icon: Video,
    accentText: "text-accent-purple",
    glowClass: "from-accent-purple/35 via-transparent to-transparent",
  },
};

function buildMeta(item: ModelCatalogItem, t: (key: string) => string) {
  const modalities =
    item.type === "image"
      ? resolveImageModalities({ maxInputImages: item.meta.maxInputImages })
      : resolveVideoModalities({
          supportsInitImage: item.meta.supportsInitImage,
          t2vModelId: item.meta.t2vModelId,
          i2vModelId: item.meta.i2vModelId,
        });

  const base = [
    {
      label: t("meta.provider"),
      value: item.provider,
    },
    {
      label: t("meta.modality"),
      value: modalities.join(" · "),
    },
  ];

  if (item.type === "image") {
    return [
      ...base,
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

  return [
    ...base,
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

export function ModelCard({ item, onEdit }: ModelCardProps) {
  const tCard = useTranslations("model.card");
  const config = typeConfig[item.type];
  const TypeIcon = config.icon;
  const metaItems = buildMeta(item, tCard);

  return (
    <article className="group relative break-inside-avoid overflow-hidden rounded-xl border border-white/5 bg-surface-dark shadow-lg transition-all hover:border-primary/50">
      <div className="relative aspect-[4/5] w-full overflow-hidden bg-black">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,#1c1c1c_0,#0a0a0a_70%)]" />
        <div
          className={cn(
            "absolute inset-0 bg-linear-to-br opacity-70 transition-opacity duration-300 group-hover:opacity-95",
            config.glowClass
          )}
        />
        <div className="absolute inset-0 bg-[radial-gradient(circle,#222_1px,transparent_1px)] opacity-25" />
        <div className="absolute inset-0 bg-linear-to-t from-black/85 via-black/30 to-transparent" />
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-6 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full border border-white/10 bg-black/40 shadow-[0_0_30px_rgba(0,0,0,0.35)]">
            <TypeIcon className={cn("h-7 w-7", config.accentText)} />
          </div>
          <div className="space-y-1">
            <p className="text-sm font-bold uppercase tracking-widest text-white/80">
              {item.label}
            </p>
            <p className="text-[10px] font-mono uppercase tracking-[0.3em] text-gray-500">
              {item.key}
            </p>
          </div>
        </div>
        <div
          className={cn(
            "absolute left-3 top-3 inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-[10px] font-mono uppercase tracking-widest",
            config.className
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
      </div>
      <div className="flex flex-col gap-3 border-t border-white/5 bg-surface-dark p-4 transition-colors group-hover:bg-surface-lighter">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-base font-bold text-white leading-tight">
              {item.label}
            </h3>
            <p className="mt-1 text-xs font-mono text-gray-400">{item.key}</p>
          </div>
          <Badge variant="primary" className="px-2 py-1">
            {item.vendor}
          </Badge>
        </div>
        <div className="flex flex-wrap gap-2">
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
