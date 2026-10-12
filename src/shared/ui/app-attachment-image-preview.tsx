"use client";

import { AppAttachmentPreviewLink } from "./app-attachment-preview-link";

/** Data URLs cannot navigate a new top-level tab in Chromium. Use a local image blob. */
export function AppAttachmentImagePreview({ src, alt }: { src: string; alt: string }) {
  // eslint-disable-next-line @next/next/no-img-element
  const image = <img src={src} alt={alt} className="size-full object-cover" />;
  return <AppAttachmentPreviewLink src={src} label={alt} className="block size-full cursor-zoom-in">
    {image}
  </AppAttachmentPreviewLink>;
}
