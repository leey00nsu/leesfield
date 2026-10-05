"use client";

import { Slider } from "@base-ui/react/slider";
import { Pause, Play, Scissors, Volume2, VolumeX, X } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";

import { useCanvasTranslation } from "@/shared/i18n/use-canvas-translation";
import type { MediaAssetDto } from "@/shared/media-assets/media-asset-contract";
import { NodeViewTabs } from "./node-view-tabs";

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const validDuration = (value: number | undefined) => value && Number.isFinite(value) && value > 0 ? Math.min(value, 600) : 0;
function time(seconds: number) {
  const hundredths = Math.round(Math.max(0, seconds) * 100);
  return `${Math.floor(hundredths / 6000).toString().padStart(2, "0")}:${(Math.floor(hundredths / 100) % 60).toString().padStart(2, "0")}.${(hundredths % 100).toString().padStart(2, "0")}`;
}

/** One bounded decoder, local frames only. CORS/codec failures leave a usable track. */
function useFilmstrip(asset: MediaAssetDto | null | undefined) {
  const assetId = asset?.id;
  const bytes = asset?.bytes;
  const [frames, setFrames] = useState<{ assetId: string; images: string[] } | null>(null);
  useEffect(() => {
    const maxBytes = 32 * 1024 * 1024;
    if (!assetId || (bytes && Number(bytes) > maxBytes)) return;
    const controller = new AbortController();
    const video = document.createElement("video");
    video.crossOrigin = "anonymous";
    video.muted = true;
    video.preload = "auto";
    const timeout = setTimeout(() => controller.abort(), 12_000);
    let objectUrl: string | undefined;
    const wait = (event: string) => new Promise<void>((resolve, reject) => {
      const cleanup = () => {
        video.removeEventListener(event, done);
        video.removeEventListener("error", fail);
        controller.signal.removeEventListener("abort", fail);
      };
      const done = () => { cleanup(); resolve(); };
      const fail = () => { cleanup(); reject(new Error("FRAME_UNAVAILABLE")); };
      if (controller.signal.aborted) { reject(new Error("ABORTED")); return; }
      video.addEventListener(event, done, { once: true });
      video.addEventListener("error", fail, { once: true });
      controller.signal.addEventListener("abort", fail, { once: true });
    });
    let released = false;
    const release = () => {
      if (released) return;
      released = true;
      video.pause();
      video.removeAttribute("src");
      video.load();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
    void (async () => {
      try {
        // This existing owner-scoped proxy avoids storage CORS and keeps keys on the server.
        const response = await fetch(`/api/media-assets/${encodeURIComponent(assetId)}/content`, {
          credentials: "same-origin", signal: controller.signal,
        });
        if (!response.ok || !response.body) return;
        if (Number(response.headers.get("content-length")) > maxBytes) {
          await response.body.cancel();
          return;
        }
        const reader = response.body.getReader();
        const chunks: ArrayBuffer[] = [];
        let size = 0;
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            size += value.byteLength;
            if (size > maxBytes) throw new Error("FRAME_SOURCE_TOO_LARGE");
            chunks.push(value.slice().buffer);
          }
        } finally { await reader.cancel().catch(() => undefined); }
        if (controller.signal.aborted || !size) return;
        objectUrl = URL.createObjectURL(new Blob(chunks, { type: response.headers.get("content-type") ?? "video/mp4" }));
        const metadata = wait("loadeddata");
        video.src = objectUrl;
        await metadata;
        const duration = validDuration(video.duration);
        if (!duration || !video.videoWidth) return;
        const canvas = document.createElement("canvas");
        canvas.width = 120;
        canvas.height = 68;
        const context = canvas.getContext("2d");
        if (!context) return;
        const images: string[] = [];
        for (let index = 0; index < 8; index++) {
          const position = Math.min(duration - 0.001, duration * (index + 0.5) / 8);
          const seeked = wait("seeked");
          video.currentTime = position;
          await seeked;
          if (controller.signal.aborted) return;
          context.drawImage(video, 0, 0, canvas.width, canvas.height);
          images.push(canvas.toDataURL("image/jpeg", 0.6));
        }
        if (!controller.signal.aborted) setFrames({ assetId, images });
      } catch { /* A thumbnail failure never blocks trimming or playback. */ }
      finally { clearTimeout(timeout); release(); }
    })();
    return () => {
      controller.abort();
      clearTimeout(timeout);
      release();
    };
  }, [assetId, bytes]);
  return frames && frames.assetId === assetId ? frames.images : [];
}

