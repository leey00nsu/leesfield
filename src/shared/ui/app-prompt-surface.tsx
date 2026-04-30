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
  promptMeta?: ReactNode;
  className?: string;
}

interface AppPromptFieldProps {
  textarea: ReactNode;
  attachments?: ReactNode;
  header?: ReactNode;
  footer?: ReactNode;
  footerLeft?: ReactNode;
  footerRight?: ReactNode;
  promptMeta?: ReactNode;
  className?: string;
  ariaLabel?: string;
  testId?: string;
}

export function AppPromptSurface({
  textarea,
  attachments,
  header,
  footer,
  footerLeft,
  footerRight,
  promptMeta,
  className,
}: AppPromptSurfaceProps) {
  return (
    <AppCard
      variant="prompt"
      data-testid="shared-prompt-form-surface"
      className={cn("rounded-xl", className)}
    >
      {header}
      <div className="relative">
        {textarea}
        {promptMeta ? (
          <div
            data-testid="shared-prompt-meta"
            className="pointer-events-none absolute bottom-3 right-4 text-[10px] font-mono text-gray-600"
          >
            {promptMeta}
          </div>
        ) : null}
      </div>
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
  header,
  footer,
  footerLeft,
  footerRight,
  promptMeta,
  className,
  ariaLabel,
  testId,
}: AppPromptFieldProps) {
  return (
    <AppCard
      variant="editorial-flat"
      data-app-prompt-field=""
      data-testid={testId}
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
        header={header}
        footer={footer}
        footerLeft={footerLeft}
        footerRight={footerRight}
        promptMeta={promptMeta}
      />
    </AppCard>
  );
}
