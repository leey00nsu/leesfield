"use client";

/* Video playback policy adapted from Node Banana's useVideoAutoplay.
 * Copyright (c) 2026 William Falloon. MIT License.
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 */

import { useEffect, useRef, useState, type Ref } from "react";
import { Download, Eye } from "lucide-react";
import { useTranslations } from "next-intl";
import { useCanvasTranslation } from "@/shared/i18n/use-canvas-translation";
import { cn } from "@/shared/lib/utils";
import { parseImageVariants } from "@/shared/media-assets/image-variants";
import type { MediaAssetDto } from "@/shared/media-assets/media-asset-contract";
import { getMediaAssetDownloadName, getMediaAssetName } from "@/shared/media-assets/media-asset-name";
import { VariantImage } from "@/shared/media-assets/variant-image";
import { AppAudioPlayer } from "@/shared/ui/app-audio-player";
import { AppVideoPlayer } from "@/shared/ui/app-video-player";
import { AppButton } from "@/shared/ui/app-button";
import styles from "./space-media-preview.module.css";

export type SpaceMediaDimensions = { width: number; height: number };
export interface SpaceMediaPreviewProps {
  asset: MediaAssetDto;
  selected?: boolean;
  hovered?: boolean;
  /** Omit to observe visibility. False skips local thumbnail/waveform work and autoplay. */
  active?: boolean;
  className?: string;
  onLoadedDimensions?: (dimensions: SpaceMediaDimensions) => void;
  onDownload?: (asset: MediaAssetDto) => void;
  onOpen?: (asset: MediaAssetDto, returnFocus: HTMLElement, onClosed: () => void) => void;
  /** Canvas consumers can pass zoom without coupling this display to a store. */
  zoom?: number;
  /** View preference only; source selection and downloads keep the original asset. */
  imageFit?: "cover" | "contain";
  /** Keep native video controls inline by hiding fullscreen and Picture in Picture. */
  videoInlineOnly?: boolean;
  videoRef?: Ref<HTMLVideoElement>;
}

function sourceRevision(asset: Pick<MediaAssetDto, "id" | "version" | "updatedAt" | "url">) {
  return JSON.stringify([asset.id, asset.version, asset.updatedAt, asset.url]);
}
// Retain only small encoded previews, never source elements or full-size canvases.
// The UTF-16 string budget is at most 4 MiB, across at most 32 source revisions.
type ImageThumbnail = SpaceMediaDimensions & { url: string };
const imageThumbnails = new Map<string, ImageThumbnail>();
const MAX_IMAGE_THUMBNAILS = 32;
const MAX_IMAGE_THUMBNAIL_LENGTH = 128 * 1024;
const MAX_IMAGE_THUMBNAIL_CACHE_LENGTH = 2 * 1024 * 1024;
const MAX_IMAGE_SOURCE_BYTES = 16 * 1024 * 1024;
const MAX_IMAGE_SOURCE_EDGE = 8192;
const MAX_IMAGE_SOURCE_PIXELS = 16 * 1024 * 1024;
let imageThumbnailLength = 0;
function boundedImageDimensions(width: number, height: number) {
  return Number.isSafeInteger(width) && Number.isSafeInteger(height) && width > 0 && height > 0
    && width <= MAX_IMAGE_SOURCE_EDGE && height <= MAX_IMAGE_SOURCE_EDGE && width * height <= MAX_IMAGE_SOURCE_PIXELS;
}
function encodeImageThumbnail(image: CanvasImageSource, width: number, height: number, key: string): ImageThumbnail | null {
  const cached = imageThumbnails.get(key);
  if (cached) {
    imageThumbnails.delete(key); imageThumbnails.set(key, cached);
    return cached;
  }
  if (!boundedImageDimensions(width, height) || Math.max(width, height) <= 256) return null;
  const canvas = document.createElement("canvas"), scale = 256 / Math.max(width, height);
  try {
    canvas.width = Math.max(1, Math.round(width * scale));
    canvas.height = Math.max(1, Math.round(height * scale));
    const context = canvas.getContext("2d");
    if (!context) return null;
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const url = canvas.toDataURL("image/jpeg", 0.6);
    if (!url.startsWith("data:image/") || url.length > MAX_IMAGE_THUMBNAIL_LENGTH) return null;
    const thumbnail = { url, width, height };
    imageThumbnails.set(key, thumbnail); imageThumbnailLength += url.length;
    while (imageThumbnails.size > MAX_IMAGE_THUMBNAILS || imageThumbnailLength > MAX_IMAGE_THUMBNAIL_CACHE_LENGTH) {
      const oldest = imageThumbnails.keys().next().value!;
      imageThumbnailLength -= imageThumbnails.get(oldest)!.url.length;
      imageThumbnails.delete(oldest);
    }
    return thumbnail;
  } finally {
    canvas.width = 0; canvas.height = 0;
  }
}

