"use client";

import type { ComponentProps } from "react";
import { AppButton } from "./app-button";
import { cn } from "@/shared/lib/utils";

/** Shared row states for searchable model and preset popovers. */
export function AppPickerItem({ selected = false, className, ...props }: Omit<ComponentProps<typeof AppButton>, "variant"> & { selected?: boolean }) {
  return <AppButton type="button" variant="ghost" data-app-picker-item="" data-selected={selected ? "" : undefined}
    aria-pressed={selected} className={cn("h-auto min-h-12 w-full justify-start whitespace-normal rounded-xl px-3 py-2.5 text-left", selected && "ring-1 ring-inset ring-data-accent/40", className)} {...props} />;
}
