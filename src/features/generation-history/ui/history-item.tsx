"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation } from "@tanstack/react-query";
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
  Trash2,
  Video,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import type {
  GenerationHistoryItem,
  GenerationHistoryStatus,
} from "@/entities/generation/model/types";
import { deleteHistoryItem } from "@/features/generation-history/api/history-delete-api";
import { cn } from "@/shared/lib/utils";
import { Button } from "@/shared/ui/button";
import { Badge } from "@/shared/ui/badge";
import { Skeleton } from "@/shared/ui/skeleton";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/shared/ui/alert-dialog";
import type {
  MonitoringRequestDetail,
  MonitoringRequestItem,
} from "@/features/monitoring-dashboard/model/types";
import { MonitoringRequestDetailDialog } from "@/features/monitoring-dashboard/ui/monitoring-request-detail-dialog";
import { toast } from "sonner";

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

export function HistoryItem({
  item,
  onDeleted,
}: {
  item: GenerationHistoryItem;
  onDeleted?: (item: Pick<GenerationHistoryItem, "id" | "type">) => void;
}) {
  const router = useRouter();
  const locale = useLocale();
  const tStatuses = useTranslations("history.statuses");
  const tTypes = useTranslations("history.types");
  const tStates = useTranslations("history.states");
  const tActions = useTranslations("history.actions");
  const tCommonActions = useTranslations("common.actions");
  const tHistory = useTranslations("history");
  const tDeleteDialog = useTranslations("history.deleteDialog");
  const tToasts = useTranslations("history.toasts");
  const [isCopied, setIsCopied] = useState(false);
  const [loadedPreviewUrl, setLoadedPreviewUrl] = useState<string | null>(null);
  const [failedPreviewUrl, setFailedPreviewUrl] = useState<string | null>(null);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isPromptDialogOpen, setIsPromptDialogOpen] = useState(false);
  const status = statusConfig[item.status];
  const type = typeConfig[item.type];
  const StatusIcon = status.icon;
  const TypeIcon = type.icon;
  const previewUrl = item.thumbnailUrl ?? item.resultUrl;
  const inputImages = item.inputImages ?? [];
  const hasInputImages = inputImages.length > 0;
  const showActions = item.status === "completed";
  const isVideo = item.type === "video";
  const canDelete = item.status === "completed" || item.status === "failed";
  const canShowViewMore = item.prompt.trim().length > 0;
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

  const timeZone = useMemo(
    () => Intl.DateTimeFormat().resolvedOptions().timeZone,
    [],
  );
  const monitoringRequest = useMemo<MonitoringRequestItem>(
    () => ({
      id: item.id,
      type: item.type,
      status: item.status,
      model: item.model ?? null,
      createdAt: item.createdAt,
      durationMs: null,
      apiKeyLabel: "-",
    }),
    [item.createdAt, item.id, item.model, item.status, item.type],
  );
  const monitoringDetailOverride = useMemo<MonitoringRequestDetail>(
    () => {
      const inputImages = item.inputImages ?? [];
      const assets =
        item.type === "video"
          ? item.resultUrl
            ? [
                {
                  url: item.resultUrl,
                  width: null,
                  height: null,
                  durationSec: null,
                },
              ]
            : []
          : item.resultUrl
            ? [
                {
                  url: item.resultUrl,
                  width: null,
                  height: null,
                  durationSec: null,
                },
              ]
            : item.thumbnailUrl
              ? [
                  {
                    url: item.thumbnailUrl,
                    width: null,
                    height: null,
                    durationSec: null,
                  },
                ]
              : [];

      return {
        id: item.id,
        type: item.type,
        status: item.status,
        model: item.model ?? null,
        prompt: item.prompt,
        createdAt: item.createdAt,
        updatedAt: item.createdAt,
        durationMs: null,
        progress: null,
        errorMessage: item.errorMessage ?? null,
        inputImages,
        assets,
      };
    },
    [
      item.createdAt,
      item.errorMessage,
      item.id,
      item.inputImages,
      item.model,
      item.prompt,
      item.resultUrl,
      item.status,
      item.thumbnailUrl,
      item.type,
    ],
  );

  const deleteMutation = useMutation({
    mutationFn: () => deleteHistoryItem({ id: item.id, type: item.type }),
    onSuccess: () => {
      toast.success(tToasts("deleteSuccess"));
      onDeleted?.({ id: item.id, type: item.type });
      setIsDeleteDialogOpen(false);
    },
    onError: () => {
      toast.error(tToasts("deleteError"));
    },
  });

  const handleReusePrompt = () => {
    const target = item.type === "video" ? "/video" : "/image";
    const trimmedPrompt = item.prompt.trim();
    if (!trimmedPrompt) return;

    const params = new URLSearchParams();
    params.set("prompt", trimmedPrompt);

    const model = item.model?.trim();
    if (model) {
      params.set("model", model);
    }

    if (item.type === "video") {
      const initImage = item.inputImages?.[0]?.trim();
      if (initImage) {
        params.set("initImage", initImage);
      }
    } else {
      const initImages = (item.inputImages ?? [])
        .map((value) => value.trim())
        .filter((value) => value.length > 0);
      initImages.forEach((value) => {
        params.append("initImage", value);
      });
    }

    router.push(`${target}?${params.toString()}`);
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
        <p className="min-h-[4.5rem] line-clamp-3 text-sm font-medium leading-relaxed text-gray-300 group-hover:text-white">
          {item.prompt}
        </p>
        {canShowViewMore ? (
          <>
            <Button
              type="button"
              variant="link"
              onClick={() => setIsPromptDialogOpen(true)}
              className="h-auto self-end p-0 text-xs font-bold uppercase tracking-wider text-gray-500 hover:text-primary"
            >
              {tActions("viewFullPrompt")}
            </Button>
            <MonitoringRequestDetailDialog
              open={isPromptDialogOpen}
              onOpenChange={(openValue) => setIsPromptDialogOpen(openValue)}
              request={monitoringRequest}
              timeZone={timeZone}
              detailOverride={monitoringDetailOverride}
            />
          </>
        ) : null}
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
          <div className="flex items-center gap-2">
            <TypeIcon className="h-4 w-4 text-gray-600" />
            <AlertDialog
              open={isDeleteDialogOpen}
              onOpenChange={(next) => {
                if (deleteMutation.isPending) return;
                setIsDeleteDialogOpen(next);
              }}
            >
              <AlertDialogTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  disabled={!canDelete || deleteMutation.isPending}
                  className={cn(
                    "h-8 w-8 rounded-lg text-gray-500 hover:bg-white/5 hover:text-white",
                    canDelete && "hover:text-red-300"
                  )}
                  aria-label={tCommonActions("remove")}
                  title={
                    canDelete
                      ? tCommonActions("remove")
                      : tStates("generating")
                  }
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>{tDeleteDialog("title")}</AlertDialogTitle>
                  <AlertDialogDescription>
                    {tDeleteDialog("description")}
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel disabled={deleteMutation.isPending}>
                    {tCommonActions("cancel")}
                  </AlertDialogCancel>
                  <AlertDialogAction
                    disabled={deleteMutation.isPending}
                    onClick={(event) => {
                      event.preventDefault();
                      if (!canDelete) return;
                      deleteMutation.mutate();
                    }}
                    className="bg-destructive text-white hover:bg-destructive/90"
                  >
                    {tDeleteDialog("confirm")}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </div>
      </div>
    </article>
  );
}

