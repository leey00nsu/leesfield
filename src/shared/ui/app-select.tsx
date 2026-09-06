"use client";
import type { ComponentProps } from "react";
import { SelectTrigger } from "@/shared/ui/select";
export type AppSelectTriggerSurface = "default" | "toolbar";
export type AppSelectTriggerSize = "sm" | "md";
export function AppSelectTrigger({
  surface,
  triggerSize = "md",
  ...props
}: ComponentProps<typeof SelectTrigger> & {
  surface?: AppSelectTriggerSurface;
  triggerSize?: AppSelectTriggerSize;
}) {
  void surface;
  return (
    <SelectTrigger
      data-app-select-trigger=""
      size={triggerSize === "sm" ? "sm" : "default"}
      {...props}
    />
  );
}
export {
  Select as AppSelectRoot,
  SelectContent as AppSelectContent,
  SelectGroup as AppSelectGroup,
  SelectItem as AppSelectItem,
  SelectLabel as AppSelectLabel,
  SelectSeparator as AppSelectSeparator,
  SelectValue as AppSelectValue,
} from "@/shared/ui/select";