export function VideoTrimEditor({
  source, output, startMs, endMs, stripAudio, writable, onChange, onClearOutput, externalResults = false,
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
}) {
  const tc = useCanvasTranslation();
  const video = useRef<HTMLVideoElement>(null);
  const ruler = useRef<HTMLDivElement>(null);
  const [preview, setPreview] = useState<{ tab: "source" | "output"; outputId: string | undefined }>({
    tab: output ? "output" : "source", outputId: output?.id,
  });
  const tab = preview.outputId === output?.id ? preview.tab : output ? "output" : "source";
  const [metadata, setMetadata] = useState<{ url: string; duration: number } | null>(null);
  const [position, setPosition] = useState(0);
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
  const end = clamp(endMs / 1000, start + gap, duration || gap);
  const selectedDuration = duration ? Math.max(0, end - start) : 0;
  const frames = useFilmstrip(source?.type === "video" ? source : undefined);
  const editable = writable && source?.type === "video" && duration > 0 && !result;
  const playbackDuration = result
    ? validDuration(metadata && metadata.url === asset?.url ? metadata.duration : (output?.durationMs ?? 0) / 1000)
    : duration;
  const invalidRange = duration > 0 && (startMs < 0 || endMs <= startMs || endMs > Math.round(duration * 1000));

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

  const seek = (next: number) => {
    if (!video.current || !duration || result) return;
    const value = clamp(next, 0, duration);
    video.current.pause();
    video.current.currentTime = value;
    setPosition(value);
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
    if (!result && (element.currentTime < start || element.currentTime >= end - 0.01)) element.currentTime = start;
    else if (result && element.currentTime >= playbackDuration - 0.01) element.currentTime = 0;
    setPlayError(false);
    try { await element.play(); } catch { setPlayError(true); }
  };
  const scrub = (clientX: number) => {
    const bounds = ruler.current?.getBoundingClientRect();
    if (bounds?.width) seek(((clientX - bounds.left) / bounds.width) * duration);
  };

  return (
    <div className="grid gap-2" data-leesfield-component="VideoTrimEditor">
      <div className="flex items-center justify-between">
        {!externalResults && <NodeViewTabs id={tabsId} label={tc("Video preview")} value={tab}
          tabs={[{ value: "source", label: tc("Source") }, { value: "output", label: tc("Result"), disabled: !output }]}
          onChange={changeTab} />}
        {result && onClearOutput ? <button type="button" aria-label={tc("Clear result")}
          disabled={!writable} onClick={() => { changeTab("source"); onClearOutput(); }}
          className="grid h-6 w-6 place-items-center rounded text-neutral-400 hover:bg-white/10 disabled:opacity-30">
          <X size={14} />
        </button> : <Scissors size={14} className="text-neutral-500" aria-hidden="true" />}
      </div>
      <div className="relative aspect-video min-h-36 overflow-hidden rounded-md bg-black/60"
        role={externalResults ? "region" : "tabpanel"} id={`${tabsId}-${tab}-panel`} aria-label={externalResults ? tc("Operation source") : undefined} aria-labelledby={externalResults ? undefined : `${tabsId}-${tab}-tab`}
        data-node-banana-component="OperationPreview" data-preview-state={result ? "output" : source ? "input" : "empty"}>
        {asset?.type === "video" ? (
          <video key={asset.url} ref={video} src={asset.url} playsInline preload="metadata"
            aria-label={tc(result ? "Operation result" : "Operation source")}
            className="absolute inset-0 h-full w-full object-contain" muted={stripAudio}
            onLoadedMetadata={(event) => {
              const element = event.currentTarget;
              setMetadata({ url: asset.url, duration: validDuration(element.duration) });
              setMediaError(false);
              element.currentTime = result ? 0 : Math.min(startMs / 1000, Math.max(0, element.duration - 0.01));
              setPosition(element.currentTime);
            }}
            onTimeUpdate={(event) => {
              const element = event.currentTarget;
              if (!result && !element.paused && element.currentTime >= end) {
                element.pause();
                element.currentTime = end;
              }
              setPosition(element.currentTime);
            }}
            onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)}
            onEnded={() => setPlaying(false)} onError={() => { setMediaError(true); setPlaying(false); }}
          />
        ) : <div className="absolute inset-0 flex items-center justify-center border border-dashed border-neutral-700 text-xs text-neutral-500">{tc("Connect a video")}</div>}
      </div>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <button type="button" aria-label={tc(playing ? "Pause" : "Play selection")}
            disabled={!asset || !playbackDuration || mediaError} onClick={() => void togglePlayback()}
            className="grid h-7 w-7 place-items-center rounded text-neutral-200 hover:bg-white/10 disabled:opacity-30">
            {playing ? <Pause size={14} /> : <Play size={14} />}
          </button>
          <span className="font-mono text-[11px] tabular-nums text-neutral-400">{time(position)} / {time(playbackDuration)}</span>
        </div>
        <button type="button" aria-label={tc("Remove embedded audio")} title={tc("Remove embedded audio")}
          aria-pressed={stripAudio} disabled={!writable} onClick={() => onChange({ stripAudio: !stripAudio })}
          className={`grid h-7 w-7 place-items-center rounded hover:bg-white/10 disabled:opacity-30 ${stripAudio ? "text-blue-400" : "text-neutral-400"}`}>
          {stripAudio ? <VolumeX size={14} /> : <Volume2 size={14} />}
        </button>
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
          onPointerUp={(event) => { if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId); }}
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
        <Slider.Root value={[start, end]} min={0} max={duration || 1} step={step}
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
                {!frames.length ? <span className="m-auto flex items-center gap-1 text-[10px] text-neutral-500"><Scissors size={12} />{tc("Video")}</span> : null}
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
        </Slider.Root>
      </div>
      <div className="flex items-center justify-between gap-2 text-[10px] text-neutral-400">
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
      </div>
      {invalidRange && !result ? <p role="alert" className="text-[10px] text-amber-300">{tc("Adjust the trim range to fit the video.")}</p> : null}
      {mediaError || playError ? <p role="alert" className="text-[10px] text-red-200">{tc("Could not play the video. Try again.")}</p> : null}
    </div>
  );
}
