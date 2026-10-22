import type { MediaAssetDto } from "@/shared/media-assets/media-asset-contract";

export interface SpaceFilmstripSpec { count: number; width: number; height: number; quality: number }
export const defaultSpaceFilmstripSpec: Readonly<SpaceFilmstripSpec> = Object.freeze({ count: 8, width: 120, height: 68, quality: 0.6 });
interface SpaceFilmstripLimits { concurrency: number; queued: number; entries: number; bitmapBytes: number; sourceBytes: number; timeoutMs: number; attempts: number }
export const spaceFilmstripLimits: Readonly<SpaceFilmstripLimits> = Object.freeze({ concurrency: 2, queued: 64, entries: 16, bitmapBytes: 32 * 1024 * 1024,
  sourceBytes: 32 * 1024 * 1024, timeoutMs: 12_000, attempts: 3 });
export type SpaceFilmstripSnapshot = { status: "idle" | "queued" | "loading" | "ready" | "error"; images: readonly string[] };
export interface SpaceFilmstripResult { images: readonly string[]; bitmapBytes: number; release: () => void }
type Processor = (asset: MediaAssetDto, spec: SpaceFilmstripSpec, signal: AbortSignal) => Promise<SpaceFilmstripResult>;
const emptyImages: readonly string[] = Object.freeze([]);
const idle: SpaceFilmstripSnapshot = Object.freeze({ status: "idle", images: emptyImages });
type Job = { key: string; asset: MediaAssetDto; spec: SpaceFilmstripSpec; controller: AbortController; listeners: Set<() => void>;
  snapshot: SpaceFilmstripSnapshot; running: boolean; attempts: number; lastUse: number; value?: SpaceFilmstripResult };

export function spaceFilmstripKey(asset: MediaAssetDto, spec: SpaceFilmstripSpec = defaultSpaceFilmstripSpec) {
  return JSON.stringify([asset.id, asset.version, asset.updatedAt, asset.url, asset.bytes, asset.mimeType, spec.count, spec.width, spec.height, spec.quality]);
}
function validSpec(spec: SpaceFilmstripSpec) {
  return Number.isInteger(spec.count) && spec.count > 0 && spec.count <= 16 && Number.isInteger(spec.width) && spec.width > 0 && spec.width <= 512
    && Number.isInteger(spec.height) && spec.height > 0 && spec.height <= 288 && Number.isFinite(spec.quality) && spec.quality > 0 && spec.quality <= 1;
}
const estimatedBytes = (spec: SpaceFilmstripSpec) => spec.count * spec.width * spec.height * 4;

