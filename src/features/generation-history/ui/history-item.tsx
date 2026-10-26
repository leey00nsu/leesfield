"use client";

import { AppPreviewImage } from "@/shared/ui/app-preview-image";
import { AppVideoPlayer } from "@/shared/ui/app-video-player";
import { imageUrlsFor } from "@/shared/media-assets/image-variants";
import { useEffect, useRef, useMemo, useState } from "react";
import {
  AlertTriangle,
  AudioLines,
  Sparkles,
  CheckCircle2,
  Clock,
  Loader2,
} from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import type {
  GenerationHistoryItem,
  GenerationHistoryStatus,
} from "@/entities/generation/model/types";
import { AppButton } from "@/shared/ui/app-button";
import { AppBadge } from "@/shared/ui/app-badge";
import { AppMediaTypeBadge } from "@/shared/ui/app-media-type-badge";
import { AppSkeleton } from "@/shared/ui/app-skeleton";
import { appMediaGalleryTileClassName, appMediaPreviewCardClassName } from "@/shared/ui/app-media-gallery";
import { cn } from "@/shared/lib/utils";

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
  uploading: {
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
  cancelled: {
    className: "border-white/50 bg-neutral-300 text-black",
    icon: AlertTriangle,
  },
};

export function HistoryItem({
  item,
  autoplay = true,
  fit = "cover",
  onSelect,
  className,
}: {
  item: GenerationHistoryItem;
  autoplay?: boolean;
  fit?: "cover" | "contain";
  onDeleted?: (item: Pick<GenerationHistoryItem, "id" | "type">) => void;
  onSelect?: (item: GenerationHistoryItem) => void;
  className?: string;
}) {
  const locale = useLocale();
  const [durationState, setDurationState] = useState<{ source: string; seconds: number | null } | null>(null);
  const tStatuses = useTranslations("history.statuses");
  const tStates = useTranslations("history.states");
  const tActions = useTranslations("history.actions");
  const tHistory = useTranslations("history");
  const status = statusConfig[item.status];
  const StatusIcon = status.icon;
  const urls = item.type === "image" && item.resultUrl ? imageUrlsFor({url: item.resultUrl, imageVariants: item.imageVariants}, "list") : [item.thumbnailUrl ?? item.resultUrl].filter((url): url is string => Boolean(url));
  if (!item.imageVariants && item.thumbnailUrl) urls.unshift(item.thumbnailUrl);
  const candidates = [...new Set(urls)];
  const previewUrl = candidates[0];
  const source = JSON.stringify([item.id, item.type, candidates]);
  const mediaDuration = durationState?.source === source ? durationState.seconds : null;
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
    <article
      className={cn(
        "group relative overflow-hidden rounded-none bg-black",
        appMediaGalleryTileClassName,
        appMediaPreviewCardClassName,
        className,
      )}
    >
      <div className="relative aspect-square w-full overflow-hidden bg-[#090b0d]">
        {isAudio||item.type==="assistant" ? (
            <div className="absolute inset-0 flex min-h-0 flex-col items-center justify-center gap-4 overflow-hidden bg-card p-6">
              {item.type==="assistant"?<Sparkles className="h-8 w-8 shrink-0 text-primary"/>:<AudioLines className="h-8 w-8 shrink-0 text-primary"/>}
              <p className="line-clamp-4 max-w-full break-words text-center text-sm leading-6 text-foreground">{item.type==="assistant"?item.outputText||item.prompt:item.prompt}</p>
            </div>
          ) : previewUrl ? (
            <HistoryMedia key={candidates.join("|")} urls={candidates} type={item.type === "video" ? "video" : "image"} alt={tHistory("previewAlt")} autoplay={autoplay} fit={fit} onDuration={seconds => setDurationState({ source, seconds })} />
        ) : (
          <div className="absolute inset-0 bg-white/[0.045]" />
        )}

        <div data-media-preview-overlay="" className="absolute inset-0 bg-black/58 opacity-0 transition-opacity duration-200 group-hover:opacity-100 group-focus-within:opacity-100" />

        <div data-media-preview-overlay="" className="absolute inset-x-3 top-3 flex flex-wrap items-center gap-2">
          <AppMediaTypeBadge type={item.type} />
          {mediaDuration != null && <AppBadge variant="overlay">{mediaDuration.toFixed(1)}s</AppBadge>}
          <AppBadge
            className={cn(
              "gap-1.5",
              status.className,
            )}
          >
            <StatusIcon
              className={cn("h-3 w-3", status.spin && "animate-spin")}
            />
            {tStatuses(item.status)}
          </AppBadge>
        </div>


        {item.status === "failed" || item.status === "cancelled" ? (
          <div data-media-preview-overlay="" className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/45 px-4 text-center">
            <AlertTriangle className="h-7 w-7 text-red-200" />
            <span className="text-xs font-bold uppercase text-red-100">
              {tStatuses(item.status)}
            </span>
          </div>
        ) : null}

        {item.status === "pending" ||
        item.status === "processing" ||
        item.status === "uploading" ? (
          <div data-media-preview-overlay="" className="absolute inset-0 flex items-center justify-center bg-black/35">
            <Loader2 className="h-7 w-7 animate-spin text-primary" />
          </div>
        ) : null}

        <div data-media-preview-overlay="" className="pointer-events-none absolute inset-x-0 bottom-0 flex min-w-0 flex-col gap-1 bg-gradient-to-t from-black/95 via-black/70 to-transparent px-3 pt-12 pb-3 text-white">
          <span title={item.model ?? undefined} className="block truncate text-sm font-medium">{item.model || tHistory("states.unknownModel")}</span>
          <span className="text-[10px] text-white/65">{formattedDate}</span>
        </div>

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

export function HistoryItemSkeleton({
  className,
}: { className?: string } = {}) {
  return (
    <article
      data-testid="history-item-skeleton"
      className={cn("overflow-hidden bg-black", appMediaGalleryTileClassName, className)}
    >
      <div
        data-testid="history-item-skeleton-media"
        className="relative aspect-square w-full overflow-hidden bg-[#090b0d]"
      >
        <AppSkeleton
          data-testid="history-item-skeleton-media-fill"
          surface="media"
          className="absolute inset-0 rounded-none bg-white/10"
        />
      </div>
    </article>
  );
}

function HistoryMedia(props: { urls: string[]; type: "image" | "video"; alt: string; autoplay: boolean; fit: "cover" | "contain"; onDuration: (duration: number | null) => void }) {
  return props.type === "image" ? <AppPreviewImage sources={props.urls} alt={props.alt} loading="lazy" decoding="async" fetchPriority="low" retry className={cn("size-full", props.fit === "cover" ? "object-cover" : "object-contain")} /> : <HistoryVideo {...props} />;
}
function HistoryVideo({ urls, autoplay, fit, onDuration }: { urls: string[]; type: "image" | "video"; alt: string; autoplay: boolean; fit: "cover" | "contain"; onDuration: (duration: number | null) => void }) {
  const t = useTranslations("history.media");
  const actions = useTranslations("common.actions");
  const [state, setState] = useState<"loading" | "loaded" | "error">("loading");
  const [attempt, setAttempt] = useState(0);
  const [candidate, setCandidate] = useState(0);
  const url = urls[candidate];
  const videoRef = useRef<HTMLVideoElement>(null);
  const [visible, setVisible] = useState(() => typeof IntersectionObserver === "undefined");
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    if (typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting), { threshold: 0.01 });
    observer.observe(video);
    return () => observer.disconnect();
  }, [url, attempt]);
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    if (autoplay && visible) void video.play()?.catch(() => {});
    else video.pause();
  }, [autoplay, visible, url, attempt]);
  const failed = () => { if (candidate + 1 < urls.length) {setCandidate(candidate + 1); setState("loading");} else setState("error"); };
  const className = cn("h-full w-full transition-opacity motion-reduce:transition-none", fit === "cover" ? "object-cover" : "object-contain");
  return <>
    <AppVideoPlayer showLoadingWhenInactive controls={false} active={visible} ref={videoRef} autoPlay={autoplay && visible} key={`${candidate}-${attempt}`} src={url} className={className} muted loop playsInline preload="metadata" onLoadedMetadata={event => { const duration = event.currentTarget.duration; onDuration(Number.isFinite(duration) && duration > 0 ? duration : null); }} onLoadedData={() => setState("loaded")} onError={failed} />
    {state === "error" && <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 bg-card p-4 text-center text-sm">
      <span role="status">{t("error")}</span>
      <AppButton size="sm" variant="surface" onClick={() => { setState("loading"); setAttempt(value => value + 1); setCandidate(0); }}>{actions("retry")}</AppButton>
    </div>}
  </>;
}
