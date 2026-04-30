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

interface GenerationPromptSurfaceProps {
  textarea: ReactNode;
  attachments?: ReactNode;
  header?: ReactNode;
  footer?: ReactNode;
  footerLeft?: ReactNode;
  footerRight?: ReactNode;
}

export function GenerationPromptSurface({
  textarea,
  attachments,
  header,
  footer,
  footerLeft,
  footerRight,
}: GenerationPromptSurfaceProps) {
  return (
    <div
      data-testid="shared-prompt-form-surface"
      className="relative rounded-xl border border-white/12 bg-black/18 transition-colors focus-within:border-primary/45"
    >
      {header}
      {textarea}
      {attachments}
      {footer ?? (
        <div className="flex flex-col gap-3 border-t border-white/12 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            {footerLeft}
          </div>
          <div className="flex shrink-0 items-center gap-2">{footerRight}</div>
        </div>
      )}
    </div>
  );
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
        "lf-editorial-panel lf-editorial-panel-borderless relative overflow-hidden rounded-[1.35rem] p-4",
        className,
      )}
    >
      <GenerationPromptSurface
        textarea={textarea}
        attachments={attachments}
        footerLeft={footerLeft}
        footerRight={footerRight}
      />
    </div>
  );
}
