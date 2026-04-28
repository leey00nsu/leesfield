"use client";

import { useMemo } from "react";
import {
  AlertTriangle,
  AudioLines,
  CheckCircle2,
  Clock,
  Image as ImageIcon,
  Loader2,
  Video,
} from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import type {
  GenerationHistoryItem,
  GenerationHistoryStatus,
} from "@/entities/generation/model/types";
import { cn } from "@/shared/lib/utils";
import { Badge } from "@/shared/ui/badge";
import { Skeleton } from "@/shared/ui/skeleton";

const statusConfig: Record<
  GenerationHistoryStatus,
  { className: string; icon: typeof Clock; spin?: boolean }
> = {
  pending: {
    className: "border-amber-300/70 bg-amber-300 text-black",
    icon: Clock,
  },
  processing: {
    className: "border-sky-300/70 bg-sky-300 text-black",
    icon: Loader2,
    spin: true,
  },
  completed: {
    className: "border-primary/80 bg-primary text-black",
    icon: CheckCircle2,
  },
  failed: {
    className: "border-red-300/70 bg-red-300 text-black",
    icon: AlertTriangle,
  },
};

const typeConfig = {
  image: { icon: ImageIcon },
  video: { icon: Video },
  audio: { icon: AudioLines },
};

export function HistoryItem({
  item,
  onSelect,
}: {
  item: GenerationHistoryItem;
  onDeleted?: (item: Pick<GenerationHistoryItem, "id" | "type">) => void;
  onSelect?: (item: GenerationHistoryItem) => void;
}) {
  const locale = useLocale();
  const tStatuses = useTranslations("history.statuses");
  const tTypes = useTranslations("history.types");
  const tStates = useTranslations("history.states");
  const tActions = useTranslations("history.actions");
  const tHistory = useTranslations("history");
  const status = statusConfig[item.status];
  const type = typeConfig[item.type];
  const StatusIcon = status.icon;
  const TypeIcon = type.icon;
  const previewUrl = item.thumbnailUrl ?? item.resultUrl;
  const isVideo = item.type === "video";
  const isAudio = item.type === "audio";

  const dateFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat(locale, {
        month: "short",
        day: "2-digit",
        year: "numeric",
      }),
    [locale],
  );
  const formattedDate = useMemo(() => {
    const date = new Date(item.createdAt);
    if (Number.isNaN(date.getTime())) return tStates("unknownDate");
    return dateFormatter.format(date);
  }, [dateFormatter, item.createdAt, tStates]);

  return (
    <article className="group relative break-inside-avoid overflow-hidden rounded-none bg-black">
      <div className="relative aspect-[4/5] w-full overflow-hidden bg-[#090b0d]">
        {previewUrl ? (
          isVideo ? (
            <video
              src={previewUrl}
              className="h-full w-full object-cover"
              muted
              loop
              playsInline
              preload="metadata"
            />
          ) : isAudio ? (
            <div className="flex h-full items-center justify-center bg-[radial-gradient(circle_at_50%_42%,rgba(212,240,50,0.2),transparent_34%),#090b0d]">
              <AudioLines className="h-12 w-12 text-primary" />
            </div>
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={previewUrl}
              alt={tHistory("previewAlt")}
              loading="lazy"
              decoding="async"
              fetchPriority="low"
              className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.035] group-focus-within:scale-[1.035]"
            />
          )
        ) : (
          <div className="absolute inset-0 bg-[radial-gradient(circle,#343a3d_1px,transparent_1px)] bg-[length:18px_18px] opacity-30" />
        )}

        <div className="absolute inset-0 bg-linear-to-t from-black/82 via-black/20 to-transparent opacity-0 transition-opacity duration-200 group-hover:opacity-100 group-focus-within:opacity-100" />

        <div className="absolute inset-x-3 top-3 flex flex-wrap items-center gap-2 opacity-0 transition-all duration-200 group-hover:opacity-100 group-focus-within:opacity-100">
          <Badge className="gap-1.5 rounded-full border-white/15 bg-black/55 px-2 py-1 text-[10px] font-bold uppercase text-white backdrop-blur">
            <TypeIcon className="h-3 w-3" />
            {tTypes(item.type)}
          </Badge>
          <Badge
            className={cn(
              "gap-1.5 rounded-full px-2 py-1 text-[10px] font-black uppercase",
              status.className,
            )}
          >
            <StatusIcon className={cn("h-3 w-3", status.spin && "animate-spin")} />
            {tStatuses(item.status)}
          </Badge>
        </div>

        <div className="absolute inset-x-3 bottom-3 flex flex-wrap items-center gap-2 opacity-0 transition-all duration-200 group-hover:opacity-100 group-focus-within:opacity-100">
          {item.model ? (
            <Badge className="max-w-full truncate rounded-full border-white/15 bg-black/55 px-2 py-1 text-[10px] font-bold text-white backdrop-blur">
              {item.model}
            </Badge>
          ) : null}
          <Badge className="rounded-full border-white/15 bg-black/55 px-2 py-1 text-[10px] font-bold text-white backdrop-blur">
            {formattedDate}
          </Badge>
        </div>

        {item.status === "failed" ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/45 px-4 text-center">
            <AlertTriangle className="h-7 w-7 text-red-200" />
            <span className="text-xs font-bold uppercase text-red-100">
              {tStates("failed")}
            </span>
          </div>
        ) : null}

        {item.status === "pending" || item.status === "processing" ? (
          <div className="absolute inset-0 flex items-center justify-center bg-black/35">
            <Loader2 className="h-7 w-7 animate-spin text-primary" />
          </div>
        ) : null}

        {onSelect ? (
          <button
            type="button"
            aria-label={tActions("viewDetail", { prompt: item.prompt })}
            onClick={() => onSelect(item)}
            className="absolute inset-0 z-10 cursor-zoom-in focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/80"
          />
        ) : null}
      </div>
    </article>
  );
}

export function HistoryItemSkeleton() {
  return (
    <article
      data-testid="history-item-skeleton"
      className="break-inside-avoid overflow-hidden bg-black"
    >
      <div
        data-testid="history-item-skeleton-media"
        className="relative aspect-[4/5] w-full overflow-hidden bg-[#090b0d]"
      >
        <Skeleton
          data-testid="history-item-skeleton-media-fill"
          className="absolute inset-0 rounded-none bg-white/10"
        />
      </div>
    </article>
  );
}
