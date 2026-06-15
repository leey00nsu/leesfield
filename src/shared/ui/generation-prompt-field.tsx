import type { ReactNode } from "react";
import {
  AppPromptField,
  AppPromptSurface,
} from "@/shared/ui/app-prompt-surface";

interface GenerationPromptFieldProps {
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

interface GenerationPromptSurfaceProps {
  textarea: ReactNode;
  attachments?: ReactNode;
  header?: ReactNode;
  feedback?: ReactNode;
  footer?: ReactNode;
  footerLeft?: ReactNode;
  footerRight?: ReactNode;
}

export function GenerationPromptSurface({
  textarea,
  attachments,
  header,
  feedback,
  footer,
  footerLeft,
  footerRight,
}: GenerationPromptSurfaceProps) {
  return (
    <AppPromptSurface
      textarea={textarea}
      attachments={attachments}
      header={header}
      feedback={feedback}
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
  feedback,
  footer,
  footerLeft,
  footerRight,
  promptMeta,
  contentWrapper,
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
      feedback={feedback}
      footer={footer}
      footerLeft={footerLeft}
      footerRight={footerRight}
      promptMeta={promptMeta}
      contentWrapper={contentWrapper}
      className={className}
      ariaLabel={ariaLabel}
      testId={testId}
      surface={surface}
    />
  );
}
