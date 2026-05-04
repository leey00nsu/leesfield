"use client";

import type { ComponentProps } from "react";
import { cn } from "@/shared/lib/utils";
import { Input } from "@/shared/ui/input";

export const appInputSurfaceClassName =
  "h-11 w-full rounded-xl border border-white/10 bg-black/40 px-4 text-sm text-white focus-visible:border-primary disabled:cursor-not-allowed disabled:opacity-60";

export function AppInput({
  className,
  ...props
}: ComponentProps<typeof Input>) {
  return (
    <Input
      data-app-input=""
      className={cn(appInputSurfaceClassName, className)}
      {...props}
    />
  );
}
