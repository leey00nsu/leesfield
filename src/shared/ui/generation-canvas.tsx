"use client";
import { Loader2 } from "lucide-react";
import { AppSkeleton } from "@/shared/ui/app-skeleton";
import { useEffect, useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { cn } from "@/shared/lib/utils";

interface GenerationCanvasProps {
  children?: ReactNode;
  actions?: ReactNode;
  emptyState?: ReactNode;
  hasContent?: boolean;
  isGenerating: boolean;
  status: string;
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
        <div role="status" className="absolute inset-0 z-20 bg-[#090b0d]">
          <AppSkeleton surface="media" className="absolute inset-0 rounded-none motion-reduce:animate-none" data-testid="generation-skeleton" />
          <GenerationProgress status={status} />
        </div>
      )}

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

function GenerationProgress({ status }: { status: string }) {
  const t = useTranslations("generation.canvas");
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    const started = Date.now();
    const timer = window.setInterval(() => setSeconds(Math.floor((Date.now() - started) / 1000)), 1000);
    return () => window.clearInterval(timer);
  }, []);
  const label = status === "pending" ? t("queued") : status === "uploading" ? t("uploading") : t("generating");
  return <div className="relative flex size-full flex-col items-center justify-center gap-2 text-sm text-foreground">
    <Loader2 className="size-6 animate-spin motion-reduce:animate-none" aria-hidden="true" />
    <span className="sr-only">{label}</span>
    <span aria-live="off" className="text-xs tabular-nums text-muted-foreground">{t("waitingTime", { seconds })}</span>
  </div>;
}
