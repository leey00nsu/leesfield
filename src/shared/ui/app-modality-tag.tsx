import type { ComponentProps } from "react";
import { cn } from "@/shared/lib/utils";

export function AppModalityTag({ className, ...props }: ComponentProps<"span">) {
  return (
    <span
      className={cn(
        "rounded-md border border-white/10 bg-white/[0.035] px-2 py-1 text-xs text-white/62",
        className,
      )}
      {...props}
    />
  );
}
