"use client";

import { Slider } from "@base-ui/react/slider";
import { Pause, Play, Volume2, VolumeX, X } from "lucide-react";
import { useEffect, useId, useImperativeHandle, useRef, useState, type Ref } from "react";

import { useCanvasTranslation } from "@/shared/i18n/use-canvas-translation";
import type { MediaAssetDto } from "@/shared/media-assets/media-asset-contract";
import { AppVideoPlayer } from "@/shared/ui/app-video-player";
import { useSpaceFilmstrip } from "../../hook/use-space-filmstrip";
import { NodeViewTabs } from "./node-view-tabs";

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const validDuration = (value: number | undefined) => value && Number.isFinite(value) && value > 0 ? Math.min(value, 600) : 0;
function time(seconds: number) {
  const hundredths = Math.round(Math.max(0, seconds) * 100);
  return `${Math.floor(hundredths / 6000).toString().padStart(2, "0")}:${(Math.floor(hundredths / 100) % 60).toString().padStart(2, "0")}.${(hundredths % 100).toString().padStart(2, "0")}`;
}

export type VideoFrameCapture = { timestampMs: () => number };

export function VideoTrimEditor({
  source, output, startMs, endMs, stripAudio, writable, onChange, onClearOutput, externalResults = false, active = false, frame, frameCaptureRef,
}: {
  source: MediaAssetDto | null | undefined;
  output: MediaAssetDto | null | undefined;
  startMs: number;
  endMs: number;
  stripAudio: boolean;
  writable: boolean;
  onChange: (patch: Record<string, unknown>) => void;
  onClearOutput?: () => void;
  externalResults?: boolean;
  active?: boolean;
  frame?: { timestampMs: number; onChange: (timestampMs: number) => void };
  frameCaptureRef?: Ref<VideoFrameCapture>;
}) {
  const tc = useCanvasTranslation();
  const video = useRef<HTMLVideoElement>(null);
  const ruler = useRef<HTMLDivElement>(null);
  const [root, setRoot] = useState<HTMLDivElement | null>(null);
  const [visible, setVisible] = useState(() => typeof IntersectionObserver === "undefined");
  const [seenUrl, setSeenUrl] = useState<string | undefined>();
  const playbackIntent = useRef<string | undefined>(undefined);
  const [preview, setPreview] = useState<{ tab: "source" | "output"; outputId: string | undefined }>({
    tab: output ? "output" : "source", outputId: output?.id,
  });
  const tab = preview.outputId === output?.id ? preview.tab : output ? "output" : "source";
  const [metadata, setMetadata] = useState<{ url: string; duration: number } | null>(null);
  const [position, setPosition] = useState(() => (frame?.timestampMs ?? 0) / 1000);
  const framePosition = useRef((frame?.timestampMs ?? 0) / 1000);
  const [playing, setPlaying] = useState(false);
  const [mediaError, setMediaError] = useState(false);
  const [playError, setPlayError] = useState(false);
  const result = tab === "output" && output?.type === "video";
  const asset = result ? output : source;
  const duration = validDuration(source?.durationMs ? source.durationMs / 1000 : undefined)
    || (metadata?.url === source?.url ? metadata?.duration ?? 0 : 0);
  const step = Math.min(0.1, duration || 0.1);
  const gap = Math.min(0.001, duration || 0.001);
  const start = clamp(startMs / 1000, 0, Math.max(0, duration - gap));
  const end = frame ? duration : clamp(endMs / 1000, start + gap, duration || gap);
  const selectedDuration = duration ? Math.max(0, end - start) : 0;
  const filmstrip = useSpaceFilmstrip(source?.type === "video" ? source : undefined, active && visible && !result);
  const frames = filmstrip.images;
  const mediaLoaded = visible || seenUrl === asset?.url;
  const editable = writable && source?.type === "video" && duration > 0 && !result;
  const playbackDuration = result
    ? validDuration(metadata && metadata.url === asset?.url ? metadata.duration : (output?.durationMs ?? 0) / 1000)
    : duration;
  const invalidRange = duration > 0 && (startMs < 0 || endMs <= startMs || endMs > Math.round(duration * 1000));
  const frameMode = Boolean(frame), frameTimestamp = frame?.timestampMs;
  const [frameView, setFrameView] = useState({ timestamp: frameTimestamp, duration });
  if (frameMode && (frameView.timestamp !== frameTimestamp || frameView.duration !== duration)) {
    setFrameView({ timestamp: frameTimestamp, duration });
    setPosition(clamp((frameTimestamp ?? 0) / 1000, 0, duration || Math.max(0, (frameTimestamp ?? 0) / 1000)));
  }
  useImperativeHandle(frameCaptureRef, () => ({ timestampMs: () => {
    const element = video.current;
    const value = element && element.readyState >= 1 ? element.currentTime : framePosition.current;
    element?.pause();
    return Math.round(clamp(value, 0, duration || Math.max(0, value)) * 1000);
  } }), [duration]);
  useEffect(() => {
    if (!frameMode || frameTimestamp === undefined) return;
    const next = clamp(frameTimestamp / 1000, 0, duration || Math.max(0, frameTimestamp / 1000));
    framePosition.current = next;
    const element = video.current;
    if (element && element.readyState >= 1 && Math.abs(element.currentTime - next) > 0.001) { element.pause(); element.currentTime = next; }
  }, [frameMode, frameTimestamp, duration]);

  useEffect(() => {
    if (!root || typeof IntersectionObserver === "undefined") return;
    let disposed = false;
    const observer = new IntersectionObserver(entries => {
      if (disposed || !entries[0]) return;
      const intersects = entries[0].isIntersecting;
      setVisible(intersects);
      if (intersects) setSeenUrl(asset?.url);
    }, { rootMargin: "0px" });
    observer.observe(root);
    return () => { disposed = true; observer.disconnect(); };
  }, [root, asset?.url]);

  const loadForInteraction = (element: HTMLVideoElement) => {
    if (!asset) return;
    playbackIntent.current = asset.url;
    setSeenUrl(asset.url);
    if (!element.getAttribute("src")) element.src = asset.url;
  };

  useEffect(() => {
    if (!playing) return;
    let frame: number;
    const tick = () => {
      const element = video.current;
      if (!element || element.paused) { setPlaying(false); return; }
      if (!result && element.currentTime >= end) {
        element.pause();
        element.currentTime = end;
        setPosition(end);
        return;
      }
      setPosition(element.currentTime);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [playing, result, end]);

  const seek = (next: number, commit = true) => {
    if (!video.current || !duration || result) return;
    const value = clamp(next, 0, duration);
    loadForInteraction(video.current);
    video.current.pause();
    video.current.currentTime = value;
    framePosition.current = value;
    setPosition(value);
    if (commit && frame && writable) frame.onChange(Math.round(value * 1000));
  };
  const changeRange = (values: readonly number[]) => {
    const [nextStart, nextEnd] = values;
    if (!editable || nextStart === undefined || nextEnd === undefined || nextEnd <= nextStart) return;
    onChange({ startMs: Math.round(nextStart * 1000), endMs: Math.round(nextEnd * 1000) });
    seek(nextStart);
  };
  const changeTab = (next: "source" | "output") => {
    video.current?.pause();
    setPlaying(false);
    setPosition(0);
    setMediaError(false);
    setPlayError(false);
    setPreview({ tab: next, outputId: output?.id });
  };
  const tabsId = useId();
  const togglePlayback = async () => {
    const element = video.current;
    if (!element || !playbackDuration || mediaError) return;
    if (!element.paused) { element.pause(); return; }
    loadForInteraction(element);
    if (!result && (element.currentTime < start || element.currentTime >= end - 0.01)) element.currentTime = start;
    else if (result && element.currentTime >= playbackDuration - 0.01) element.currentTime = 0;
    setPlayError(false);
    try { await element.play(); } catch { setPlayError(true); }
  };
  const scrub = (clientX: number) => {
    const bounds = ruler.current?.getBoundingClientRect();
    if (bounds?.width) seek(((clientX - bounds.left) / bounds.width) * duration, false);
  };

  return (
    <div ref={setRoot} className={`nodrag nowheel grid gap-2${frame ? " h-full min-h-0 grid-rows-[minmax(0,1fr)_auto_auto]" : ""}`} data-leesfield-component={frame ? "VideoFrameEditor" : "VideoTrimEditor"} data-trim-active={active && visible} data-filmstrip-status={filmstrip.status}>
      {(!externalResults || result && onClearOutput) && <div className="flex items-center justify-between">
        {!externalResults && <NodeViewTabs id={tabsId} label={tc("Video preview")} value={tab}
          tabs={[{ value: "source", label: tc("Source") }, { value: "output", label: tc("Result"), disabled: !output }]}
          onChange={changeTab} />}
        {result && onClearOutput ? <button type="button" aria-label={tc("Clear result")}
          disabled={!writable} onClick={() => { changeTab("source"); onClearOutput(); }}
          className="grid h-6 w-6 place-items-center rounded text-neutral-400 hover:bg-white/10 disabled:opacity-30">
          <X size={14} />
        </button> : null}
      </div>}
      <div className={frame ? "relative min-h-0 overflow-hidden bg-black/60" : "relative aspect-video min-h-36 overflow-hidden rounded-md bg-black/60"}
        role={externalResults ? "region" : "tabpanel"} id={`${tabsId}-${tab}-panel`} aria-label={externalResults ? tc("Operation source") : undefined} aria-labelledby={externalResults ? undefined : `${tabsId}-${tab}-tab`}
        data-space-operation-preview="" data-preview-state={result ? "output" : source ? "input" : "empty"}>
        {asset?.type === "video" ? (
          <AppVideoPlayer key={asset.url} ref={video} src={asset.url} active={mediaLoaded} controls={false} inlineOnly playsInline preload={mediaLoaded ? "metadata" : "none"}
            aria-label={tc(result ? "Operation result" : "Operation source")}
            className="absolute inset-0 h-full w-full object-contain" muted={stripAudio}
            onLoadedMetadata={(event) => {
              const element = event.currentTarget;
              setMetadata({ url: asset.url, duration: validDuration(element.duration) });
              setMediaError(false);
              if (frame || (active && visible) || playbackIntent.current === asset.url) {
                const target = result ? 0 : Math.min(frame ? framePosition.current : startMs / 1000, Math.max(0, element.duration - (frame ? 0 : 0.01)));
                if (Math.abs(element.currentTime - target) > 0.001) element.currentTime = target;
              }
              setPosition(element.currentTime);
              framePosition.current = element.currentTime;
            }}
            onTimeUpdate={(event) => {
              const element = event.currentTarget;
              if (!result && !element.paused && element.currentTime >= end) {
                element.pause();
                element.currentTime = end;
              }
              setPosition(element.currentTime);
              framePosition.current = element.currentTime;
            }}
            onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)}
            onEnded={() => setPlaying(false)} onError={() => { setMediaError(true); setPlaying(false); }}
          />
        ) : <div className="absolute inset-0 flex items-center justify-center text-xs text-neutral-500">{tc("Connect a video")}</div>}
      </div>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <button type="button" aria-label={tc(playing ? "Pause" : frame ? "Play" : "Play selection")}
            disabled={!asset || !playbackDuration || mediaError} onClick={() => void togglePlayback()}
            className="grid h-7 w-7 place-items-center rounded text-neutral-200 hover:bg-white/10 disabled:opacity-30">
            {playing ? <Pause size={14} /> : <Play size={14} />}
          </button>
          <span className="font-mono text-[11px] tabular-nums text-neutral-400">{time(position)} / {time(playbackDuration)}</span>
        </div>
        {!frame && <button type="button" aria-label={tc("Remove embedded audio")} title={tc("Remove embedded audio")}
          aria-pressed={stripAudio} disabled={!writable} onClick={() => onChange({ stripAudio: !stripAudio })}
          className={`grid h-7 w-7 place-items-center rounded hover:bg-white/10 disabled:opacity-30 ${stripAudio ? "text-blue-400" : "text-neutral-400"}`}>
          {stripAudio ? <VolumeX size={14} /> : <Volume2 size={14} />}
        </button>}
      </div>
      <div className={`rounded-md border border-neutral-700/70 bg-neutral-900/60 px-2 pb-2 ${result ? "opacity-45" : ""}`}
        data-leesfield-component="TrimTimeline">
        <div ref={ruler} role="slider" tabIndex={duration && !result ? 0 : -1} aria-label={tc("Playback position")}
          aria-valuemin={0} aria-valuemax={duration} aria-valuenow={clamp(position, 0, duration)} aria-valuetext={time(position)}
          aria-disabled={!duration || result} className="relative h-7 touch-none cursor-pointer outline-none focus-visible:ring-1 focus-visible:ring-blue-400"
          onPointerDown={(event) => {
            if (event.button !== 0 || !duration || result) return;
            event.currentTarget.setPointerCapture(event.pointerId);
            scrub(event.clientX);
          }}
          onPointerMove={(event) => { if (event.currentTarget.hasPointerCapture(event.pointerId)) scrub(event.clientX); }}
          onPointerUp={(event) => {
            if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
            event.currentTarget.releasePointerCapture(event.pointerId);
            if (frame && writable) frame.onChange(Math.round(framePosition.current * 1000));
          }}
          onKeyDown={(event) => {
            if (!duration || result) return;
            const next = event.key === "Home" ? 0 : event.key === "End" ? duration
              : event.key === "ArrowLeft" ? position - step : event.key === "ArrowRight" ? position + step : null;
            if (next !== null) { event.preventDefault(); seek(next); }
          }}>
          {[0, 1, 2, 3, 4].map((index) => (
            <span key={index} className="absolute bottom-0 top-1 border-l border-neutral-600 text-[9px] text-neutral-500"
              style={{ left: `${index * 25}%` }}>
              <span className={index === 4 ? "absolute right-0" : "pl-1"}>{duration ? `${Number((duration * index / 4).toFixed(1))}s` : "—"}</span>
            </span>
          ))}
          {!result && duration > 0 ? <span className="pointer-events-none absolute top-1 z-20 h-[78px] w-px bg-red-400" style={{ left: `${clamp(position / duration, 0, 1) * 100}%` }}>
            <span className="absolute -left-1 top-0 h-2 w-2 rounded-sm bg-red-400" />
          </span> : null}
        </div>
        {frame ? <div className="relative h-12 w-full overflow-hidden rounded bg-neutral-800" data-frame-filmstrip
          onPointerDown={event => {
            if (event.button !== 0 || !duration) return;
            event.currentTarget.setPointerCapture(event.pointerId); scrub(event.clientX);
          }} onPointerMove={event => { if (event.currentTarget.hasPointerCapture(event.pointerId)) scrub(event.clientX); }}
          onPointerUp={event => {
            if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
            event.currentTarget.releasePointerCapture(event.pointerId);
            if (writable) frame.onChange(Math.round(framePosition.current * 1000));
          }}>
          <div className="pointer-events-none absolute inset-0 flex" aria-hidden="true">{frames.map((image, index) => (
            // Decoded local frame thumbnails share the bounded Trim scheduler.
            // eslint-disable-next-line @next/next/no-img-element
            <img key={index} src={image} alt="" className="h-full min-w-0 flex-1 object-cover" />
          ))}{!frames.length && <span className="m-auto text-[10px] text-neutral-500">{tc("Video")}</span>}</div>
        </div> : <Slider.Root value={[start, end]} min={0} max={duration || 1} step={step}
          minStepsBetweenValues={0} disabled={!editable}
          onValueChange={(values) => changeRange(values)}
          className="nodrag">
          <Slider.Control className="relative flex h-12 w-full touch-none items-center">
            <Slider.Track className="relative h-full w-full rounded bg-neutral-800">
              <div className="pointer-events-none absolute inset-0 flex overflow-hidden rounded" aria-hidden="true" data-trim-filmstrip>
                {frames.map((frame, index) => (
                  // Local decoded frames are temporary UI assets, not catalog images.
                  // eslint-disable-next-line @next/next/no-img-element
                  <img key={index} src={frame} alt="" className="h-full min-w-0 flex-1 object-cover" />
                ))}
                {!frames.length ? <span className="m-auto text-[10px] text-neutral-500">{tc("Video")}</span> : null}
              </div>
              <div aria-hidden="true" className="pointer-events-none absolute inset-y-0 left-0 bg-black/65" style={{ width: `${duration ? start / duration * 100 : 0}%` }} />
              <div aria-hidden="true" className="pointer-events-none absolute inset-y-0 right-0 bg-black/65" style={{ width: `${duration ? (1 - end / duration) * 100 : 0}%` }} />
              <Slider.Indicator className="pointer-events-none absolute h-full border-y-2 border-blue-400 bg-blue-400/10" />
              {[tc("Trim start"), tc("Trim end")].map((label, index) => (
                <Slider.Thumb key={label} index={index} aria-label={label} data-trim-boundary={index === 0 ? "start" : "end"}
                  className="z-10 flex h-12 w-3 items-center justify-center rounded-sm bg-blue-400 outline-none focus-visible:ring-2 focus-visible:ring-white data-disabled:bg-neutral-600">
                  <span className="h-4 w-0.5 rounded bg-neutral-950/65" aria-hidden="true" />
                </Slider.Thumb>
              ))}
            </Slider.Track>
          </Slider.Control>
        </Slider.Root>}
      </div>
      {!frame && <div className="flex items-center justify-between gap-2 text-[10px] text-neutral-400">
        {[{ label: "Trim start time", value: start, max: end - gap, min: 0, index: 0 },
          { label: "Trim end time", value: end, max: duration, min: start + gap, index: 1 }].map((field) => (
          <label key={field.label} className="flex items-center gap-1">
            {tc(field.index === 0 ? "Start" : "End")}
            <input type="number" aria-label={tc(field.label)} min={field.min} max={field.max} step={step}
              value={Number(field.value.toFixed(3))} disabled={!editable}
              onChange={(event) => {
                const value = event.currentTarget.valueAsNumber;
                if (!Number.isFinite(value)) return;
                const next = clamp(value, field.min, field.max);
                changeRange(field.index === 0 ? [next, end] : [start, next]);
              }}
              className="h-6 w-16 rounded border border-neutral-700 bg-neutral-900 px-1 font-mono text-neutral-200 outline-none focus:border-blue-400 disabled:opacity-40" />
            s
          </label>
        ))}
        <span className="order-none whitespace-nowrap font-mono text-blue-300" title={tc("Selected duration")}>{time(selectedDuration)}</span>
      </div>}
      {invalidRange && !result && !frame ? <p role="alert" className="text-[10px] text-amber-300">{tc("Adjust the trim range to fit the video.")}</p> : null}
      {mediaError || playError ? <p role="alert" className="text-[10px] text-red-200">{tc("Could not play the video. Try again.")}</p> : null}
    </div>
  );
}
