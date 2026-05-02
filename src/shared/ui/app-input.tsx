"use client";

import type { ComponentProps } from "react";
import { cn } from "@/shared/lib/utils";
import { Input } from "@/shared/ui/input";

export function AppInput({
  className,
  ...props
}: ComponentProps<typeof Input>) {
  return (
    <Input
      data-app-input=""
      className={cn(
        "h-11 w-full rounded-xl border-white/10 bg-black/40 px-4 text-sm text-white focus-visible:border-primary disabled:cursor-not-allowed disabled:opacity-60",
        className,
      )}
      {...props}
    />
  );
}
