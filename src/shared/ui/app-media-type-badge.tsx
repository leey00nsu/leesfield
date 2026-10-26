"use client";

import { AudioLines, Image as ImageIcon, Video, Sparkles } from "lucide-react";
import { useTranslations } from "next-intl";
import type { MediaType } from "@/shared/media-assets/media-asset-contract";
import { cn } from "@/shared/lib/utils";
import { AppBadge } from "@/shared/ui/app-badge";

const mediaIcons = { image: ImageIcon, video: Video, audio: AudioLines, assistant: Sparkles };

export function AppMediaTypeBadge({ type, className }: { type: MediaType | "assistant"; className?: string }) {
  const t = useTranslations("history.types");
  const Icon = mediaIcons[type];
  const label = t(type);

  return (
    <AppBadge
      variant="overlay"
      title={label}
      data-media-type={type}
      className={cn("min-w-0 gap-1.5 backdrop-blur", className)}
    >
      <Icon className="size-3 shrink-0" aria-hidden="true" />
      <span className="truncate">{label}</span>
    </AppBadge>
  );
}
