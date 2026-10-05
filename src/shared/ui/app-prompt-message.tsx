"use client";

import type { ComponentProps } from "react";
import { cn } from "@/shared/lib/utils";
import { AppFormMessage } from "./app-form";

const messageClassName = "text-xs text-destructive";

/** Prompt guidance and validation share a plain text presentation. */
export function AppPromptMessage({ className, ...props }: ComponentProps<"p">) {
  return <p role="alert" data-slot="prompt-message" className={cn(messageClassName, className)} {...props} />;
}

/** Keep the form error ID and message supplied by React Hook Form. */
export function AppPromptFormMessage({ className, ...props }: ComponentProps<typeof AppFormMessage>) {
  return <AppFormMessage role="alert" className={cn(messageClassName, className)} {...props} />;
}
