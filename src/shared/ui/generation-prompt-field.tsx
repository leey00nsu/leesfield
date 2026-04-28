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
      className={cn("group relative", className)}
    >
      <div className="absolute -inset-0.5 rounded-[2rem] bg-linear-to-r from-primary/10 via-white/5 to-accent-purple/10 opacity-60 blur transition duration-300 group-focus-within:opacity-100" />
      <div className="relative rounded-[2rem] border border-creative-surface-border bg-creative-surface shadow-[0_18px_80px_rgba(0,0,0,0.38)] transition-colors focus-within:border-primary/40">
        {textarea}
        {attachments}
        <div className="flex flex-col gap-3 border-t border-white/5 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            {footerLeft}
          </div>
          <div className="flex shrink-0 items-center gap-2">{footerRight}</div>
        </div>
      </div>
    </div>
  );
}