/** Bounded shared work and cache. Pinned results keep URLs valid; excess work waits. */
export function createSpaceFilmstripScheduler(process: Processor, limits: Partial<SpaceFilmstripLimits> = {}) {
  const cap = { ...spaceFilmstripLimits, ...limits }, jobs = new Map<string, Job>(), queue: Job[] = [];
  let running = 0, reservedBytes = 0, readyEntries = 0, readyBytes = 0, clock = 0;
  const notify = (job: Job) => { for (const listener of [...job.listeners]) listener(); };
  const publish = (job: Job, snapshot: SpaceFilmstripSnapshot) => { if (jobs.get(job.key) === job) { job.snapshot = snapshot; notify(job); } };
  const release = (job: Job) => {
    if (job.value) { readyEntries--; readyBytes -= job.value.bitmapBytes; job.value.release(); job.value = undefined; }
    if (jobs.get(job.key) === job) jobs.delete(job.key);
  };
  const reserve = (bytes: number) => {
    while (readyEntries + running >= cap.entries || readyBytes + reservedBytes + bytes > cap.bitmapBytes) {
      const idle = [...jobs.values()].filter(job => job.value && !job.listeners.size).sort((a, b) => a.lastUse - b.lastUse)[0];
      if (!idle) return false;
      release(idle);
    }
    return true;
  };
  const drain = () => {
    while (running < cap.concurrency && queue.length) {
      const job = queue[0];
      if (!job.listeners.size || job.controller.signal.aborted || jobs.get(job.key) !== job) { queue.shift(); continue; }
      const reservation = estimatedBytes(job.spec);
      if (!reserve(reservation)) break;
      queue.shift(); job.running = true; job.attempts++; running++; reservedBytes += reservation;
      publish(job, { status: "loading", images: emptyImages });
      const timer = setTimeout(() => job.controller.abort(new Error("FILMSTRIP_TIMEOUT")), cap.timeoutMs);
      void Promise.resolve().then(() => process(job.asset, job.spec, job.controller.signal)).then(result => {
        if (job.controller.signal.aborted || jobs.get(job.key) !== job || !job.listeners.size) {
          result.release();
          if (job.controller.signal.aborted) publish(job, { status: "error", images: emptyImages });
          return;
        }
        if (!Number.isFinite(result.bitmapBytes) || result.bitmapBytes < 0 || result.bitmapBytes > reservation || result.images.length > job.spec.count) {
          result.release(); throw new Error("FILMSTRIP_OUTPUT_LIMIT");
        }
        job.value = result; readyEntries++; readyBytes += result.bitmapBytes;
        publish(job, { status: "ready", images: result.images });
      }).catch(() => { publish(job, { status: "error", images: emptyImages }); }).finally(() => {
        clearTimeout(timer); job.running = false; running--; reservedBytes -= reservation;
        if (!job.listeners.size && jobs.get(job.key) === job && !job.value) release(job);
        drain();
      });
    }
  };
  return {
    getSnapshot: (key: string) => jobs.get(key)?.snapshot ?? idle,
    subscribe(asset: MediaAssetDto, listener: () => void, spec: SpaceFilmstripSpec = defaultSpaceFilmstripSpec) {
      if (asset.type !== "video" || asset.status !== "completed" || !validSpec(spec) || estimatedBytes(spec) > cap.bitmapBytes
        || (asset.bytes !== null && (!Number.isFinite(Number(asset.bytes)) || Number(asset.bytes) < 0 || Number(asset.bytes) > cap.sourceBytes))) return () => {};
      const key = spaceFilmstripKey(asset, spec);
      let job = jobs.get(key);
      if (!job) {
        if (queue.length >= cap.queued) return () => {};
        job = { key, asset, spec: { ...spec }, controller: new AbortController(), listeners: new Set(), snapshot: { status: "queued", images: emptyImages }, running: false, attempts: 0, lastUse: ++clock };
        jobs.set(key, job); queue.push(job);
      }
      const owned = job;
      owned.lastUse = ++clock; owned.listeners.add(listener); drain();
      return () => {
        owned.listeners.delete(listener);
        if (!owned.listeners.size && !owned.value) {
          if (jobs.get(key) === owned) jobs.delete(key);
          const queued = queue.indexOf(owned); if (queued >= 0) queue.splice(queued, 1);
          owned.controller.abort();
        }
        drain();
      };
    },
    retry(key: string) {
      const job = jobs.get(key);
      if (!job || job.running || !job.listeners.size || job.snapshot.status !== "error" || job.attempts >= cap.attempts || queue.length >= cap.queued) return false;
      job.controller = new AbortController(); queue.push(job); publish(job, { status: "queued", images: emptyImages }); drain(); return true;
    },
    clear() {
      queue.length = 0;
      for (const job of [...jobs.values()]) { job.controller.abort(); release(job); notify(job); }
    },
    stats: () => ({ running, queued: queue.length, readyEntries, readyBytes, reservedBytes, jobs: jobs.size }),
  };
}

export async function readVideoBytes(response: Response, signal: AbortSignal, maxBytes = spaceFilmstripLimits.sourceBytes): Promise<Blob> {
  if (!response.ok || !response.body || Number(response.headers.get("content-length")) > maxBytes) {
    await response.body?.cancel().catch(() => undefined); throw new Error("FILMSTRIP_SOURCE_UNAVAILABLE");
  }
  const reader = response.body.getReader(), chunks: ArrayBuffer[] = [];
  const abort = () => { void reader.cancel().catch(() => undefined); };
  let total = 0;
  signal.addEventListener("abort", abort, { once: true });
  try {
    while (true) {
      signal.throwIfAborted(); const { done, value } = await reader.read(); if (done) break;
      total += value.byteLength; if (total > maxBytes) throw new Error("FILMSTRIP_SOURCE_TOO_LARGE");
      chunks.push(value.slice().buffer);
    }
    signal.throwIfAborted(); if (!total) throw new Error("FILMSTRIP_SOURCE_EMPTY");
    return new Blob(chunks, { type: response.headers.get("content-type") ?? "video/mp4" });
  } finally { signal.removeEventListener("abort", abort); await reader.cancel().catch(() => undefined); reader.releaseLock(); }
}

