"use client";

import { AppPreviewImage } from "@/shared/ui/app-preview-image";

import { AppAttachmentPreviewLink } from "./app-attachment-preview-link";

/** Data URLs cannot navigate a new top-level tab in Chromium. Use a local image blob. */
export function AppAttachmentImagePreview({ src, alt }: { src: string; alt: string }) {
  const image = <AppPreviewImage src={src} alt={alt} className="size-full object-cover" />;
  return <AppAttachmentPreviewLink src={src} label={alt} className="block size-full cursor-zoom-in">
    {image}
  </AppAttachmentPreviewLink>;
}
