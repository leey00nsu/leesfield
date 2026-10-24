"use client";
import { Pause, Play } from "lucide-react";
import { useEffect, useImperativeHandle, useRef, useState, type Ref } from "react";
import { useCanvasTranslation } from "@/shared/i18n/use-canvas-translation";
import type { MediaAssetDto } from "@/shared/media-assets/media-asset-contract";
import { AppVideoPlayer } from "@/shared/ui/app-video-player";
import { useSpaceFilmstrip } from "../../hook/use-space-filmstrip";

const clamp = (n: number, max: number) => Math.max(0, Math.min(max, n));
const validDuration = (n: number) => Number.isFinite(n) && n > 0 ? Math.min(n, 600) : 0;
const time = (n: number) => {
  const value = Math.round(Math.max(0, n) * 100);
  return Math.floor(value / 6000).toString().padStart(2, "0") + ":" + (Math.floor(value / 100) % 60).toString().padStart(2, "0") + "." + (value % 100).toString().padStart(2, "0");
};
export type VideoFrameCapture = { timestampMs: () => number };
/** A single frame playhead. Explicit seeks persist; playback ticks remain local. */
export function VideoFrameEditor({ source, active = false, writable, frame, frameCaptureRef }: {
  source: MediaAssetDto | null | undefined; active?: boolean; writable: boolean;
  frame: { timestampMs: number; onChange: (ms: number) => void }; frameCaptureRef?: Ref<VideoFrameCapture>;
}) {
  const tc = useCanvasTranslation(), video = useRef<HTMLVideoElement>(null), ruler = useRef<HTMLDivElement>(null);
  const [root, setRoot] = useState<HTMLDivElement | null>(null), [visible, setVisible] = useState(() => typeof IntersectionObserver === "undefined");
  const [seenUrl, setSeenUrl] = useState<string>(), [metadata, setMetadata] = useState<{ url: string; duration: number } | null>(null);
  const [position, setPosition] = useState(frame.timestampMs / 1000), framePosition = useRef(frame.timestampMs / 1000);
  const [playing, setPlaying] = useState(false), [error, setError] = useState(false);
  const duration = validDuration((source?.durationMs ?? 0) / 1000) || (metadata?.url === source?.url ? metadata?.duration ?? 0 : 0);
  const [restored, setRestored] = useState(frame.timestampMs);
  if (restored !== frame.timestampMs) { setRestored(frame.timestampMs); setPosition(clamp(frame.timestampMs / 1000, duration || frame.timestampMs / 1000)); }
  const filmstrip = useSpaceFilmstrip(source, active && visible), loaded = visible || seenUrl === source?.url;
  useEffect(() => {
    const next = clamp(frame.timestampMs / 1000, duration || frame.timestampMs / 1000);
    framePosition.current = next;
    const element = video.current;
    if (element && element.readyState >= 1 && Math.abs(element.currentTime - next) > .001) { element.pause(); element.currentTime = next; }
  }, [frame.timestampMs, duration]);
  useImperativeHandle(frameCaptureRef, () => ({ timestampMs: () => {
    const e = video.current, value = e && e.readyState >= 1 ? e.currentTime : framePosition.current;
    e?.pause(); return Math.round(clamp(value, duration || value) * 1000);
  } }), [duration]);
  useEffect(() => {
    if (!root || typeof IntersectionObserver === "undefined") return;
    let disposed = false;
    const observer = new IntersectionObserver(entries => {
      if (disposed || !entries[0]) return;
      setVisible(entries[0].isIntersecting);
      if (entries[0].isIntersecting) setSeenUrl(source?.url);
    });
    observer.observe(root);
    return () => { disposed = true; observer.disconnect(); };
  }, [root, source?.url]);
  useEffect(() => {
    if (!playing) return;
    let id: number;
    const tick = () => {
      const e = video.current;
      if (!e || e.paused) { setPlaying(false); return; }
      setPosition(e.currentTime); framePosition.current = e.currentTime; id = requestAnimationFrame(tick);
    };
    id = requestAnimationFrame(tick); return () => cancelAnimationFrame(id);
  }, [playing]);
  const seek = (next: number, commit = true) => {
    const e = video.current;
    if (!e || !source || !duration) return;
    setSeenUrl(source.url); if (!e.getAttribute("src")) e.src = source.url;
    e.pause(); const value = clamp(next, duration); e.currentTime = value;
    framePosition.current = value; setPosition(value);
    if (commit && writable) frame.onChange(Math.round(value * 1000));
  };
  const scrub = (x: number) => { const r = ruler.current?.getBoundingClientRect(); if (r?.width) seek((x - r.left) / r.width * duration, false); };
  const playback = async () => {
    const e = video.current;
    if (!e || !source || !duration) return;
    if (!e.paused) { e.pause(); return; }
    setSeenUrl(source.url); if (!e.getAttribute("src")) e.src = source.url;
    if (e.currentTime >= duration - .01) e.currentTime = 0;
    try { await e.play(); } catch { setError(true); }
  };
  return <div ref={setRoot} className="nodrag nopan nowheel grid h-full min-h-0 grid-rows-[minmax(0,1fr)_auto_auto] gap-2"
    data-leesfield-component="VideoFrameEditor" data-frame-active={active && visible} data-filmstrip-status={filmstrip.status}>
    <div className="relative min-h-0 overflow-hidden bg-black/60" role="region" aria-label={tc("Operation source")} data-space-operation-preview="">
      {source?.type === "video" ? <AppVideoPlayer key={source.url} ref={video} src={source.url} active={loaded} controls={false} inlineOnly playsInline preload={loaded ? "metadata" : "none"}
        aria-label={tc("Operation source")} className="absolute inset-0 h-full w-full object-contain"
        onLoadedMetadata={event => {
          const e = event.currentTarget; setMetadata({ url: source.url, duration: validDuration(e.duration) }); setError(false);
          const target = clamp(framePosition.current, validDuration(e.duration));
          if (Math.abs(e.currentTime - target) > .001) e.currentTime = target;
          setPosition(e.currentTime); framePosition.current = e.currentTime;
        }}
        onTimeUpdate={event => { setPosition(event.currentTarget.currentTime); framePosition.current = event.currentTarget.currentTime; }}
        onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onEnded={() => setPlaying(false)} onError={() => { setError(true); setPlaying(false); }} />
        : <div className="absolute inset-0 grid place-items-center text-xs text-neutral-500">{tc("Connect a video")}</div>}
    </div>
    <div className="flex items-center gap-2">
      <button type="button" aria-label={tc(playing ? "Pause" : "Play")} disabled={!source || !duration || error} onClick={() => void playback()}
        className="grid h-7 w-7 place-items-center rounded text-neutral-200 hover:bg-white/10 disabled:opacity-30">{playing ? <Pause size={14} /> : <Play size={14} />}</button>
      <span className="font-mono text-[11px] tabular-nums text-neutral-400">{time(position)} / {time(duration)}</span>
    </div>
    <div className="rounded-md border border-neutral-700/70 bg-neutral-900/60 px-2 pb-2">
      <div ref={ruler} role="slider" tabIndex={duration ? 0 : -1} aria-label={tc("Playback position")} aria-valuemin={0} aria-valuemax={duration}
        aria-valuenow={clamp(position, duration)} aria-valuetext={time(position)} aria-disabled={!duration}
        className="relative h-7 touch-none cursor-pointer outline-none focus-visible:ring-1 focus-visible:ring-blue-400"
        onPointerDown={event => { if (event.button === 0 && duration) { event.currentTarget.setPointerCapture(event.pointerId); scrub(event.clientX); } }}
        onPointerMove={event => { if (event.currentTarget.hasPointerCapture(event.pointerId)) scrub(event.clientX); }}
        onPointerUp={event => { if (event.currentTarget.hasPointerCapture(event.pointerId)) { event.currentTarget.releasePointerCapture(event.pointerId); if (writable) frame.onChange(Math.round(framePosition.current * 1000)); } }}
        onKeyDown={event => {
          if (!duration) return;
          const next = event.key === "Home" ? 0 : event.key === "End" ? duration : event.key === "ArrowLeft" ? position - .1 : event.key === "ArrowRight" ? position + .1 : null;
          if (next !== null) { event.preventDefault(); seek(next); }
        }}>
        {[0, 1, 2, 3, 4].map(i => <span key={i} className="absolute bottom-0 top-1 border-l border-neutral-600 text-[9px] text-neutral-500" style={{ left: i * 25 + "%" }}>
          <span className={i === 4 ? "absolute right-0" : "pl-1"}>{duration ? Number((duration * i / 4).toFixed(1)) + "s" : "—"}</span>
        </span>)}
        {duration > 0 && <span className="pointer-events-none absolute top-1 z-20 h-[78px] w-px bg-red-400" style={{ left: clamp(position / duration, 1) * 100 + "%" }}>
          <span className="absolute -left-1 top-0 h-2 w-2 rounded-sm bg-red-400" /></span>}
      </div>
      <div className="relative h-12 w-full touch-none overflow-hidden rounded bg-neutral-800" data-frame-filmstrip
        onPointerDown={event => { if (event.button === 0 && duration) { event.currentTarget.setPointerCapture(event.pointerId); scrub(event.clientX); } }}
        onPointerMove={event => { if (event.currentTarget.hasPointerCapture(event.pointerId)) scrub(event.clientX); }}
        onPointerUp={event => { if (event.currentTarget.hasPointerCapture(event.pointerId)) { event.currentTarget.releasePointerCapture(event.pointerId); if (writable) frame.onChange(Math.round(framePosition.current * 1000)); } }}>
        <div className="pointer-events-none absolute inset-0 flex" aria-hidden="true">{filmstrip.images.map((image, index) =>
          // Local thumbnails retained by the shared bounded scheduler.
          // eslint-disable-next-line @next/next/no-img-element
          <img key={index} src={image} alt="" className="h-full min-w-0 flex-1 object-cover" />)}
          {!filmstrip.images.length && <span className="m-auto text-[10px] text-neutral-500">{tc("Video")}</span>}</div>
      </div>
    </div>
    {error && <p role="alert" className="text-[10px] text-red-200">{tc("Could not play the video. Try again.")}</p>}
  </div>;
}