export async function decodeSpaceFilmstrip(asset: MediaAssetDto, spec: SpaceFilmstripSpec, signal: AbortSignal): Promise<SpaceFilmstripResult> {
  signal.throwIfAborted();
  if (!validSpec(spec)) throw new Error("FILMSTRIP_SPEC_INVALID");
  const video = document.createElement("video"), canvas = document.createElement("canvas"), images: string[] = [];
  video.muted = true; video.preload = "auto";
  let sourceUrl: string | undefined, released = false;
  const releaseFrames = () => { for (const image of images.splice(0)) URL.revokeObjectURL(image); };
  const release = () => {
    if (released) return; released = true; video.pause(); video.removeAttribute("src"); video.load();
    if (sourceUrl) URL.revokeObjectURL(sourceUrl); canvas.width = 0; canvas.height = 0;
  };
  const abort = () => { release(); releaseFrames(); };
  signal.addEventListener("abort", abort, { once: true });
  const wait = (event: string) => new Promise<void>((resolve, reject) => {
    const cleanup = () => { video.removeEventListener(event, done); video.removeEventListener("error", fail); signal.removeEventListener("abort", fail); };
    const done = () => { cleanup(); resolve(); }, fail = () => { cleanup(); reject(new Error("FILMSTRIP_DECODE_FAILED")); };
    if (signal.aborted) { fail(); return; }
    video.addEventListener(event, done, { once: true }); video.addEventListener("error", fail, { once: true }); signal.addEventListener("abort", fail, { once: true });
  });
  try {
    const response = await fetch(`/api/media-assets/${encodeURIComponent(asset.id)}/content`, { credentials: "same-origin", signal });
    const bytes = await readVideoBytes(response, signal); signal.throwIfAborted();
    sourceUrl = URL.createObjectURL(bytes); const loaded = wait("loadeddata"); video.src = sourceUrl; await loaded;
    signal.throwIfAborted();
    const duration = Math.min(600, video.duration);
    if (!Number.isFinite(duration) || duration <= 0 || !video.videoWidth || !video.videoHeight) throw new Error("FILMSTRIP_METADATA_INVALID");
    canvas.width = spec.width; canvas.height = spec.height; const context = canvas.getContext("2d");
    if (!context) throw new Error("FILMSTRIP_CANVAS_UNAVAILABLE");
    for (let index = 0; index < spec.count; index++) {
      const time = Math.max(0, Math.min(duration - 0.001, duration * (index + 0.5) / spec.count));
      if (Math.abs(video.currentTime - time) > 0.0001) { const seeked = wait("seeked"); video.currentTime = time; await seeked; }
      signal.throwIfAborted(); context.drawImage(video, 0, 0, spec.width, spec.height);
      const blob = await new Promise<Blob>((resolve, reject) => {
        const fail = () => reject(new Error("FILMSTRIP_CANCELLED")); signal.addEventListener("abort", fail, { once: true });
        try {
          canvas.toBlob(value => { signal.removeEventListener("abort", fail); if (signal.aborted || !value) reject(new Error("FILMSTRIP_ENCODE_FAILED")); else resolve(value); }, "image/jpeg", spec.quality);
        } catch (error) { signal.removeEventListener("abort", fail); reject(error); }
      });
      signal.throwIfAborted(); images.push(URL.createObjectURL(blob));
    }
    return { images: [...images], bitmapBytes: estimatedBytes(spec), release: releaseFrames };
  } catch (error) { releaseFrames(); throw error; }
  finally { signal.removeEventListener("abort", abort); release(); }
}

export const spaceFilmstripScheduler = createSpaceFilmstripScheduler(decodeSpaceFilmstrip);
