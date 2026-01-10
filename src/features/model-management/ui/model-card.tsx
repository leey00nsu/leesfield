import { Image as ImageIcon, Sparkles, Video } from "lucide-react";
import type { ModelCatalogItem } from "@/features/model-management/model/model-catalog";
import { cn } from "@/shared/lib/utils";

type ModelCardProps = {
  item: ModelCatalogItem;
};

const typeConfig = {
  image: {
    label: "IMAGE",
    className: "border-white/10 bg-black/80 text-primary",
    icon: ImageIcon,
  },
  video: {
    label: "VIDEO",
    className: "border-white/10 bg-black/80 text-accent-purple",
    icon: Video,
  },
};

const metaBadgeBase =
  "rounded-full bg-white/5 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-gray-400";

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
        <div className="absolute inset-0 bg-[radial-gradient(circle,_#222_1px,_transparent_1px)] opacity-30" />
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent opacity-70 transition-opacity duration-300 group-hover:opacity-90" />
        <div
          className={cn(
            "absolute left-3 top-3 inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-[10px] font-mono uppercase tracking-widest",
            config.className,
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
          <span className="rounded-full bg-primary/10 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-primary">
            {item.vendor}
          </span>
        </div>
        <div className="flex flex-wrap gap-2">
          {metaItems.map((meta) => (
            <span
              key={`${item.key}-${meta.label}`}
              className={metaBadgeBase}
            >
              {meta.label}: {meta.value}
            </span>
          ))}
        </div>
      </div>
    </article>
  );
}
