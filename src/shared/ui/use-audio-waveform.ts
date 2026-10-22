"use client";

import { useCallback, useMemo, useSyncExternalStore } from "react";
import type { MediaAssetDto } from "@/shared/media-assets/media-asset-contract";

type WaveformSource = { key: string; url: string; contentUrl: string; bytes: string | null; durationMs: number | null };
// Only compact peaks are retained. Full source bytes and decoded PCM die with
// each job. A source has one shared job, including while queued or decoding.
type WaveformSnapshot = { state: "idle" | "loading" | "ready" | "error"; peaks?: readonly number[]; duration?: number };
type WaveformJob = {
  key: string; asset: WaveformSource; snapshot: WaveformSnapshot;
  listeners: Set<() => void>; controller: AbortController; running: boolean;
};
const idleWaveform: WaveformSnapshot = { state: "idle" };
const waveforms = new Map<string, WaveformJob>();
const waveformQueue: WaveformJob[] = [];
const MAX_WAVEFORM_BYTES = 50 * 1024 * 1024;
const MAX_WAVEFORM_DURATION_MS = 30 * 60 * 1000;
const MAX_WAVEFORM_CACHE = 30;
const MAX_WAVEFORM_QUEUE = 64;
let waveformRunning = 0;

function publishWaveform(job: WaveformJob, snapshot: WaveformSnapshot) {
  if (job.controller.signal.aborted || waveforms.get(job.key) !== job) return;
  job.snapshot = snapshot;
  job.listeners.forEach(listener => listener());
}
function pruneWaveforms() {
  let idleEntries = [...waveforms.values()].filter(job => !job.listeners.size && !job.running && job.snapshot.state === "ready").length;
  for (const [key, job] of waveforms) {
    if (idleEntries <= MAX_WAVEFORM_CACHE) break;
    if (!job.listeners.size && !job.running && job.snapshot.state === "ready") { waveforms.delete(key); idleEntries--; }
  }
}
async function boundedAudioBytes(response: Response, signal: AbortSignal): Promise<ArrayBuffer> {
  if (!response.ok || Number(response.headers.get("content-length")) > MAX_WAVEFORM_BYTES) {
    await response.body?.cancel().catch(() => undefined);
    throw new Error("AUDIO_SOURCE_UNAVAILABLE");
  }
  if (!response.body) {
    const bytes = await response.arrayBuffer();
    if (bytes.byteLength > MAX_WAVEFORM_BYTES || signal.aborted) throw new Error("AUDIO_SOURCE_UNAVAILABLE");
    return bytes;
  }
  const reader = response.body.getReader(), chunks: Uint8Array[] = [];
  const cancel = () => { void reader.cancel().catch(() => undefined); };
  signal.addEventListener("abort", cancel, { once: true });
  let total = 0;
  try {
    while (true) {
      if (signal.aborted) throw new Error("AUDIO_SOURCE_CANCELLED");
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_WAVEFORM_BYTES) throw new Error("AUDIO_SOURCE_TOO_LARGE");
      chunks.push(value);
    }
    const bytes = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    return bytes.buffer;
  } finally {
    signal.removeEventListener("abort", cancel);
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}
async function decodeWaveform(job: WaveformJob) {
  let context: AudioContext | undefined;
  const close = () => { if (context && context.state !== "closed") void context.close().catch(() => undefined); };
  const timeout = setTimeout(() => { publishWaveform(job, { state: "error" }); job.controller.abort(); }, 30_000);
  job.controller.signal.addEventListener("abort", close, { once: true });
  try {
    const AudioCtor = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtor || Number(job.asset.bytes) > MAX_WAVEFORM_BYTES || (job.asset.durationMs ?? 0) > MAX_WAVEFORM_DURATION_MS) throw new Error("WAVEFORM_UNAVAILABLE");
    const response = await fetch(job.asset.contentUrl, { signal: job.controller.signal, credentials: "same-origin" });
    const bytes = await boundedAudioBytes(response, job.controller.signal);
    if (job.controller.signal.aborted) return;
    // Peaks need no high-rate PCM. Limit decode memory for long compressed files.
    context = new AudioCtor({ sampleRate: 8000 });
    const buffer = await context.decodeAudioData(bytes);
    if (job.controller.signal.aborted) return;
    if (!Number.isFinite(buffer.duration) || buffer.duration * 1000 > MAX_WAVEFORM_DURATION_MS) throw new Error("WAVEFORM_UNAVAILABLE");
    const peaks = new Array<number>(256).fill(0);
    for (let channel = 0; channel < Math.min(buffer.numberOfChannels, 2); channel++) {
      const samples = buffer.getChannelData(channel);
      for (let index = 0; index < peaks.length; index++) {
        const start = Math.floor(index * samples.length / peaks.length), end = Math.floor((index + 1) * samples.length / peaks.length);
        const stride = Math.max(1, Math.floor((end - start) / 1024));
        for (let sample = start; sample < end; sample += stride) peaks[index] = Math.max(peaks[index], Math.abs(samples[sample] ?? 0));
      }
    }
    publishWaveform(job, { state: "ready", peaks, duration: buffer.duration });
  } catch {
    publishWaveform(job, { state: "error" });
  } finally {
    clearTimeout(timeout);
    job.controller.signal.removeEventListener("abort", close);
    close();
  }
}
function drainWaveforms() {
  while (waveformRunning < 2 && waveformQueue.length) {
    const job = waveformQueue.shift()!;
    if (!job.listeners.size || job.controller.signal.aborted) continue;
    job.running = true;
    waveformRunning++;
    void decodeWaveform(job).finally(() => {
      job.running = false;
      waveformRunning--;
      pruneWaveforms();
      drainWaveforms();
    });
  }
}
function subscribeWaveform(asset: WaveformSource, listener: () => void) {
  const key = asset.key;
  let job = waveforms.get(key);
  if (!job) {
    job = { key, asset, snapshot: { state: waveformQueue.length < MAX_WAVEFORM_QUEUE ? "loading" : "error" },
      listeners: new Set(), controller: new AbortController(), running: false };
    waveforms.set(key, job);
    if (job.snapshot.state === "loading") waveformQueue.push(job);
  } else {
    // Map order is the completed cache's least-recently-used order.
    waveforms.delete(key); waveforms.set(key, job);
  }
  job.listeners.add(listener);
  drainWaveforms();
  return () => {
    job.listeners.delete(listener);
    if (!job.listeners.size && job.snapshot.state !== "ready") {
      job.controller.abort();
      const queued = waveformQueue.indexOf(job);
      if (queued >= 0) waveformQueue.splice(queued, 1);
      if (waveforms.get(key) === job) waveforms.delete(key);
    }
    pruneWaveforms();
  };
}
/** Asset revisions share bounded decodes; raw URLs share the same limits and cache by URL. */
export function useAudioWaveform(src: string, asset: MediaAssetDto | undefined, active: boolean) {
  const key = audioSourceKey(src, asset);
  const assetId = asset?.id, bytes = asset?.bytes ?? null, durationMs = asset?.durationMs ?? null;
  const source = useMemo<WaveformSource>(() => ({ key, url: src,
    contentUrl: assetId ? `/api/media-assets/${encodeURIComponent(assetId)}/content` : src, bytes, durationMs }),
    [key, src, assetId, bytes, durationMs]);
  const subscribe = useCallback((listener: () => void) => active && Boolean(src) ? subscribeWaveform(source, listener) : () => {}, [active, src, source]);
  const snapshot = useCallback(() => active ? waveforms.get(key)?.snapshot ?? idleWaveform : idleWaveform, [active, key]);
  return useSyncExternalStore(subscribe, snapshot, () => idleWaveform);
}

export function audioSourceKey(src: string, asset?: MediaAssetDto) {
  return asset ? JSON.stringify([asset.id, asset.version, asset.updatedAt, asset.url, src]) : JSON.stringify(["audio-url", src]);
}
