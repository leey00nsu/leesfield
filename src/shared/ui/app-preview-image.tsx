"use client";

import { useCallback, useState, type ImgHTMLAttributes, type Ref } from "react";
import { useTranslations } from "next-intl";
import { cn } from "@/shared/lib/utils";
import { AppButton } from "./app-button";
import { AppMediaPreviewLoading } from "./app-media-preview-loading";
import styles from "./app-preview-image.module.css";

export type AppPreviewImageProps = ImgHTMLAttributes<HTMLImageElement> & {
  sources?: readonly string[];
  /** True only when the preview is not inside an existing button/link. */
  retry?: boolean;
  /** Keep a caller's existing error panel while sharing the loading surface. */
  showError?: boolean;
  ref?: Ref<HTMLImageElement>;
};

/** className/style describe the preview rectangle; DOM events and ref target img. */
export function AppPreviewImage({ sources, src, ...props }: AppPreviewImageProps) {
  const urls = [...new Set((sources ?? [src]).filter((url): url is string => Boolean(url)))];
  return <PreviewSource key={JSON.stringify(urls)} {...props} urls={urls} />;
}

function PreviewSource({ urls, className, style, alt = "", onLoad, onError, retry = false, showError = true, ref, ...props }: Omit<AppPreviewImageProps, "src" | "sources"> & { urls: string[] }) {
  const t = useTranslations("mediaPreview");
  const decorative = (alt === "" && !retry) || props["aria-hidden"] === true;
  const [candidate, setCandidate] = useState(0), [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<"loading" | "loaded" | "error">(urls.length ? "loading" : "error");
  const attach = useCallback((image: HTMLImageElement | null) => {
    if (typeof ref === "function") ref(image);
    else if (ref) ref.current = image;
    // A cached image can finish before hydration installs its load listener.
    if (image?.complete && image.naturalWidth > 0) setState("loaded");
  }, [ref]);
  return <span className={cn("relative block overflow-hidden", styles.frame, className)} style={style} data-preview-state={state} aria-busy={state === "loading"}>
    {/* eslint-disable-next-line @next/next/no-img-element */}
    {urls.length > 0 && <img {...props} key={`${candidate}:${attempt}`} ref={attach} src={urls[candidate]} alt={alt}
      style={{ objectFit: style?.objectFit, objectPosition: style?.objectPosition }} className={cn(styles.image, state !== "loaded" && "opacity-0")}
      onLoad={event => { setState("loaded"); onLoad?.(event); }}
      onError={event => {
        if (candidate + 1 < urls.length) { setState("loading"); setCandidate(candidate + 1); }
        else { setState("error"); onError?.(event); }
      }} />}
    {state === "loading" && <AppMediaPreviewLoading decorative={decorative} />}
    {state === "error" && showError && <span className={styles.error} aria-hidden={decorative || undefined}>
      <span role="status">{t("error")}</span>
      {retry && <AppButton size="sm" variant="surface" onClick={event => {
        event.stopPropagation(); setState("loading"); setCandidate(0); setAttempt(value => value + 1);
      }}>{t("retry")}</AppButton>}
    </span>}
  </span>;
}
