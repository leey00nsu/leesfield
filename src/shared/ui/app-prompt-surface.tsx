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
  default: "border-0 bg-card shadow-none",
  hero: "border border-white/12 bg-black/24 shadow-[0_24px_90px_rgba(0,0,0,0.42)] backdrop-blur-xl",
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
      className={cn(
        "relative grid min-w-0 flex-1 gap-0 py-0 sm:grid-cols-[minmax(0,1fr)_auto]",
        className,
      )}
    >
      <div className="flex min-w-0 flex-col">
        {header}
        {attachments}
        <div className="relative flex flex-1 flex-col [&_textarea]:flex-1">
          {textarea}
          {promptMeta ? (
            <div
              data-testid="shared-prompt-meta"
              className="pointer-events-none absolute bottom-3 right-4 text-xs text-muted-foreground"
            >
              {promptMeta}
            </div>
          ) : null}
        </div>
        {feedback ? (
          <div data-testid="shared-prompt-feedback" className="px-4 py-2">
            {feedback}
          </div>
        ) : null}
        {footer ?? (
          <div className="px-4 pb-4 pt-2">
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              {footerLeft}
            </div>
          </div>
        )}
      </div>
      {footerRight && (
        <div className="flex shrink-0 items-stretch gap-2 p-3 sm:pl-0 [&>button]:h-auto [&>a]:h-auto">
          {footerRight}
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
        surface === "hero"
          ? "relative rounded-[1.05rem] p-3 sm:p-4"
          : "relative gap-0 p-0",
        appPromptFieldSurfaceClassNames[surface],
        className,
      )}
    >
      {contentWrapper ? contentWrapper(content) : content}
    </AppCard>
  );
}
