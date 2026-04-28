import type { ReactNode } from "react";
import { cn } from "@/shared/lib/utils";

interface GenerationPromptFieldProps {
  textarea: ReactNode;
  attachments?: ReactNode;
  footerLeft?: ReactNode;
  footerRight?: ReactNode;
  className?: string;
}

export function GenerationPromptField({
  textarea,
  attachments,
  footerLeft,
  footerRight,
  className,
}: GenerationPromptFieldProps) {
  return (
    <div className={cn("group relative", className)}>
      <div className="absolute -inset-0.5 rounded-xl bg-linear-to-r from-primary/10 to-accent-purple/10 opacity-0 blur transition duration-300 group-focus-within:opacity-60" />
      <div className="relative rounded-xl border border-creative-surface-border bg-creative-surface transition-colors focus-within:border-primary/40">
        {textarea}
        {attachments}
        <div className="flex items-center justify-between border-t border-white/5 px-4 py-3">
          <div className="flex items-center gap-2">{footerLeft}</div>
          {footerRight}
        </div>
      </div>
    </div>
  );
}
