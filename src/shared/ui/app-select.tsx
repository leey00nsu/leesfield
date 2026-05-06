"use client";

import type { ComponentProps } from "react";
import { cn } from "@/shared/lib/utils";
import {
  Select as AppSelectRoot,
  SelectContent as AppSelectContent,
  SelectGroup as AppSelectGroup,
  SelectItem as AppSelectItem,
  SelectLabel as AppSelectLabel,
  SelectSeparator as AppSelectSeparator,
  SelectTrigger,
  SelectValue as AppSelectValue,
} from "@/shared/ui/select";

export type AppSelectTriggerSurface = "default" | "toolbar";
export type AppSelectTriggerSize = "sm" | "md";

type AppSelectTriggerProps = ComponentProps<typeof SelectTrigger> & {
  surface?: AppSelectTriggerSurface;
  triggerSize?: AppSelectTriggerSize;
};

const appSelectTriggerSurfaceClassNames: Record<AppSelectTriggerSurface, string> = {
  default:
    "rounded-xl border-white/10 bg-surface-lighter px-3 text-sm font-medium text-white focus-visible:border-primary",
  toolbar: "rounded-xl border-white/10 bg-black/40 px-4 text-sm text-white",
};

const appSelectTriggerSizeClassNames: Record<AppSelectTriggerSize, string> = {
  sm: "h-8",
  md: "h-11",
};

export function AppSelectTrigger({
  className,
  surface = "default",
  triggerSize = "md",
  ...props
}: AppSelectTriggerProps) {
  return (
    <SelectTrigger
      data-app-select-trigger=""
      className={cn(
        appSelectTriggerSizeClassNames[triggerSize],
        appSelectTriggerSurfaceClassNames[surface],
        className,
      )}
      {...props}
    />
  );
}

export {
  AppSelectContent,
  AppSelectGroup,
  AppSelectItem,
  AppSelectLabel,
  AppSelectRoot,
  AppSelectSeparator,
  AppSelectValue,
};
