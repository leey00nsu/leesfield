import type { ComponentProps } from "react";
import { AppCard } from "@/shared/ui/app-card";
import { cn } from "@/shared/lib/utils";

export function AppResultFrame({
  className,
  ...props
}: ComponentProps<typeof AppCard>) {
  return (
    <AppCard
      data-app-result-frame=""
      variant="result"
      className={cn("mx-auto w-full max-w-6xl rounded-[1.75rem]", className)}
      {...props}
    />
  );
}
