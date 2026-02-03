"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Copy,
  Download,
  Image as ImageIcon,
  Loader2,
  Maximize2,
  RotateCcw,
  Video,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import type {
  GenerationHistoryItem,
  GenerationHistoryStatus,
} from "@/entities/generation/model/types";
import { cn } from "@/shared/lib/utils";
import { Button } from "@/shared/ui/button";
import { Badge } from "@/shared/ui/badge";
import { Skeleton } from "@/shared/ui/skeleton";

const statusConfig: Record<
  GenerationHistoryStatus,
  { className: string; icon: typeof Clock; spin?: boolean }
> = {
  pending: {
    className: "border-amber-400/70 bg-amber-400 text-black",
    icon: Clock,
  },
  processing: {
    className: "border-sky-400/70 bg-sky-400 text-black",
    icon: Loader2,
    spin: true,
  },
  completed: {
    className: "border-primary/80 bg-primary text-black",
    icon: CheckCircle2,
  },
  failed: {
    className: "border-red-400/70 bg-red-400 text-black",
    icon: AlertTriangle,
  },
};

const typeConfig = {
  image: {
    className: "border-white/10 bg-black/80 text-primary",
    icon: ImageIcon,
  },
  video: {
    className: "border-white/10 bg-black/80 text-accent-purple",
    icon: Video,
  },
};

