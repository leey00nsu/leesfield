"use client";

import type { ComponentProps } from "react";
import { cn } from "@/shared/lib/utils";
import { Input } from "@/shared/ui/input";

type AppInputSurface = "default" | "toolbar" | "auth" | "profile" | "transparent";
type AppInputSize = "md" | "lg";
type AppInputProps = Omit<ComponentProps<typeof Input>, "size"> & {
  surface?: AppInputSurface;
  inputSize?: AppInputSize;
};

export const appInputSurfaceClassName =
  "w-full border border-white/10 text-white focus-visible:border-primary disabled:cursor-not-allowed disabled:opacity-60";

const appInputSurfaceClassNames: Record<AppInputSurface, string> = {
  default: "rounded-xl bg-black/40 px-4 text-sm",
  toolbar:
    "rounded-[1.5rem] bg-black/45 px-5 font-mono text-sm placeholder:text-white/38 focus-visible:ring-0",
  auth:
    "rounded-xl border-white/12 bg-[#111417] px-5 text-base placeholder:text-gray-500 focus-visible:ring-primary/70",
  profile:
    "rounded-lg bg-surface-lighter px-4 py-3 text-sm font-mono focus-visible:ring-1 focus-visible:ring-primary",
  transparent:
    "rounded-none border-0 bg-transparent shadow-none focus-visible:border-transparent focus-visible:ring-0",
};

const appInputSizeClassNames: Record<AppInputSize, string> = {
  md: "h-11",
  lg: "h-14",
};

export function AppInput({
  className,
  surface = "default",
  inputSize = "md",
  ...props
}: AppInputProps) {
  return (
    <Input
      data-app-input=""
      data-surface={surface}
      className={cn(
        appInputSurfaceClassName,
        appInputSizeClassNames[inputSize],
        appInputSurfaceClassNames[surface],
        className,
      )}
      {...props}
    />
  );
}
