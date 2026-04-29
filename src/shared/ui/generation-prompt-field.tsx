import type { ReactNode } from "react";
import { cn } from "@/shared/lib/utils";

interface GenerationPromptFieldProps {
  textarea: ReactNode;
  attachments?: ReactNode;
  footerLeft?: ReactNode;
  footerRight?: ReactNode;
  className?: string;
  ariaLabel?: string;
}

export function GenerationPromptField({
  textarea,
  attachments,
  footerLeft,
  footerRight,
  className,
  ariaLabel,
}: GenerationPromptFieldProps) {
  return (
    <div
      role={ariaLabel ? "region" : undefined}
      aria-label={ariaLabel}
      className={cn(
        "lf-editorial-panel relative overflow-hidden rounded-[1.35rem] p-4",
        className,
      )}
    >
      <div
        data-testid="generation-form-surface"
        className="relative rounded-xl border border-white/12 bg-black/18 transition-colors focus-within:border-primary/45"
      >
        {textarea}
        {attachments}
        <div className="flex flex-col gap-3 border-t border-white/12 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            {footerLeft}
          </div>
          <div className="flex shrink-0 items-center gap-2">{footerRight}</div>
        </div>
      </div>
    </div>
  );
}
