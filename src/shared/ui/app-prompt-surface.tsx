import type { ReactNode } from "react";
import { AppCard } from "@/shared/ui/app-card";
import { cn } from "@/shared/lib/utils";

interface AppPromptSurfaceProps {
  textarea: ReactNode;
  attachments?: ReactNode;
  header?: ReactNode;
  footer?: ReactNode;
  footerLeft?: ReactNode;
  footerRight?: ReactNode;
  className?: string;
}

interface AppPromptFieldProps {
  textarea: ReactNode;
  attachments?: ReactNode;
  footerLeft?: ReactNode;
  footerRight?: ReactNode;
  className?: string;
  ariaLabel?: string;
}

export function AppPromptSurface({
  textarea,
  attachments,
  header,
  footer,
  footerLeft,
  footerRight,
  className,
}: AppPromptSurfaceProps) {
  return (
    <AppCard
      variant="prompt"
      data-testid="shared-prompt-form-surface"
      className={cn("rounded-xl", className)}
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
    </AppCard>
  );
}

export function AppPromptField({
  textarea,
  attachments,
  footerLeft,
  footerRight,
  className,
  ariaLabel,
}: AppPromptFieldProps) {
  return (
    <AppCard
      variant="editorial-flat"
      data-app-prompt-field=""
      role={ariaLabel ? "region" : undefined}
      aria-label={ariaLabel}
      className={cn(
        "relative rounded-[1.35rem] border-0 p-4 shadow-none",
        className,
      )}
    >
      <AppPromptSurface
        textarea={textarea}
        attachments={attachments}
        footerLeft={footerLeft}
        footerRight={footerRight}
      />
    </AppCard>
  );
}