type ContentThumbnailJob = {
  key: string; assetId: string; bytes: string | null; controller: AbortController;
  listeners: Set<(thumbnail: ImageThumbnail | null) => void>;
};
const contentThumbnailJobs = new Map<string, ContentThumbnailJob>(), contentThumbnailQueue: ContentThumbnailJob[] = [];
let contentThumbnailsRunning = 0;
async function boundedImageBlob(response: Response, signal: AbortSignal) {
  const mimeType = response.headers.get("content-type") ?? "";
  if (!response.ok || !mimeType.startsWith("image/") || Number(response.headers.get("content-length")) > MAX_IMAGE_SOURCE_BYTES) {
    await response.body?.cancel().catch(() => undefined);
    throw new Error("IMAGE_SOURCE_UNAVAILABLE");
  }
  if (!response.body) {
    const bytes = await response.arrayBuffer();
    if (signal.aborted || bytes.byteLength > MAX_IMAGE_SOURCE_BYTES) throw new Error("IMAGE_SOURCE_UNAVAILABLE");
    return new Blob([bytes], { type: mimeType });
  }
  const reader = response.body.getReader(), chunks: ArrayBuffer[] = [];
  const cancel = () => { void reader.cancel().catch(() => undefined); };
  signal.addEventListener("abort", cancel, { once: true });
  let length = 0;
  try {
    while (true) {
      if (signal.aborted) throw new Error("IMAGE_SOURCE_CANCELLED");
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > MAX_IMAGE_SOURCE_BYTES) throw new Error("IMAGE_SOURCE_TOO_LARGE");
      chunks.push(new Uint8Array(value).buffer);
    }
    if (signal.aborted) throw new Error("IMAGE_SOURCE_CANCELLED");
    return new Blob(chunks, { type: mimeType });
  } finally {
    signal.removeEventListener("abort", cancel);
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}
async function createContentThumbnail(job: ContentThumbnailJob): Promise<ImageThumbnail | null> {
  let bitmap: ImageBitmap | undefined;
  const timeout = setTimeout(() => job.controller.abort(), 15_000);
  try {
    if (typeof createImageBitmap === "undefined" || Number(job.bytes) > MAX_IMAGE_SOURCE_BYTES) return null;
    // The owned route checks session ownership, MIME and upstream SSRF/size limits.
    const response = await fetch(`/api/media-assets/${encodeURIComponent(job.assetId)}/content`, { signal: job.controller.signal, credentials: "same-origin" });
    const blob = await boundedImageBlob(response, job.controller.signal);
    if (job.controller.signal.aborted) return null;
    bitmap = await createImageBitmap(blob);
    if (job.controller.signal.aborted) return null;
    return encodeImageThumbnail(bitmap, bitmap.width, bitmap.height, job.key);
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
    bitmap?.close();
  }
}
function drainContentThumbnails() {
  // At most two bounded source buffers/bitmaps and 32 shared jobs, including queued jobs.
  while (contentThumbnailsRunning < 2 && contentThumbnailQueue.length) {
    const job = contentThumbnailQueue.shift()!;
    if (!job.listeners.size || job.controller.signal.aborted) continue;
    contentThumbnailsRunning++;
    void createContentThumbnail(job).then(thumbnail => {
      if (!job.controller.signal.aborted) job.listeners.forEach(listener => listener(thumbnail));
    }).finally(() => {
      if (contentThumbnailJobs.get(job.key) === job) contentThumbnailJobs.delete(job.key);
      contentThumbnailsRunning--; drainContentThumbnails();
    });
  }
}
function subscribeContentThumbnail(key: string, assetId: string, bytes: string | null, listener: (thumbnail: ImageThumbnail | null) => void) {
  const cached = imageThumbnails.get(key);
  if (cached) { listener(cached); return () => {}; }
  let job = contentThumbnailJobs.get(key);
  if (!job) {
    if (contentThumbnailJobs.size >= 32) { listener(null); return () => {}; }
    job = { key, assetId, bytes, controller: new AbortController(), listeners: new Set() };
    contentThumbnailJobs.set(key, job); contentThumbnailQueue.push(job);
  }
  job.listeners.add(listener); drainContentThumbnails();
  return () => {
    job.listeners.delete(listener);
    if (!job.listeners.size) {
      job.controller.abort();
      const queued = contentThumbnailQueue.indexOf(job);
      if (queued >= 0) contentThumbnailQueue.splice(queued, 1);
      if (contentThumbnailJobs.get(key) === job) contentThumbnailJobs.delete(key);
    }
  };
}

