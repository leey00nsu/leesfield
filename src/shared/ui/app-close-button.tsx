"use client";
import type { ComponentProps } from "react";
import { X } from "lucide-react";
import { AppButton } from "./app-button";
import { CloseLabel } from "./close-label";
import { cn } from "@/shared/lib/utils";

export function AppCloseButton({className, children, ...props}: ComponentProps<typeof AppButton>) {
  return <AppButton type="button" variant="surface" size="icon-sm" {...props}
    className={cn("shrink-0 rounded-md", className)}>
    {children ?? <><X className="size-4" /><span className="sr-only"><CloseLabel /></span></>}
  </AppButton>;
}
