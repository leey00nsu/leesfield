"use client";
import type { ComponentProps } from "react";
import { SelectContent, SelectTrigger } from "@/shared/ui/select";
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
  SelectGroup as AppSelectGroup,
  SelectItem as AppSelectItem,
  SelectLabel as AppSelectLabel,
  SelectSeparator as AppSelectSeparator,
  SelectValue as AppSelectValue,
} from "@/shared/ui/select";

export function AppSelectContent(props: ComponentProps<typeof SelectContent>) {
 return <SelectContent positionerClassName="z-[11000]" {...props} />;
}
