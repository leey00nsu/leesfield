import type { ReactNode } from "react";
import {
  AppPromptField,
  AppPromptSurface,
} from "@/shared/ui/app-prompt-surface";

interface GenerationPromptFieldProps {
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
  surface?: "default" | "hero";
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
    <AppPromptSurface
      textarea={textarea}
      attachments={attachments}
      header={header}
      footer={footer}
      footerLeft={footerLeft}
      footerRight={footerRight}
    />
  );
}

export function GenerationPromptField({
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
  surface,
}: GenerationPromptFieldProps) {
  return (
    <AppPromptField
      textarea={textarea}
      attachments={attachments}
      header={header}
      footer={footer}
      footerLeft={footerLeft}
      footerRight={footerRight}
      promptMeta={promptMeta}
      className={className}
      ariaLabel={ariaLabel}
      testId={testId}
      surface={surface}
    />
  );
}
