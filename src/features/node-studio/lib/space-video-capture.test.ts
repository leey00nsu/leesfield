import type { MediaAssetDto } from "@/shared/media-assets/media-asset-contract";
import { captureSpaceVideoFrame } from "./space-video-capture";

const asset: MediaAssetDto = { id: "video", version: 1, type: "video", status: "completed", origin: "upload", mimeType: "video/mp4", bytes: "1234",
  width: 320, height: 180, durationMs: 3000, sourceOperationId: null, url: "https://other.example/video.mp4", createdAt: "now", updatedAt: "now" };
let video: HTMLVideoElement, canvas: HTMLCanvasElement, time: number;
const draw = vi.fn(), revoke = vi.fn(), pause = vi.fn(), load = vi.fn();
beforeEach(() => {
  video = document.createElement("video"); canvas = document.createElement("canvas"); time = 0;
  Object.defineProperties(video, {
    videoWidth: { value: 320, configurable: true }, videoHeight: { value: 180, configurable: true }, duration: { value: 3, configurable: true },
    src: { set: () => queueMicrotask(() => video.dispatchEvent(new Event("loadeddata"))), configurable: true },
    currentTime: { get: () => time, set: value => { time = value; queueMicrotask(() => video.dispatchEvent(new Event("seeked"))); }, configurable: true },
  });
  video.pause = pause; video.load = load;
  vi.spyOn(canvas, "getContext").mockReturnValue({ drawImage: draw } as unknown as CanvasRenderingContext2D);
  vi.spyOn(canvas, "toBlob").mockImplementation(callback => callback(new Blob(["png"], { type: "image/png" })));
  const create = document.createElement.bind(document);
  vi.spyOn(document, "createElement").mockImplementation(((tag: string) => tag === "video" ? video : tag === "canvas" ? canvas : create(tag)) as typeof document.createElement);
  vi.stubGlobal("fetch", vi.fn(async () => new Response("video", { headers: { "content-type": "video/mp4" } })));
  vi.stubGlobal("URL", Object.assign(URL, { createObjectURL: vi.fn(() => "blob:owned"), revokeObjectURL: revoke }));
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.clearAllMocks(); });
it.each([["first", 0], [1.25, 1.25], ["last", 2.999999]] as const)("captures %s from authenticated source at full size and releases resources", async (position, expected) => {
  const { file, timestampMs } = await captureSpaceVideoFrame(asset, position, new AbortController().signal);
  expect(timestampMs).toBe(Math.floor(expected * 1000));
  expect(fetch).toHaveBeenCalledWith("/api/media-assets/video/content", expect.objectContaining({ credentials: "same-origin", signal: expect.any(AbortSignal) }));
  expect(time).toBeCloseTo(expected, 7); expect(draw).toHaveBeenCalledWith(video, 0, 0, 320, 180);
  expect(file.type).toBe("image/png"); expect(file.size).toBe(3);
  expect(revoke).toHaveBeenCalledWith("blob:owned"); expect(pause).toHaveBeenCalled(); expect(load).toHaveBeenCalled();
  expect(canvas.width).toBe(0); expect(canvas.height).toBe(0);
});
it("rejects invalid sources, timestamps and decoded dimensions before allocating a full-size image", async () => {
  for (const patch of [{ bytes: "NaN" }, { bytes: "-1" }, { bytes: String(500 * 1024 * 1024 + 1) }, { type: "audio" as const }])
    await expect(captureSpaceVideoFrame({ ...asset, ...patch }, "first", new AbortController().signal)).rejects.toThrow("SOURCE_INVALID");
  await expect(captureSpaceVideoFrame(asset, NaN, new AbortController().signal)).rejects.toThrow("SOURCE_INVALID");
  expect(fetch).not.toHaveBeenCalled();
  Object.defineProperty(video, "videoWidth", { value: 9000 });
  await expect(captureSpaceVideoFrame(asset, "first", new AbortController().signal)).rejects.toThrow("METADATA_INVALID");
  expect(draw).not.toHaveBeenCalled(); expect(revoke).toHaveBeenCalledWith("blob:owned");
});
it("cancels a pending decode, releasing URLs and leaving no encoded result", async () => {
  Object.defineProperty(video, "src", { set: () => {}, configurable: true });
  const abort = new AbortController(), result = captureSpaceVideoFrame(asset, "last", abort.signal);
  await vi.waitFor(() => expect(URL.createObjectURL).toHaveBeenCalled());
  abort.abort(); await expect(result).rejects.toThrow(); expect(revoke).toHaveBeenCalledWith("blob:owned"); expect(draw).not.toHaveBeenCalled();
});
it("bounds concurrent captures, rejects excess queue entries and releases cancelled work", async () => {
  const signals: AbortSignal[] = [];
  vi.mocked(fetch).mockImplementation((_url, options) => new Promise((_resolve, reject) => {
    const signal = options!.signal!; signals.push(signal); signal.addEventListener("abort", () => reject(signal.reason), { once: true });
  }));
  const controllers = Array.from({ length: 19 }, () => new AbortController());
  const results = controllers.map(controller => captureSpaceVideoFrame(asset, "first", controller.signal));
  const settled = Promise.allSettled(results);
  await vi.waitFor(() => expect(signals).toHaveLength(2));
  controllers.forEach(controller => controller.abort());
  const values = await settled; expect(values.every(value => value.status === "rejected")).toBe(true);
  expect(values[18]).toMatchObject({ status: "rejected", reason: expect.objectContaining({ message: "VIDEO_CAPTURE_BUSY" }) });
});
