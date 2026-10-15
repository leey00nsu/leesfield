"use client";
import { ExecutionTime } from "@/shared/ui/execution-time";
import { Loader2 } from "lucide-react";
import { AppSkeleton } from "@/shared/ui/app-skeleton";
import { type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { cn } from "@/shared/lib/utils";

interface GenerationCanvasProps {
  children?: ReactNode;
  actions?: ReactNode;
  emptyState?: ReactNode;
  hasContent?: boolean;
  isGenerating: boolean;
  status: string;
  createdAt?: string;
  finishedAt?: string | null;
  errorMessage?: string;
  className?: string;
}

export function GenerationCanvas({
  children,
  actions,
  emptyState,
  hasContent = true,
  isGenerating,
  status,
  createdAt,
  finishedAt,
  errorMessage,
  className,
}: GenerationCanvasProps) {
  const t = useTranslations("generation.canvas");
  const showError = status === "failed" && !isGenerating;
  const showEmptyState =
    Boolean(emptyState) && !hasContent && !isGenerating && !showError;

  return (
    <div
      data-testid="generation-canvas"
      className={cn(
        "group relative flex aspect-video items-center justify-center overflow-hidden bg-background/40",
        className,
      )}
    >
      {actions ? (
        <div className="absolute right-4 top-4 flex gap-2">{actions}</div>
      ) : null}
      {showEmptyState ? emptyState : children}

      {isGenerating && (
        <GenerationPending status={status} createdAt={createdAt} finishedAt={finishedAt} />
      )}

      {!isGenerating && ["completed", "failed", "cancelled"].includes(status) && <div className="absolute bottom-3 right-3 z-30 rounded bg-background/80 px-2 py-1 text-xs"><ExecutionTime createdAt={createdAt} finishedAt={finishedAt} status={status} /></div>}
      {showError && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-2 bg-background/70 px-6 text-center">
          <p className="text-sm font-bold text-red-300">{t("failedTitle")}</p>
          <p className="text-xs font-sans text-gray-400">
            {errorMessage ?? t("failedDescription")}
          </p>
        </div>
      )}
    </div>
  );
}

/** Shared pending media surface for generation results and library uploads. */
export function GenerationPending({ status, createdAt, finishedAt }: { status: string; createdAt?: string; finishedAt?: string | null }) {
  return <div role="status" className="absolute inset-0 z-20 bg-[#090b0d]">
    <AppSkeleton surface="media" className="absolute inset-0 rounded-none motion-reduce:animate-none" data-testid="generation-skeleton" />
    <GenerationProgress status={status} createdAt={createdAt} finishedAt={finishedAt} />
  </div>;
}

function GenerationProgress({ status, createdAt, finishedAt }: { status: string; createdAt?: string; finishedAt?: string | null }) {
  const t = useTranslations("generation.canvas");
  const label = status === "pending" ? t("queued") : status === "uploading" ? t("uploading") : t("generating");
  return <div className="relative flex size-full flex-col items-center justify-center gap-2 text-sm text-foreground">
    <Loader2 className="size-6 animate-spin motion-reduce:animate-none" aria-hidden="true" />
    <span>{label}</span>
    {createdAt && <ExecutionTime createdAt={createdAt} finishedAt={finishedAt} status={status} className="text-xs tabular-nums text-muted-foreground" />}
  </div>;
}
