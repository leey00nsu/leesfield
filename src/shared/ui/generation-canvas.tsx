import type { ReactNode } from "react";
import { cn } from "@/shared/lib/utils";

type GenerationCanvasProps = {
  children: ReactNode;
  actions?: ReactNode;
  isGenerating: boolean;
  progressValue?: number;
  status: string;
  errorMessage?: string;
  className?: string;
};

export function GenerationCanvas({
  children,
  actions,
  isGenerating,
  progressValue = 0,
  status,
  errorMessage,
  className,
}: GenerationCanvasProps) {
  const showError = status === "failed" && !isGenerating;

  return (
    <div
      className={cn(
        "group relative flex aspect-video items-center justify-center overflow-hidden rounded-2xl border-2 border-dashed border-white/10 bg-black/40",
        className
      )}
    >
      <div className="absolute inset-0 bg-[radial-gradient(circle,#333_1px,transparent_1px)] opacity-20" />
      {actions ? (
        <div className="absolute right-4 top-4 flex gap-2">{actions}</div>
      ) : null}
      {children}

      {isGenerating && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 bg-black/70 backdrop-blur-sm">
          <div className="relative flex h-20 w-20 items-center justify-center">
            <div className="absolute inset-0 rounded-full border-4 border-white/10" />
            <div className="absolute inset-0 animate-spin rounded-full border-4 border-primary border-t-transparent" />
            <span className="text-sm font-bold text-white">
              {progressValue}%
            </span>
          </div>
          <p className="text-xs font-mono uppercase tracking-widest text-gray-300">
            Generating...
          </p>
        </div>
      )}

      {showError && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-2 bg-black/60 px-6 text-center">
          <p className="text-sm font-bold text-red-300">생성에 실패했습니다</p>
          <p className="text-xs font-mono text-gray-400">
            {errorMessage ?? "잠시 후 다시 시도해주세요."}
          </p>
        </div>
      )}
    </div>
  );
}