export function HistoryItem({ item }: { item: GenerationHistoryItem }) {
  const router = useRouter();
  const locale = useLocale();
  const tStatuses = useTranslations("history.statuses");
  const tTypes = useTranslations("history.types");
  const tStates = useTranslations("history.states");
  const tActions = useTranslations("history.actions");
  const tCommonActions = useTranslations("common.actions");
  const tHistory = useTranslations("history");
  const [isCopied, setIsCopied] = useState(false);
  const [loadedPreviewUrl, setLoadedPreviewUrl] = useState<string | null>(null);
  const [failedPreviewUrl, setFailedPreviewUrl] = useState<string | null>(null);
  const status = statusConfig[item.status];
  const type = typeConfig[item.type];
  const StatusIcon = status.icon;
  const TypeIcon = type.icon;
  const previewUrl = item.thumbnailUrl ?? item.resultUrl;
  const inputImages = item.inputImages ?? [];
  const hasInputImages = inputImages.length > 0;
  const showActions = item.status === "completed";
  const isVideo = item.type === "video";
  const isPreviewLoaded = !!previewUrl && !isVideo && loadedPreviewUrl === previewUrl;
  const isPreviewFailed = !!previewUrl && !isVideo && failedPreviewUrl === previewUrl;
  const shouldShowPreviewSkeleton =
    !!previewUrl && !isVideo && !isPreviewLoaded && !isPreviewFailed;
  const downloadUrl =
    item.type === "image" && item.resultUrl
      ? `/api/image-generation/${item.id}/download?index=0`
      : item.resultUrl;
  const dateFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat(locale, {
        month: "short",
        day: "2-digit",
        year: "numeric",
      }),
    [locale],
  );
  const formatDate = (value: string) => {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return tStates("unknownDate");
    return dateFormatter.format(date);
  };

  const handleReusePrompt = () => {
    if (!item.prompt.trim()) return;
    const target = item.type === "video" ? "/video" : "/image";
    const query = new URLSearchParams({ prompt: item.prompt }).toString();
    router.push(`${target}?${query}`);
  };

  const handleCopyPrompt = async () => {
    const text = item.prompt.trim();
    if (!text) return;

    try {
      await navigator.clipboard.writeText(text);
      setIsCopied(true);
      return;
    } catch {
      // fallback below
    }

    try {
      const textarea = document.createElement("textarea");
      textarea.value = text;
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
      setIsCopied(true);
    } catch {
      setIsCopied(false);
    }
  };

  useEffect(() => {
    if (!isCopied) return;
    const timer = window.setTimeout(() => setIsCopied(false), 1500);
    return () => window.clearTimeout(timer);
  }, [isCopied]);

  return (
    <article className="group relative break-inside-avoid overflow-hidden rounded-xl border border-white/5 bg-surface-dark shadow-lg transition-all hover:border-primary/50">
      <div className="relative aspect-[4/5] w-full overflow-hidden rounded-t-xl bg-black">
        {previewUrl ? (
          isVideo ? (
            <video
              src={previewUrl}
              className="h-full w-full object-contain"
              muted
              loop
              playsInline
              preload="metadata"
            />
          ) : (
            <>
              {shouldShowPreviewSkeleton ? (
                <Skeleton className="absolute inset-0 rounded-none bg-white/10" />
              ) : null}

              {isPreviewFailed ? (
                <div className="absolute inset-0 flex items-center justify-center bg-black">
                  <ImageIcon className="h-9 w-9 text-gray-600" aria-hidden="true" />
                  <span className="sr-only">{tHistory("previewAlt")}</span>
                </div>
              ) : (
                <>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={previewUrl}
                    alt={tHistory("previewAlt")}
                    loading="lazy"
                    decoding="async"
                    fetchPriority="low"
                    onLoad={() => {
                      setLoadedPreviewUrl(previewUrl);
                      setFailedPreviewUrl(null);
                    }}
                    onError={() => setFailedPreviewUrl(previewUrl)}
                    className={cn(
                      "h-full w-full object-contain transition-opacity duration-200",
                      isPreviewLoaded ? "opacity-100" : "opacity-0",
                    )}
                  />
                </>
              )}
            </>
          )
        ) : (
          <div className="absolute inset-0 bg-[radial-gradient(circle,#333_1px,transparent_1px)] opacity-30" />
        )}

        <Badge
          variant="outline"
          className={cn(
            "absolute left-3 top-3 gap-1.5 rounded-md px-2 py-1 text-[10px] font-mono uppercase tracking-widest",
            type.className
          )}
        >
          <TypeIcon className="h-3.5 w-3.5" />
          {tTypes(item.type)}
        </Badge>
        <Badge
          variant="outline"
          className={cn(
            "absolute right-3 top-3 gap-1.5 rounded-md px-2 py-1 text-[10px] font-mono uppercase tracking-widest",
            status.className
          )}
        >
          <StatusIcon
            className={cn("h-3.5 w-3.5", status.spin && "animate-spin")}
          />
          {tStatuses(item.status)}
        </Badge>

        {item.status === "failed" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/70 px-4 text-center">
            <AlertTriangle className="h-6 w-6 text-red-300" />
            <p className="text-xs font-mono uppercase tracking-widest text-red-200">
              {tStates("failed")}
            </p>
            {item.errorMessage ? (
              <p className="text-xs text-red-200/80">{item.errorMessage}</p>
            ) : null}
          </div>
        )}

        {(item.status === "pending" || item.status === "processing") && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/60">
            <div className="flex items-center gap-2 text-xs font-mono uppercase tracking-widest text-gray-200">
              <Loader2 className="h-4 w-4 animate-spin text-primary" />
              {tStates("generating")}
            </div>
          </div>
        )}

        {showActions && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/60 opacity-0 transition-opacity duration-200 group-hover:opacity-100">
            <Button
              type="button"
              className="h-auto rounded-full bg-primary px-6 py-3 text-xs font-bold uppercase tracking-wider text-black shadow-[0_0_20px_rgba(212,240,50,0.3)] transition-all hover:bg-primary-dark hover:shadow-[0_0_28px_rgba(212,240,50,0.45)]"
              onClick={handleReusePrompt}
            >
              <RotateCcw className="h-4 w-4" />
              {tActions("reusePrompt")}
            </Button>
            <Button
              type="button"
              onClick={handleCopyPrompt}
              variant="outline"
              className="h-auto rounded-full border-white/20 bg-black/40 px-5 py-2 text-[11px] font-bold uppercase tracking-wider text-white hover:border-primary/60 hover:text-primary"
            >
              <Copy className="h-4 w-4" />
              {isCopied ? tCommonActions("copied") : tActions("copyPrompt")}
            </Button>
            <div className="flex gap-2">
              {downloadUrl ? (
                <a
                  href={downloadUrl}
                  download={item.type === "video" ? true : undefined}
                  className="flex h-9 w-9 items-center justify-center rounded-full border border-white/20 bg-black/50 text-white backdrop-blur-md transition-colors hover:border-white hover:bg-black"
                  aria-label={tCommonActions("download")}
                >
                  <Download className="h-4 w-4" />
                </a>
              ) : (
                <Button
                  type="button"
                  disabled
                  variant="ghost"
                  size="icon"
                  className="h-9 w-9 rounded-full border border-white/20 bg-black/50 text-white opacity-50"
                  aria-label={tCommonActions("download")}
                >
                  <Download className="h-4 w-4" />
                </Button>
              )}
              {item.resultUrl ? (
                <a
                  href={item.resultUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="flex h-9 w-9 items-center justify-center rounded-full border border-white/20 bg-black/50 text-white backdrop-blur-md transition-colors hover:border-white hover:bg-black"
                  aria-label={tCommonActions("open")}
                >
                  <Maximize2 className="h-4 w-4" />
                </a>
              ) : (
                <Button
                  type="button"
                  disabled
                  variant="ghost"
                  size="icon"
                  className="h-9 w-9 rounded-full border border-white/20 bg-black/50 text-white opacity-50"
                  aria-label={tCommonActions("open")}
                >
                  <Maximize2 className="h-4 w-4" />
                </Button>
              )}
            </div>
          </div>
        )}
      </div>

      <div className="flex flex-col gap-3 border-t border-white/5 bg-surface-dark p-4 transition-colors group-hover:bg-surface-lighter">
        <p className="text-sm font-medium leading-relaxed text-gray-300 group-hover:text-white">
          {item.prompt}
        </p>
        {hasInputImages ? (
          <div className="flex flex-wrap gap-2">
            {inputImages.map((url, index) => (
              <div
                key={`${item.id}-input-${index}`}
                className="h-12 w-12 overflow-hidden rounded-lg border border-white/10 bg-black/40"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={url}
                  alt={tHistory("inputImageAlt")}
                  className="h-full w-full object-cover"
                />
              </div>
            ))}
          </div>
        ) : null}
        <div className="flex items-center justify-between border-t border-white/5 pt-3">
          <div className="flex items-center gap-3">
            {item.model ? (
              <Badge variant="primary" className="px-2 py-0.5">
                {item.model}
              </Badge>
            ) : null}
            <span className="text-[10px] font-mono text-gray-500">
              {formatDate(item.createdAt)}
            </span>
          </div>
          <TypeIcon className="h-4 w-4 text-gray-600" />
        </div>
      </div>
    </article>
  );
}

export function HistoryItemSkeleton() {
  return (
    <div className="break-inside-avoid rounded-xl border border-white/5 bg-surface-dark shadow-lg">
      <div className="relative aspect-[4/5] w-full overflow-hidden rounded-t-xl bg-black">
        <Skeleton className="absolute inset-0 rounded-none bg-white/10" />
        <div className="absolute inset-0 bg-linear-to-br from-white/10 via-white/5 to-transparent" />
      </div>
      <div className="flex flex-col gap-3 border-t border-white/5 bg-surface-dark p-4">
        <Skeleton className="h-4 w-3/4 rounded-full bg-white/10" />
        <div className="flex items-center justify-between border-t border-white/5 pt-3">
          <Skeleton className="h-4 w-20 rounded-full bg-primary/20" />
          <Skeleton className="h-3 w-10 rounded-full bg-white/10" />
        </div>
      </div>
    </div>
  );
}
