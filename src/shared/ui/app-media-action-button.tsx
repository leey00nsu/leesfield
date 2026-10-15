import type { ComponentProps } from "react";
import { AppButton, AppButtonPresentation } from "./app-button";
import { cn } from "@/shared/lib/utils";

const mediaActionClassName = "rounded-full px-3";

/** Upload and asset actions share one pill across forms and canvas nodes. */
export function AppMediaActionButton({ className, ...props }: Omit<ComponentProps<typeof AppButton>, "variant" | "size">) {
  return <AppButton type="button" variant="surface-muted" size="pill-sm"
    className={cn(mediaActionClassName, className)} {...props} />;
}

/** Noninteractive preview inside the landing page's single entry link. */
export function AppMediaActionPresentation({ className, ...props }: Omit<ComponentProps<typeof AppButtonPresentation>, "variant" | "size">) {
  return <AppButtonPresentation variant="surface-muted" size="pill-sm"
    className={cn(mediaActionClassName, className)} {...props} />;
}
