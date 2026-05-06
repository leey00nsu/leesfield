"use client";

import type { ComponentProps } from "react";
import { cn } from "@/shared/lib/utils";
import { Input } from "@/shared/ui/input";

type AppInputSurface = "default" | "toolbar" | "auth" | "transparent";
type AppInputSize = "md" | "lg";
type AppInputProps = Omit<ComponentProps<typeof Input>, "size"> & {
  surface?: AppInputSurface;
  inputSize?: AppInputSize;
};

export const appInputShellClassName =
  "h-14 rounded-[1.5rem] border border-white/10 bg-black/45 text-white shadow-xs transition-colors focus-visible:border-primary focus-visible:ring-0";

export const appInputSurfaceClassName =
  "w-full disabled:cursor-not-allowed disabled:opacity-60";

const appInputSurfaceClassNames: Record<AppInputSurface, string> = {
  default: "px-5 text-sm placeholder:text-white/38",
  toolbar:
    "px-5 font-mono text-sm placeholder:text-white/38",
  auth:
    "px-5 text-base placeholder:text-white/38",
  transparent:
    "rounded-none border-0 bg-transparent shadow-none focus-visible:border-transparent focus-visible:ring-0",
};

const appInputSizeClassNames: Record<AppInputSize, string> = {
  md: "h-14",
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
        surface === "transparent" ? null : appInputShellClassName,
        appInputSizeClassNames[inputSize],
        appInputSurfaceClassNames[surface],
        className,
      )}
      {...props}
    />
  );
}
