"use client";

import { useTranslations } from "next-intl";
import { AppSkeleton } from "./app-skeleton";
import { cn } from "@/shared/lib/utils";

/** Shared file-loading surface; does not intercept preview or player controls. */
export function AppMediaPreviewLoading({ className, label, decorative = false }: { className?: string; label?: string; decorative?: boolean }) {
  const t = useTranslations("mediaPreview");
  return <AppSkeleton surface="media" role={decorative ? undefined : "status"} aria-hidden={decorative || undefined} aria-label={decorative ? undefined : label ?? t("loading")}
    data-media-preview-loading="" className={cn("pointer-events-none absolute inset-0 rounded-[inherit] motion-reduce:animate-none", className)} />;
}
