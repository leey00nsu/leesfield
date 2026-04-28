import type { ReactNode } from "react";
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
      className={cn(
        "group relative flex aspect-video items-center justify-center overflow-hidden rounded-2xl border-2 border-dashed border-white/10 bg-background/40",
        className
      )}
    >
      <div className="absolute inset-0 bg-[radial-gradient(circle,#333_1px,transparent_1px)] opacity-20" />
      {actions ? (
        <div className="absolute right-4 top-4 flex gap-2">{actions}</div>
      ) : null}
      {showEmptyState ? emptyState : children}

      {isGenerating && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 bg-background/75 backdrop-blur-sm">
          <div className="relative flex h-20 w-20 items-center justify-center">
            <div className="absolute inset-0 rounded-full border-4 border-white/10" />
            <div className="absolute inset-0 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          </div>
          <p className="text-xs font-mono uppercase tracking-widest text-gray-300">
            {t("generating")}
          </p>
        </div>
      )}

      {showError && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-2 bg-background/70 px-6 text-center">
          <p className="text-sm font-bold text-red-300">{t("failedTitle")}</p>
          <p className="text-xs font-mono text-gray-400">
            {errorMessage ?? t("failedDescription")}
          </p>
        </div>
      )}
    </div>
  );
}