export function HistoryItemSkeleton() {
  return (
    <article className="group relative break-inside-avoid overflow-hidden rounded-xl border border-white/5 bg-surface-dark shadow-lg">
      <div className="relative aspect-[4/5] w-full overflow-hidden rounded-t-xl bg-black">
        <Skeleton className="absolute inset-0 rounded-none bg-white/10" />
        <div className="absolute inset-0 bg-linear-to-br from-white/10 via-white/5 to-transparent" />
        <Skeleton className="absolute left-3 top-3 h-6 w-16 rounded-md bg-white/15" />
        <Skeleton className="absolute right-3 top-3 h-6 w-20 rounded-md bg-white/15" />
      </div>
      <div className="flex flex-col gap-3 border-t border-white/5 bg-surface-dark p-4 transition-colors group-hover:bg-surface-lighter">
        <div className="flex min-h-[4.5rem] flex-col gap-2">
          <Skeleton className="h-4 w-full rounded-full bg-white/10" />
          <Skeleton className="h-4 w-11/12 rounded-full bg-white/10" />
          <Skeleton className="h-4 w-3/4 rounded-full bg-white/10" />
        </div>
        <Skeleton className="ml-auto h-4 w-16 rounded-full bg-white/10" />
        <div className="flex gap-2">
          <Skeleton className="h-12 w-12 rounded-lg bg-white/10" />
          <Skeleton className="h-12 w-12 rounded-lg bg-white/10" />
        </div>
        <div className="flex items-center justify-between border-t border-white/5 pt-3">
          <div className="flex items-center gap-3">
            <Skeleton className="h-5 w-24 rounded-full bg-primary/20" />
            <Skeleton className="h-3 w-16 rounded-full bg-white/10" />
          </div>
          <div className="flex items-center gap-2">
            <Skeleton className="h-8 w-8 rounded-lg bg-white/10" />
            <Skeleton className="h-8 w-8 rounded-lg bg-white/10" />
          </div>
        </div>
      </div>
    </article>
  );
}
