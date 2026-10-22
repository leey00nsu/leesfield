"use client";
import { useEffect, useRef } from "react";
import { useTranslations } from "next-intl";
import { AudioLines, Check, Star, Info } from "lucide-react";
import type { MediaAssetDto } from "@/shared/media-assets/media-asset-contract";
import { getMediaAssetName, getMediaAssetReferenceId } from "@/shared/media-assets/media-asset-name";
import { VariantImage } from "@/shared/media-assets/variant-image";
import { AppButton } from "@/shared/ui/app-button";
import { AppAudioPlayer } from "@/shared/ui/app-audio-player";
import { AppVideoPlayer } from "@/shared/ui/app-video-player";
import { AppMediaTypeBadge } from "@/shared/ui/app-media-type-badge";
import { appMediaGalleryTileClassName } from "@/shared/ui/app-media-gallery";
import { cn } from "@/shared/lib/utils";

type PreviewPlayback = { element: HTMLMediaElement; wanted: () => boolean; sync: () => void };
function stopPreview(element: HTMLMediaElement) { element.pause(); element.currentTime = 0; }

export function MediaAssetPreview({ asset, className, fit = "contain", showDuration = true, disabled = false }: { asset: MediaAssetDto; className?: string; fit?: "contain" | "cover"; showDuration?: boolean; disabled?: boolean }) {
  const tHistory = useTranslations("history.detail");
  const media = useRef<HTMLMediaElement | null>(null);
  const surface = useRef<HTMLDivElement>(null);
  const hovered = useRef(false), focused = useRef(false), playback = useRef<PreviewPlayback | null>(null);
  const generatedAudio = asset.type === "audio" && (asset.origin === "generation" || asset.origin === "legacy_generation");
  const audioText = generatedAudio ? asset.inputPrompt == null ? tHistory("inputPromptUnknown")
    : asset.inputPrompt.trim() ? asset.inputPrompt : tHistory("noInputPrompt") : null;
  useEffect(() => {
    const element = media.current;
    const control = surface.current?.closest("button, a");
    if (!element) return;
    let alive = true, requested = false;
    focused.current = Boolean(control && control === document.activeElement);
    const wanted = () => alive && media.current === element && element.isConnected && !document.hidden && !disabled
      && !control?.matches(":disabled, [aria-disabled='true']") && (hovered.current || focused.current);
    const guard = () => {
      // Even an older request must obey the latest intent. A new lifetime may
      // reuse this element, so an old completion must not pause its valid play.
      const current = playback.current;
      if (current?.element !== element || !current.wanted()) stopPreview(element);
    };
    const sync = () => {
      if (!wanted()) { requested = false; stopPreview(element); return; }
      if (requested) return;
      requested = true;
      try { void Promise.resolve(element.play()).then(guard).catch(() => undefined); }
      catch { /* Autoplay may be denied synchronously. */ }
    };
    const policy = { element, wanted: () => requested && wanted(), sync };
    playback.current = policy;
    const focus = () => { focused.current = true; sync(); };
    const blur = () => { focused.current = false; sync(); };
    const ended = () => { requested = false; stopPreview(element); };
    control?.addEventListener("focus", focus);
    control?.addEventListener("blur", blur);
    element.addEventListener("play", guard);
    element.addEventListener("playing", guard);
    element.addEventListener("ended", ended);
    element.addEventListener("error", ended);
    document.addEventListener("visibilitychange", sync);
    sync();
    return () => {
      alive = false;
      if (playback.current === policy) playback.current = null;
      control?.removeEventListener("focus", focus);
      control?.removeEventListener("blur", blur);
      element.removeEventListener("play", guard);
      element.removeEventListener("playing", guard);
      element.removeEventListener("ended", ended);
      element.removeEventListener("error", ended);
      document.removeEventListener("visibilitychange", sync);
      stopPreview(element);
    };
  }, [asset.url, asset.type, asset.id, asset.version, asset.updatedAt, disabled]);
  return <div ref={surface} className={cn("relative flex aspect-video w-full items-center justify-center overflow-hidden rounded-lg bg-black/40", className)}
    onPointerEnter={() => { hovered.current = true; playback.current?.sync(); }}
    onPointerLeave={() => { hovered.current = false; playback.current?.sync(); }}>
    {asset.type === "image" ? <VariantImage asset={asset} purpose="list" alt="" loading="lazy" className={cn("size-full", fit === "cover" ? "object-cover" : "object-contain")} /> : asset.type === "video" ?
      <AppVideoPlayer mediaRef={element => { media.current = element; }} src={asset.url} controls={false} muted playsInline preload="metadata" className={cn("size-full", fit === "cover" ? "object-cover" : "object-contain")} /> : <>
        <span className="flex size-full min-w-0 flex-col items-center justify-center gap-2 overflow-hidden px-4 py-3">
          <AudioLines className="size-6 shrink-0 text-muted-foreground" aria-hidden="true" />
          {audioText && <span title={audioText} className="line-clamp-4 max-w-full whitespace-pre-wrap break-words text-center text-sm leading-6 text-foreground">{audioText}</span>}
        </span>
        <AppAudioPlayer mediaRef={element => { media.current = element; }} src={asset.url} asset={asset} controls={false} preload="none" className="hidden" />
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
      <MediaAssetPreview asset={asset} disabled={disabled} fit={fit} showDuration={false} className="absolute inset-0 h-full aspect-auto rounded-none" />
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
      <MediaAssetPreview asset={asset} disabled={disabled} />
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
