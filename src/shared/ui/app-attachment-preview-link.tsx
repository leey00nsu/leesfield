"use client";

import { useEffect, useRef, type ComponentProps } from "react";
import { useTranslations } from "next-intl";
import { isAllowedMediaMimeType, type MediaType } from "@/shared/media-assets/media-asset-contract";

export function AppAttachmentPreviewLink({ src, label, children, className = "block size-full", ...events }: {
  src: string; label: string;
} & Pick<ComponentProps<"a">, "children" | "className" | "onPointerEnter" | "onPointerLeave" | "onFocus" | "onBlur" | "onClick">) {
  const open = useTranslations("common.actions")("open");
  const link = useRef<HTMLAnchorElement>(null);
  useEffect(() => {
    const comma = src.indexOf(",");
    if (comma < 0 || comma > 100 || !URL.createObjectURL) return;
    const header = src.slice(0, comma).match(/^data:((image|video|audio)\/[a-z0-9.+-]+);base64$/i);
    if (!header || !isAllowedMediaMimeType(header[2].toLowerCase() as MediaType, header[1].toLowerCase())) return;
    let url: string;
    try {
      const binary = atob(src.slice(comma + 1));
      url = URL.createObjectURL(new Blob([Uint8Array.from(binary, char => char.charCodeAt(0))], { type: header[1] }));
    } catch { return; }
    const element = link.current;
    if (element) element.href = url;
    return () => {
      URL.revokeObjectURL(url);
      if (element?.getAttribute("href") === url) element.removeAttribute("href");
    };
  }, [src]);
  return <a ref={link} href={/^(https?:\/\/|\/(?!\/))/.test(src) ? src : undefined}
    target="_blank" rel="noopener noreferrer" aria-label={`${open}: ${label}`} title={open} className={className}
    {...events} onPointerDown={event => event.stopPropagation()} onClick={event => { event.stopPropagation(); events.onClick?.(event); }}>
    {children}
  </a>;
}
