import type { ReactNode } from "react";
import {
  AppPromptField,
  AppPromptSurface,
} from "@/shared/ui/app-prompt-surface";

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
  footerLeft,
  footerRight,
  className,
  ariaLabel,
}: GenerationPromptFieldProps) {
  return (
    <AppPromptField
      textarea={textarea}
      attachments={attachments}
      footerLeft={footerLeft}
      footerRight={footerRight}
      className={className}
      ariaLabel={ariaLabel}
    />
  );
}