function AdaptiveVariantImage({ asset, active, zoom = 1, imageFit = "cover", onLoadedDimensions }: Pick<SpaceMediaPreviewProps, "asset" | "zoom" | "imageFit" | "onLoadedDimensions"> & { active: boolean }) {
  const tc = useCanvasTranslation(), t = useTranslations("nodeStudio.mediaNodes");
  const [element, setElement] = useState<HTMLDivElement | null>(null), [width, setWidth] = useState(350), [failed, setFailed] = useState(false);
  const key = sourceRevision(asset), storedThumbnail = parseImageVariants(asset.imageVariants)?.thumbnail?.url;
  const [thumbnail, setThumbnail] = useState(() => imageThumbnails.get(key) ?? null);
  const [decoded, setDecoded] = useState<HTMLImageElement | null>(null);
  const attempted = useRef(false), originalDimensions = useRef<SpaceMediaDimensions | null>(null);
  const small = width * zoom < 200;
  useEffect(() => {
    if (!element || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(([entry]) => { if (entry && entry.contentRect.width > 0) setWidth(entry.contentRect.width); });
    observer.observe(element.closest(".react-flow__node") ?? element);
    return () => observer.disconnect();
  }, [element]);
  useEffect(() => {
    if (!active || !small || storedThumbnail || thumbnail || attempted.current || (!decoded && !failed)) return;
    const width = decoded?.naturalWidth ?? asset.width ?? 0, height = decoded?.naturalHeight ?? asset.height ?? 0;
    if (!boundedImageDimensions(width, height) || Math.max(width, height) <= 256) return;
    let disposed = false, finished = false, unsubscribe = () => {};
    const accept = (result: ImageThumbnail | null) => {
      finished = true;
      // Publish the value into React state; rendering never depends on a mutated cache.
      if (!disposed && result) { setThumbnail(result); setDecoded(null); }
    };
    const timer = setTimeout(() => {
      attempted.current = true;
      if (decoded) {
        try { accept(encodeImageThumbnail(decoded, width, height, key)); return; }
        catch { /* Tainted CDN pixels use the bounded owned content route. */ }
      }
      unsubscribe = subscribeContentThumbnail(key, asset.id, asset.bytes, accept);
    }, 0);
    return () => {
      disposed = true; clearTimeout(timer); unsubscribe();
      if (!finished) attempted.current = false;
    };
  }, [active, small, storedThumbnail, thumbnail, decoded, key, failed, asset.id, asset.bytes, asset.width, asset.height]);
  const previewAsset = small && storedThumbnail ? asset : { url: small && thumbnail ? thumbnail.url : asset.url };
  return <div ref={setElement} className={styles.image}>
    <VariantImage asset={previewAsset} purpose="list" className={styles.visual} style={{ objectFit: imageFit }} alt={getMediaAssetName(asset)}
      draggable={false} loading="lazy" decoding="async" onError={() => setFailed(true)} onLoad={event => {
        setFailed(false);
        if (event.currentTarget.getAttribute("src") === asset.url) {
          setDecoded(event.currentTarget);
          originalDimensions.current = { width: event.currentTarget.naturalWidth, height: event.currentTarget.naturalHeight };
        }
        const width = asset.width ?? thumbnail?.width ?? originalDimensions.current?.width ?? event.currentTarget.naturalWidth;
        const height = asset.height ?? thumbnail?.height ?? originalDimensions.current?.height ?? event.currentTarget.naturalHeight;
        if (width > 0 && height > 0) onLoadedDimensions?.({ width, height });
      }} />
    {failed && <p className={styles.error} role="alert">{t("loadError")} <button type="button" onClick={() => {
      const image = element?.querySelector("img");
      if (image) { const src = image.src; image.removeAttribute("src"); image.src = src; }
    }}>{tc("Retry")}</button></p>}
  </div>;
}

/** Media presentation only: no graph writes, uploads, providers, or editor store. */
export function SpaceMediaPreview({ asset, selected = false, hovered = false, active, className, onLoadedDimensions, onDownload, onOpen, zoom, imageFit = "cover", videoInlineOnly = false, videoRef }: SpaceMediaPreviewProps) {
  const tc = useCanvasTranslation(), t = useTranslations("nodeStudio.mediaNodes"), [element, setElement] = useState<HTMLDivElement | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [visible, setVisible] = useState(() => typeof IntersectionObserver === "undefined");
  useEffect(() => {
    if (active !== undefined || !element || typeof IntersectionObserver === "undefined") return;
    let disposed = false;
    const observer = new IntersectionObserver(entries => { if (!disposed && entries[0]) setVisible(entries[0].isIntersecting); }, { rootMargin: "100px" });
    observer.observe(element);
    return () => { disposed = true; observer.disconnect(); };
  }, [active, element]);
  const isActive = (active ?? visible) && !detailOpen, revision = sourceRevision(asset);
  const label = tc(asset.type === "image" ? "Download image" : asset.type === "audio" ? "Download audio" : "Download video");
  return <div ref={setElement} className={cn(styles.root, className)} data-space-media-preview={asset.type} data-hovered={hovered} data-selected={selected} data-active={isActive}>
    {asset.type === "image" ? <AdaptiveVariantImage key={revision} asset={asset} active={isActive} zoom={zoom} imageFit={imageFit} onLoadedDimensions={onLoadedDimensions} />
      : asset.type === "audio" ? <AppAudioPlayer src={asset.url} asset={asset} active={isActive} embedded />
        : <AppVideoPlayer key={revision} mediaRef={videoRef} src={asset.url} active={isActive} embedded autoPreview={{ selected, hovered }}
          muted loop playsInline inlineOnly={videoInlineOnly} onLoadedMetadata={event => {
            const media = event.currentTarget;
            if (media.videoWidth > 0 && media.videoHeight > 0) onLoadedDimensions?.({ width: media.videoWidth, height: media.videoHeight });
          }} />}
    <AppButton type="button" variant="surface" size="icon-sm" disabled={!onOpen} title={t("viewDetails")} aria-label={t("viewDetails")}
      className={cn(styles.corner, styles.open, "nodrag nopan")}
      onPointerDown={event => event.stopPropagation()} onFocus={event => event.stopPropagation()} onKeyDown={event => event.stopPropagation()}
      onClick={event => {
        event.stopPropagation();
        setDetailOpen(true);
        element?.querySelectorAll<HTMLMediaElement>("audio, video").forEach(media => media.pause());
        onOpen?.(asset, event.currentTarget, () => setDetailOpen(false));
      }}><Eye aria-hidden="true" /></AppButton>
    {onDownload ? <button type="button" className={cn(styles.corner, styles.download, "nodrag nopan")} title={label} aria-label={label}
      onPointerDown={event => event.stopPropagation()} onKeyDown={event => event.stopPropagation()}
      onClick={event => { event.stopPropagation(); onDownload(asset); }}><Download /></button>
      : <a className={cn(styles.corner, styles.download, "nodrag nopan")} href={`/api/media-assets/${encodeURIComponent(asset.id)}/download`}
        download={getMediaAssetDownloadName(asset)} aria-label={label} title={label}
        onPointerDown={event => event.stopPropagation()} onKeyDown={event => event.stopPropagation()} onClick={event => event.stopPropagation()}><Download /></a>}
  </div>;
}
