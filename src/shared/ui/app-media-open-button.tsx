"use client";

import { ExternalLink } from "lucide-react";
import { useTranslations } from "next-intl";
import { AppButton } from "./app-button";
import { cn } from "@/shared/lib/utils";

/** Open the original media using the same affordance as generation results. */
export function AppMediaOpenButton({ href, className, compact = false, isolateCanvasEvents = false }: {
  href: string; className?: string; compact?: boolean; isolateCanvasEvents?: boolean;
}) {
  const label = useTranslations("common.actions")("open");
  return <AppButton asChild variant="surface" size="icon-sm"
    className={cn(compact && "size-6 border-0 bg-black/60 text-white hover:bg-black/80 dark:bg-black/60 dark:hover:bg-black/80", className)}>
    <a href={href} target="_blank" rel="noopener noreferrer" title={label} aria-label={label}
      onPointerDown={isolateCanvasEvents ? event => event.stopPropagation() : undefined}
      onFocus={isolateCanvasEvents ? event => event.stopPropagation() : undefined}
      onKeyDown={isolateCanvasEvents ? event => event.stopPropagation() : undefined}
      onClick={isolateCanvasEvents ? event => event.stopPropagation() : undefined}>
      <ExternalLink className={compact ? "size-3.5" : "size-4"} aria-hidden="true" />
    </a>
  </AppButton>;
}
