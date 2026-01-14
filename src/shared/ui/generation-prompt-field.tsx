import type { ReactNode } from "react";
import { cn } from "@/shared/lib/utils";

type GenerationPromptFieldProps = {
  textarea: ReactNode;
  attachments?: ReactNode;
  footerLeft?: ReactNode;
  footerRight?: ReactNode;
  className?: string;
};

export function GenerationPromptField({
  textarea,
  attachments,
  footerLeft,
  footerRight,
  className,
}: GenerationPromptFieldProps) {
  return (
    <div className={cn("group relative", className)}>
      <div className="absolute -inset-0.5 rounded-xl bg-gradient-to-r from-primary/30 to-accent-purple/30 opacity-20 blur transition duration-500 group-focus-within:opacity-100" />
      <div className="relative rounded-xl border border-white/10 bg-surface-dark transition-colors focus-within:border-primary/50">
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
