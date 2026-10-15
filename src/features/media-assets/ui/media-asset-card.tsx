"use client";
import { useEffect, useRef } from "react";
import { useTranslations } from "next-intl";
import { AudioLines, Check, Star, Info } from "lucide-react";
import type { MediaAssetDto } from "@/shared/media-assets/media-asset-contract";
import { getMediaAssetName, getMediaAssetReferenceId } from "@/shared/media-assets/media-asset-name";
import { VariantImage } from "@/shared/media-assets/variant-image";
import { AppButton } from "@/shared/ui/app-button";
import { AppMediaTypeBadge } from "@/shared/ui/app-media-type-badge";
import { appMediaGalleryTileClassName } from "@/shared/ui/app-media-gallery";
import { cn } from "@/shared/lib/utils";

export function MediaAssetPreview({ asset, className, fit = "contain", showDuration = true }: { asset: MediaAssetDto; className?: string; fit?: "contain" | "cover"; showDuration?: boolean }) {
  const media = useRef<HTMLMediaElement | null>(null);
  const surface = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const element = media.current;
    const control = surface.current?.closest("button, a");
    if (!element || !control) return;
    const start = () => { void Promise.resolve(element.play()).catch(() => undefined); };
    const stop = () => { element.pause(); element.currentTime = 0; };
    const visibility = () => { if (document.hidden) stop(); };
    control.addEventListener("focus", start);
    control.addEventListener("blur", stop);
    document.addEventListener("visibilitychange", visibility);
    return () => { stop(); control.removeEventListener("focus", start); control.removeEventListener("blur", stop); document.removeEventListener("visibilitychange", visibility); };
  }, [asset.url, asset.type]);
  const start = () => { const element = media.current; if (element) void Promise.resolve(element.play()).catch(() => undefined); };
  const stop = () => { const element = media.current; if (element) { element.pause(); element.currentTime = 0; } };
  return <div ref={surface} className={cn("relative flex aspect-video w-full items-center justify-center overflow-hidden rounded-lg bg-black/40", className)} onPointerEnter={start} onPointerLeave={stop}>
    {asset.type === "image" ? <VariantImage asset={asset} purpose="list" alt="" loading="lazy" className={cn("size-full", fit === "cover" ? "object-cover" : "object-contain")} /> : asset.type === "video" ?
      <video ref={element => { media.current = element; }} src={asset.url} muted playsInline preload="metadata" className={cn("size-full", fit === "cover" ? "object-cover" : "object-contain")} /> : <>
        <AudioLines className="size-10 text-muted-foreground" aria-hidden="true" />
        <audio ref={element => { media.current = element; }} src={asset.url} preload="none" />
      </>}
    {showDuration && asset.durationMs != null && fit === "contain" && <span className="absolute bottom-2 right-2 rounded bg-black/60 px-1.5 py-0.5 text-[10px] text-white">{(asset.durationMs / 1000).toFixed(1)}s</span>}
  </div>;
}
export function MediaAssetCard({ asset, selected = false, disabled = false, onSelect, onDetails, onStar, busy = false, presentation = "compact", className, fit = "cover" }: {
  asset: MediaAssetDto; selected?: boolean; disabled?: boolean; busy?: boolean;
  presentation?: "compact" | "gallery"; className?: string; fit?: "cover" | "contain";
  onSelect: () => void; onDetails?: () => void; onStar?: () => void;
}) {
  const t = useTranslations("assets");
  const name = asset.name ?? getMediaAssetName(asset);
  if (presentation === "gallery") return <article className={cn("group relative min-h-0 min-w-0 overflow-hidden rounded-none bg-black", appMediaGalleryTileClassName, selected && "ring-2 ring-inset ring-primary", className)}>
    <button type="button" aria-label={name} aria-pressed={selected} disabled={disabled} onClick={onSelect} className={cn("absolute inset-0 block size-full text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary disabled:opacity-45", onDetails ? "cursor-pointer" : "cursor-zoom-in")}>
      <MediaAssetPreview asset={asset} fit={fit} showDuration={false} className="absolute inset-0 h-full aspect-auto rounded-none" />
      <span className="absolute inset-0 bg-black/10 transition-colors group-hover:bg-black/25 group-focus-within:bg-black/25 motion-reduce:transition-none" />
      <span className="absolute inset-x-0 bottom-0 flex min-w-0 flex-col gap-1 bg-gradient-to-t from-black/95 via-black/70 to-transparent px-3 pt-12 pb-3 text-white">
        <span title={name} className="block truncate text-sm font-medium">{name}</span>
        <span className="flex min-w-0 items-center gap-2 text-[10px] text-white/65"><span title={getMediaAssetReferenceId(asset)} className="min-w-0 flex-1 truncate font-mono">{getMediaAssetReferenceId(asset)}</span>{asset.durationMs != null && <span className="shrink-0">{(asset.durationMs / 1000).toFixed(1)}s</span>}</span>
      </span>
      <span className="absolute top-3 left-3 flex max-w-[calc(100%-4rem)] items-center gap-2">
        <AppMediaTypeBadge type={asset.type} />
        {selected && <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground" aria-hidden="true"><Check className="size-3" /></span>}
      </span>
    </button>
    <div className="absolute top-2 right-2 flex flex-col gap-1 sm:flex-row">
      {onDetails && <AppButton type="button" size="icon-sm" variant="surface" className="border-white/15 bg-black/50 text-white backdrop-blur hover:bg-black/70" aria-label={t("details", { name })} onClick={onDetails}><Info className="size-4" /></AppButton>}
      {onStar && <AppButton type="button" size="icon-sm" variant="surface" className="border-white/15 bg-black/50 text-white backdrop-blur hover:bg-black/70" disabled={busy} aria-label={t(asset.starred ? "unstar" : "star")} aria-pressed={!!asset.starred} onClick={onStar}><Star className={cn("size-4", asset.starred && "fill-amber-300 text-amber-300")} /></AppButton>}
    </div>
  </article>;
  return <article className={cn("group relative min-w-0 overflow-hidden rounded-xl border bg-card p-2 transition-colors", selected ? "border-primary bg-primary/5" : "border-border hover:border-muted-foreground/50", className)}>
    <button type="button" aria-label={name} aria-pressed={selected} disabled={disabled} onClick={onSelect} className="block w-full min-w-0 rounded-lg text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-45">
      <MediaAssetPreview asset={asset} />
      <span title={name} className="mt-2 block truncate text-sm font-medium">{name}</span>
      <span title={getMediaAssetReferenceId(asset)} className="mt-1 block truncate font-mono text-[10px] text-muted-foreground">{getMediaAssetReferenceId(asset)}</span>
    </button>
    <div className="mt-2 flex items-center justify-between gap-1">
      <span className="text-[10px] text-muted-foreground">{t(asset.type)}{selected && <Check className="ml-1 inline size-3" aria-hidden="true" />}</span>
      <div className="flex gap-0.5">
        {onStar && <AppButton type="button" size="icon-sm" variant="ghost" disabled={busy} aria-label={t(asset.starred ? "unstar" : "star")} aria-pressed={!!asset.starred} onClick={onStar}><Star className={cn("size-4", asset.starred && "fill-amber-300 text-amber-300")} /></AppButton>}
        {onDetails && <AppButton type="button" size="sm" variant="ghost" aria-label={t("details", { name })} onClick={onDetails}>{t("detailAction")}</AppButton>}
      </div>
    </div>
  </article>;
}
