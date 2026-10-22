// @vitest-environment node
import type { MediaAssetDto } from "@/shared/media-assets/media-asset-contract";
import { createSpaceFilmstripScheduler, defaultSpaceFilmstripSpec, spaceFilmstripKey, type SpaceFilmstripResult } from "./space-filmstrip";

const asset = (id = "video", patch: Partial<MediaAssetDto> = {}): MediaAssetDto => ({
  id, version: 1, type: "video", status: "completed", origin: "upload", mimeType: "video/mp4", bytes: "1234",
  width: 320, height: 180, durationMs: 4000, sourceOperationId: null, url: `https://storage.example/${id}.mp4`, createdAt: "2026-10-20", updatedAt: "2026-10-20", ...patch,
});
const bytes = defaultSpaceFilmstripSpec.count * defaultSpaceFilmstripSpec.width * defaultSpaceFilmstripSpec.height * 4;
function deferred() {
  let resolve!: (value: SpaceFilmstripResult) => void, reject!: (error: Error) => void;
  const promise = new Promise<SpaceFilmstripResult>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
const value = (id = "frame"): SpaceFilmstripResult => ({ images: [`blob:${id}`], bitmapBytes: bytes, release: vi.fn() });
const flush = async () => { for (let index = 0; index < 12; index++) await Promise.resolve(); };

describe("shared bounded Trim filmstrip work", () => {
  afterEach(() => vi.useRealTimers());

  it("deduplicates source revisions, pins URLs through both subscribers and reuses completed frames", async () => {
    const output = value(), process = vi.fn(async () => output), scheduler = createSpaceFilmstripScheduler(process);
    const a = scheduler.subscribe(asset(), vi.fn()), b = scheduler.subscribe(asset(), vi.fn());
    await flush();
    expect(process).toHaveBeenCalledTimes(1);
    expect(scheduler.getSnapshot(spaceFilmstripKey(asset()))).toEqual({ status: "ready", images: output.images });
    a(); b();
    const c = scheduler.subscribe(asset(), vi.fn()); await flush();
    expect(process).toHaveBeenCalledTimes(1);
    expect(output.release).not.toHaveBeenCalled();
    c(); scheduler.clear(); expect(output.release).toHaveBeenCalledOnce();
  });

  it("includes source URL, version, metadata revision and frame spec in identity", () => {
    const key = spaceFilmstripKey(asset());
    for (const patch of [{ version: 2 }, { updatedAt: "later" }, { bytes: "1235" }, { url: "https://new.example/v.mp4" }]) {
      expect(spaceFilmstripKey(asset("video", patch))).not.toBe(key);
    }
    expect(spaceFilmstripKey(asset(), { ...defaultSpaceFilmstripSpec, width: 100 })).not.toBe(key);
  });

  it("caps active and queued jobs and waits for an aborted decoder to actually release its slot", async () => {
    const jobs: ReturnType<typeof deferred>[] = [], signals: AbortSignal[] = [];
    const process = vi.fn((_asset, _spec, signal: AbortSignal) => { const job = deferred(); jobs.push(job); signals.push(signal); return job.promise; });
    const scheduler = createSpaceFilmstripScheduler(process, { concurrency: 2, queued: 2 });
    const cleanups = [0, 1, 2, 3, 4].map(index => scheduler.subscribe(asset(String(index)), vi.fn()));
    await flush();
    expect(process).toHaveBeenCalledTimes(2);
    expect(scheduler.stats()).toMatchObject({ running: 2, queued: 2, jobs: 4 });
    cleanups[0](); expect(signals[0].aborted).toBe(true);
    expect(process).toHaveBeenCalledTimes(2);
    const late = value(); jobs[0].resolve(late); await flush();
    expect(late.release).toHaveBeenCalledOnce();
    expect(process).toHaveBeenCalledTimes(3);
    cleanups.forEach(cleanup => cleanup()); jobs.slice(1).forEach(job => job.reject(new Error("cancelled"))); await flush();
    expect(scheduler.stats()).toMatchObject({ running: 0, queued: 0, jobs: 0, reservedBytes: 0 });
  });

  it("never evicts a pinned result and admits queued work after the last consumer releases it", async () => {
    const results = [value("a"), value("b"), value("c")]; let next = 0;
    const process = vi.fn(async () => results[next++]);
    const scheduler = createSpaceFilmstripScheduler(process, { entries: 2, bitmapBytes: bytes * 2 });
    const a = scheduler.subscribe(asset("a"), vi.fn()), b = scheduler.subscribe(asset("b"), vi.fn()); await flush();
    const c = scheduler.subscribe(asset("c"), vi.fn()); await flush();
    expect(process).toHaveBeenCalledTimes(2);
    expect(scheduler.stats()).toMatchObject({ queued: 1, readyEntries: 2, readyBytes: bytes * 2 });
    expect(results[0].release).not.toHaveBeenCalled(); a(); await flush();
    expect(results[0].release).toHaveBeenCalledOnce();
    expect(results[1].release).not.toHaveBeenCalled(); expect(process).toHaveBeenCalledTimes(3);
    expect(scheduler.stats().readyBytes).toBeLessThanOrEqual(bytes * 2);
    b(); c(); scheduler.clear();
  });

  it("keeps completed cache bounded even when nothing is pinned", async () => {
    const results: SpaceFilmstripResult[] = [];
    const scheduler = createSpaceFilmstripScheduler(async () => { const result = value(); results.push(result); return result; }, { entries: 2 });
    for (let index = 0; index < 6; index++) { const end = scheduler.subscribe(asset(String(index)), vi.fn()); await flush(); end(); }
    expect(scheduler.stats()).toMatchObject({ readyEntries: 2, running: 0, jobs: 2 });
    expect(results.slice(0, 4).every(result => vi.mocked(result.release).mock.calls.length === 1)).toBe(true);
    scheduler.clear(); expect(results.every(result => vi.mocked(result.release).mock.calls.length === 1)).toBe(true);
  });

  it("rejects oversized or invalid sources/specifications before network/decode work", async () => {
    const process = vi.fn(async () => value()), scheduler = createSpaceFilmstripScheduler(process);
    for (const patch of [{ bytes: String(32 * 1024 * 1024 + 1) }, { bytes: "NaN" }, { bytes: "-1" }, { type: "audio" as const }, { status: "deleting" as const }]) scheduler.subscribe(asset("bad", patch), vi.fn());
    for (const patch of [{ count: 17 }, { width: 0 }, { height: 300 }, { quality: 0 }]) scheduler.subscribe(asset(), vi.fn(), { ...defaultSpaceFilmstripSpec, ...patch });
    await flush(); expect(process).not.toHaveBeenCalled(); expect(scheduler.stats().jobs).toBe(0);
  });

  it("times out, permits at most three explicit attempts and never retries on its own", async () => {
    vi.useFakeTimers();
    const process = vi.fn((_asset, _spec, signal: AbortSignal) => new Promise<SpaceFilmstripResult>((_resolve, reject) => signal.addEventListener("abort", () => reject(new Error("abort")), { once: true })));
    const scheduler = createSpaceFilmstripScheduler(process, { timeoutMs: 20 }), end = scheduler.subscribe(asset(), vi.fn()), key = spaceFilmstripKey(asset());
    for (let attempt = 1; attempt <= 3; attempt++) {
      await flush(); await vi.advanceTimersByTimeAsync(21); await flush();
      expect(scheduler.getSnapshot(key).status).toBe("error");
      expect(process).toHaveBeenCalledTimes(attempt);
      expect(scheduler.retry(key)).toBe(attempt < 3);
    }
    end(); expect(scheduler.stats().jobs).toBe(0);
  });

  it("clearing a Space aborts queued/active work and revokes late completion without publishing stale frames", async () => {
    const active = deferred(), process = vi.fn<(asset: MediaAssetDto, spec: unknown, signal: AbortSignal) => Promise<SpaceFilmstripResult>>(() => active.promise), scheduler = createSpaceFilmstripScheduler(process, { concurrency: 1 });
    const notify = vi.fn(); scheduler.subscribe(asset("a"), notify); scheduler.subscribe(asset("b"), vi.fn()); await flush();
    const signal = process.mock.calls[0][2] as AbortSignal;
    scheduler.clear(); expect(signal.aborted).toBe(true);
    const late = value(); active.resolve(late); await flush();
    expect(late.release).toHaveBeenCalledOnce(); expect(process).toHaveBeenCalledTimes(1);
    expect(scheduler.getSnapshot(spaceFilmstripKey(asset("a"))).status).toBe("idle");
    expect(scheduler.stats()).toMatchObject({ running: 0, queued: 0, readyEntries: 0, reservedBytes: 0, jobs: 0 });
  });

  it("rejects decoder output that exceeds its reservation and releases its URLs", async () => {
    const output = { ...value(), bitmapBytes: bytes + 1 }, scheduler = createSpaceFilmstripScheduler(async () => output);
    const end = scheduler.subscribe(asset(), vi.fn()); await flush();
    expect(scheduler.getSnapshot(spaceFilmstripKey(asset())).status).toBe("error");
    expect(output.release).toHaveBeenCalledOnce(); expect(scheduler.stats().readyBytes).toBe(0); end();
  });
});
