import type { MediaAssetDto } from "@/shared/media-assets/media-asset-contract";
import { readVideoBytes } from "./space-filmstrip";

export type SpaceVideoCapturePosition = "first" | "last" | number;
export type CapturedVideoFrame = { file: File; timestampMs: number };
const limits = { bytes: 500 * 1024 * 1024, dimension: 8192, pixels: 32_000_000, seconds: 600, timeout: 60_000 };
let running = 0;
const queue: (() => void)[] = [];

async function acquire(signal: AbortSignal): Promise<() => void> {
  signal.throwIfAborted();
  if (running >= 2) {
    if (queue.length >= 16) throw new Error("VIDEO_CAPTURE_BUSY");
    await new Promise<void>((resolve, reject) => {
      const ready = () => { signal.removeEventListener("abort", abort); running++; resolve(); };
      const abort = () => { const index = queue.indexOf(ready); if (index >= 0) queue.splice(index, 1); reject(signal.reason); };
      queue.push(ready); signal.addEventListener("abort", abort, { once: true });
    });
  } else running++;
  return () => { running--; queue.shift()?.(); };
}

/** Explicit full-resolution still capture; never seeks or changes the visible player. */
export async function captureSpaceVideoFrame(asset: MediaAssetDto, position: SpaceVideoCapturePosition, signal: AbortSignal): Promise<CapturedVideoFrame> {
  if (asset.type !== "video" || asset.status !== "completed"
    || (typeof position === "number" && (!Number.isFinite(position) || position < 0))
    || (asset.bytes !== null && (!Number.isFinite(Number(asset.bytes)) || Number(asset.bytes) <= 0 || Number(asset.bytes) > limits.bytes)))
    throw new Error("VIDEO_CAPTURE_SOURCE_INVALID");
  const releaseSlot = await acquire(signal);
  const controller = new AbortController(), timeout = setTimeout(() => controller.abort(new Error("VIDEO_CAPTURE_TIMEOUT")), limits.timeout);
  const work = AbortSignal.any([signal, controller.signal]);
  const video = document.createElement("video"), canvas = document.createElement("canvas");
  video.muted = true; video.playsInline = true; video.preload = "auto";
  let url: string | undefined;
  const wait = (event: string) => new Promise<void>((resolve, reject) => {
    const cleanup = () => { video.removeEventListener(event, done); video.removeEventListener("error", fail); work.removeEventListener("abort", fail); };
    const done = () => { cleanup(); resolve(); }, fail = () => { cleanup(); reject(work.reason ?? new Error("VIDEO_CAPTURE_DECODE_FAILED")); };
    if (work.aborted) { fail(); return; }
    video.addEventListener(event, done, { once: true }); video.addEventListener("error", fail, { once: true }); work.addEventListener("abort", fail, { once: true });
  });
  const stop = () => { video.pause(); video.removeAttribute("src"); video.load(); };
  work.addEventListener("abort", stop, { once: true });
  try {
    work.throwIfAborted();
    const response = await fetch(`/api/media-assets/${encodeURIComponent(asset.id)}/content`, { credentials: "same-origin", signal: work });
    const bytes = await readVideoBytes(response, work, limits.bytes);
    work.throwIfAborted(); url = URL.createObjectURL(bytes);
    const loaded = wait("loadeddata"); video.src = url; await loaded;
    const width = video.videoWidth, height = video.videoHeight, duration = video.duration;
    if (!Number.isFinite(duration) || duration <= 0 || duration > limits.seconds || width <= 0 || height <= 0
      || width > limits.dimension || height > limits.dimension || width * height > limits.pixels) throw new Error("VIDEO_CAPTURE_METADATA_INVALID");
    // Seek immediately before EOF so the decoder presents the last actual video frame.
    const time = Math.max(0, Math.min(duration - 0.000001, position === "last" ? duration : position === "first" ? 0 : position));
    if (Math.abs(video.currentTime - time) > 0.0000001) { const seeked = wait("seeked"); video.currentTime = time; await seeked; }
    work.throwIfAborted();
    canvas.width = width; canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("VIDEO_CAPTURE_CANVAS_UNAVAILABLE");
    context.drawImage(video, 0, 0, width, height);
    const blob = await new Promise<Blob>((resolve, reject) => {
      const abort = () => reject(work.reason); work.addEventListener("abort", abort, { once: true });
      try {
        canvas.toBlob(value => { work.removeEventListener("abort", abort); if (work.aborted || !value) reject(work.reason ?? new Error("VIDEO_CAPTURE_ENCODE_FAILED")); else resolve(value); }, "image/png");
      } catch (error) { work.removeEventListener("abort", abort); reject(error); }
    });
    work.throwIfAborted();
    if (blob.size > 25 * 1024 * 1024) throw new Error("VIDEO_CAPTURE_IMAGE_TOO_LARGE");
    const timestampMs = Math.floor(time * 1000);
    return { file: new File([blob], `capture-${timestampMs}ms.png`, { type: "image/png" }), timestampMs };
  } finally {
    clearTimeout(timeout); work.removeEventListener("abort", stop); stop();
    if (url) URL.revokeObjectURL(url); canvas.width = 0; canvas.height = 0; releaseSlot();
  }
}
