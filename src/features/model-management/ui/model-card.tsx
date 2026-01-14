import { Image as ImageIcon, Sparkles, Video } from "lucide-react";
import type { ModelCatalogItem } from "@/features/model-management/model/model-catalog";
import { cn } from "@/shared/lib/utils";
import { Badge } from "@/shared/ui/badge";

interface ModelCardProps {
  item: ModelCatalogItem;
}

const typeConfig = {
  image: {
    label: "IMAGE",
    className: "border-white/10 bg-black/80 text-primary",
    icon: ImageIcon,
    accentText: "text-primary",
    glowClass: "from-primary/35 via-transparent to-transparent",
  },
  video: {
    label: "VIDEO",
    className: "border-white/10 bg-black/80 text-accent-purple",
    icon: Video,
    accentText: "text-accent-purple",
    glowClass: "from-accent-purple/35 via-transparent to-transparent",
  },
};

function buildMeta(item: ModelCatalogItem) {
  const base = [
    {
      label: "PROVIDER",
      value: item.provider,
    },
  ];

  if (item.type === "image") {
    return [
      ...base,
      { label: "PIPELINE", value: item.meta.pipeline },
      {
        label: "SIZE",
        value: `${item.meta.defaultWidth}x${item.meta.defaultHeight}`,
      },
      {
        label: "INPUT",
        value: `${item.meta.maxInputImages}`,
      },
    ];
  }

  return [
    ...base,
    {
      label: "MODE",
      value: item.meta.supportsInitImage ? "I2V" : "T2V",
    },
    {
      label: "SIZE",
      value: `${item.meta.defaultWidth}x${item.meta.defaultHeight}`,
    },
    {
      label: "DURATION",
      value: `${item.meta.defaultDurationSec}s`,
    },
  ];
}

export function ModelCard({ item }: ModelCardProps) {
  const config = typeConfig[item.type];
  const TypeIcon = config.icon;
  const metaItems = buildMeta(item);

  return (
    <article className="group relative mb-6 break-inside-avoid overflow-hidden rounded-xl border border-white/5 bg-surface-dark shadow-lg transition-all hover:border-primary/50">
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
          {config.label}
        </div>
        {item.isDefault ? (
          <div className="absolute right-3 top-3 inline-flex items-center gap-1 rounded-md border border-primary/40 bg-primary/90 px-2 py-1 text-[10px] font-mono uppercase tracking-widest text-black">
            <Sparkles className="h-3.5 w-3.5" />
            DEFAULT
          </div>
        ) : null}
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
      </div>
    </article>
  );
}
