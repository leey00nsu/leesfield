import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Download,
  Image as ImageIcon,
  Loader2,
  Maximize2,
  RotateCcw,
  Video,
} from "lucide-react";
import type {
  GenerationHistoryItem,
  GenerationHistoryStatus,
} from "@/entities/generation/model/types";
import { cn } from "@/shared/lib/utils";

const statusConfig: Record<
  GenerationHistoryStatus,
  { label: string; className: string; icon: typeof Clock; spin?: boolean }
> = {
  pending: {
    label: "Pending",
    className: "border-amber-500/30 bg-amber-500/10 text-amber-300",
    icon: Clock,
  },
  processing: {
    label: "Processing",
    className: "border-sky-500/30 bg-sky-500/10 text-sky-300",
    icon: Loader2,
    spin: true,
  },
  completed: {
    label: "Completed",
    className: "border-primary/40 bg-primary/15 text-primary",
    icon: CheckCircle2,
  },
  failed: {
    label: "Failed",
    className: "border-red-500/30 bg-red-500/10 text-red-300",
    icon: AlertTriangle,
  },
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

const dateFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "2-digit",
  year: "numeric",
});

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown";
  return dateFormatter.format(date).toUpperCase();
}

export function HistoryItem({ item }: { item: GenerationHistoryItem }) {
  const status = statusConfig[item.status];
  const type = typeConfig[item.type];
  const StatusIcon = status.icon;
  const TypeIcon = type.icon;
  const previewUrl = item.thumbnailUrl ?? item.resultUrl;
  const showActions = item.status === "completed";
  const isVideo = item.type === "video";
  const downloadUrl =
    item.type === "image" && item.resultUrl
      ? `/api/image-generation/${item.id}/download?index=0`
      : item.resultUrl;

  return (
    <article className="group relative mb-6 break-inside-avoid rounded-xl border border-white/5 bg-surface-dark shadow-lg transition-all hover:border-primary/50">
      <div className="relative aspect-[4/5] w-full overflow-hidden rounded-t-xl bg-black">
        {previewUrl ? (
          isVideo ? (
            <video
              src={previewUrl}
              className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-105"
              muted
              loop
              playsInline
              preload="metadata"
            />
          ) : (
            <img
              src={previewUrl}
              alt="Generated preview"
              className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-105"
            />
          )
        ) : (
          <div className="absolute inset-0 bg-[radial-gradient(circle,_#333_1px,_transparent_1px)] opacity-30" />
        )}

        <div
          className={cn(
            "absolute left-3 top-3 inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-[10px] font-mono uppercase tracking-widest",
            type.className,
          )}
        >
          <TypeIcon className="h-3.5 w-3.5" />
          {type.label}
        </div>
        <div
          className={cn(
            "absolute right-3 top-3 inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-[10px] font-mono uppercase tracking-widest",
            status.className,
          )}
        >
          <StatusIcon className={cn("h-3.5 w-3.5", status.spin && "animate-spin")} />
          {status.label}
        </div>

        {item.status === "failed" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/70 px-4 text-center">
            <AlertTriangle className="h-6 w-6 text-red-300" />
            <p className="text-xs font-mono uppercase tracking-widest text-red-200">
              FAILED
            </p>
            {item.errorMessage ? (
              <p className="text-xs text-red-200/80">
                {item.errorMessage}
              </p>
            ) : null}
          </div>
        )}

        {(item.status === "pending" || item.status === "processing") && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/60">
            <div className="flex items-center gap-2 text-xs font-mono uppercase tracking-widest text-gray-200">
              <Loader2 className="h-4 w-4 animate-spin text-primary" />
              Generating...
            </div>
          </div>
        )}

        {showActions && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/60 opacity-0 transition-opacity duration-200 group-hover:opacity-100">
            <button
              type="button"
              className="flex items-center gap-2 rounded-full bg-primary px-6 py-3 text-xs font-bold uppercase tracking-wider text-black shadow-[0_0_20px_rgba(212,240,50,0.3)]"
            >
              <RotateCcw className="h-4 w-4" />
              Reuse Prompt
            </button>
            <div className="flex gap-2">
              {downloadUrl ? (
                <a
                  href={downloadUrl}
                  download={item.type === "video" ? true : undefined}
                  className="flex h-9 w-9 items-center justify-center rounded-full border border-white/20 bg-black/50 text-white backdrop-blur-md transition-colors hover:border-white hover:bg-black"
                  aria-label="Download"
                >
                  <Download className="h-4 w-4" />
                </a>
              ) : (
                <button
                  type="button"
                  disabled
                  className="flex h-9 w-9 items-center justify-center rounded-full border border-white/20 bg-black/50 text-white opacity-50"
                  aria-label="Download"
                >
                  <Download className="h-4 w-4" />
                </button>
              )}
              {item.resultUrl ? (
                <a
                  href={item.resultUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="flex h-9 w-9 items-center justify-center rounded-full border border-white/20 bg-black/50 text-white backdrop-blur-md transition-colors hover:border-white hover:bg-black"
                  aria-label="Open"
                >
                  <Maximize2 className="h-4 w-4" />
                </a>
              ) : (
                <button
                  type="button"
                  disabled
                  className="flex h-9 w-9 items-center justify-center rounded-full border border-white/20 bg-black/50 text-white opacity-50"
                  aria-label="Open"
                >
                  <Maximize2 className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      <div className="flex flex-col gap-3 border-t border-white/5 bg-surface-dark p-4 transition-colors group-hover:bg-surface-lighter">
        <p className="text-sm font-medium leading-relaxed text-gray-300 group-hover:text-white">
          {item.prompt}
        </p>
        <div className="flex items-center justify-between border-t border-white/5 pt-3">
          <div className="flex items-center gap-3">
            {item.model ? (
              <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-primary">
                {item.model}
              </span>
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
    <div className="mb-6 break-inside-avoid rounded-xl border border-white/5 bg-surface-dark shadow-lg">
      <div className="relative aspect-[4/5] w-full overflow-hidden rounded-t-xl bg-black">
        <div className="absolute inset-0 bg-gradient-to-br from-white/10 via-white/5 to-transparent" />
      </div>
      <div className="flex flex-col gap-3 border-t border-white/5 bg-surface-dark p-4">
        <div className="h-4 w-3/4 rounded-full bg-white/10" />
        <div className="flex items-center justify-between border-t border-white/5 pt-3">
          <div className="h-4 w-20 rounded-full bg-primary/20" />
          <div className="h-3 w-10 rounded-full bg-white/10" />
        </div>
      </div>
    </div>
  );
}
