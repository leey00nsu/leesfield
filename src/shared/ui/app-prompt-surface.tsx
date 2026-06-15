import type { ReactNode } from "react";
import { AppCard } from "@/shared/ui/app-card";
import { cn } from "@/shared/lib/utils";

interface AppPromptSurfaceProps {
  textarea: ReactNode;
  attachments?: ReactNode;
  header?: ReactNode;
  feedback?: ReactNode;
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
  feedback?: ReactNode;
  footer?: ReactNode;
  footerLeft?: ReactNode;
  footerRight?: ReactNode;
  promptMeta?: ReactNode;
  contentWrapper?: (children: ReactNode) => ReactNode;
  className?: string;
  ariaLabel?: string;
  testId?: string;
  surface?: "default" | "hero";
}

const appPromptFieldSurfaceClassNames: Record<
  NonNullable<AppPromptFieldProps["surface"]>,
  string
> = {
  default: "border-0 bg-[#0b0d0e] shadow-none",
  hero:
    "border border-white/12 bg-black/24 shadow-[0_24px_90px_rgba(0,0,0,0.42)] backdrop-blur-xl",
};

export function AppPromptSurface({
  textarea,
  attachments,
  header,
  feedback,
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
      {feedback ? (
        <div
          data-testid="shared-prompt-feedback"
          className="border-t border-white/8 px-4 py-2"
        >
          {feedback}
        </div>
      ) : null}
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
  feedback,
  footer,
  footerLeft,
  footerRight,
  promptMeta,
  contentWrapper,
  className,
  ariaLabel,
  testId,
  surface = "default",
}: AppPromptFieldProps) {
  const content = (
    <AppPromptSurface
      textarea={textarea}
      attachments={attachments}
      header={header}
      feedback={feedback}
      footer={footer}
      footerLeft={footerLeft}
      footerRight={footerRight}
      promptMeta={promptMeta}
    />
  );

  return (
    <AppCard
      variant="editorial-flat"
      data-app-prompt-field=""
      data-surface={surface}
      data-testid={testId}
      role={ariaLabel ? "region" : undefined}
      aria-label={ariaLabel}
      className={cn(
        "relative rounded-[1.35rem] p-4",
        appPromptFieldSurfaceClassNames[surface],
        className,
      )}
    >
      {contentWrapper ? contentWrapper(content) : content}
    </AppCard>
  );
}
