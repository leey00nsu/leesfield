import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import messages from "@/shared/i18n/messages/en.json";
import type { MediaAssetDto } from "@/shared/media-assets/media-asset-contract";
import { SpaceMediaPreview } from "./space-media-preview";

class VisibilityObserver {
  static instances: VisibilityObserver[] = [];
  disconnect = vi.fn();
  observe = vi.fn();
  constructor(private callback: IntersectionObserverCallback) { VisibilityObserver.instances.push(this); }
  emit(isIntersecting: boolean) { this.callback([{ isIntersecting } as IntersectionObserverEntry], this as unknown as IntersectionObserver); }
}
class SizeObserver {
  static instances: SizeObserver[] = [];
  disconnect = vi.fn();
  observe = vi.fn();
  constructor(private callback: ResizeObserverCallback) { SizeObserver.instances.push(this); }
  emit(width: number) { this.callback([{ contentRect: { width } } as ResizeObserverEntry], this as unknown as ResizeObserver); }
}
const decode = vi.fn(), close = vi.fn();
class FakeAudioContext {
  state = "running";
  decodeAudioData = decode;
  close() { this.state = "closed"; close(); return Promise.resolve(); }
}
function audioBuffer(duration = 65) {
  return { duration, numberOfChannels: 1, getChannelData: () => Float32Array.from([0, 0.3, -0.8, 1, -0.2, 0.5]) } as unknown as AudioBuffer;
}
function response() { return { ok: true, headers: new Headers(), body: null, arrayBuffer: () => Promise.resolve(new ArrayBuffer(4)) } as unknown as Response; }
let serial = 0;
function asset(type: MediaAssetDto["type"], extra: Partial<MediaAssetDto> = {}): MediaAssetDto {
  const id = `preview-${++serial}`;
  return { id, version: 1, type, status: "completed", origin: "upload", mimeType: type === "image" ? "image/jpeg" : `${type}/mp4`,
    bytes: "4", width: type === "audio" ? null : 1280, height: type === "audio" ? null : 720, durationMs: type === "image" ? null : 65_000,
    sourceOperationId: null, url: `https://media.example/${id}`, createdAt: "2026-10-20T00:00:00.000Z", updatedAt: "2026-10-20T00:00:00.000Z", ...extra };
}
function mount(children: ReactNode) {
  const wrapper = ({ children }: { children: ReactNode }) => <NextIntlClientProvider locale="en" messages={messages}>{children}</NextIntlClientProvider>;
  return render(children, { wrapper });
}
function loadImage(image: HTMLElement, width = 2048, height = 1024) {
  Object.defineProperties(image, { naturalWidth: { configurable: true, value: width }, naturalHeight: { configurable: true, value: height } });
  fireEvent.load(image);
}
function thumbnailCanvas() {
  const draw = vi.fn(), sizes: number[][] = [], canvases: HTMLCanvasElement[] = [];
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({ drawImage: draw } as unknown as CanvasRenderingContext2D);
  const encode = vi.spyOn(HTMLCanvasElement.prototype, "toDataURL").mockImplementation(function (this: HTMLCanvasElement) {
    sizes.push([this.width, this.height]); canvases.push(this);
    return "data:image/jpeg;base64,dGh1bWJuYWls";
  });
  return { draw, encode, sizes, canvases };
}
function taintedThumbnailCanvas() {
  const canvas = thumbnailCanvas();
  canvas.draw.mockImplementation(image => {
    if (image instanceof HTMLImageElement) throw new DOMException("Tainted canvas", "SecurityError");
  });
  return canvas;
}
function imageContentResponse(extra: Partial<Response> = {}) {
  return { ok: true, headers: new Headers({ "content-type": "image/jpeg" }), body: null,
    arrayBuffer: () => Promise.resolve(new ArrayBuffer(4)), ...extra } as Response;
}
function imageBitmap(width = 512, height = 384) {
  return { width, height, close: vi.fn() } as unknown as ImageBitmap;
}
beforeEach(() => {
  VisibilityObserver.instances = []; SizeObserver.instances = [];
  vi.stubGlobal("IntersectionObserver", VisibilityObserver);
  vi.stubGlobal("ResizeObserver", SizeObserver);
  vi.stubGlobal("AudioContext", FakeAudioContext);
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response()));
  decode.mockReset().mockResolvedValue(audioBuffer()); close.mockClear();
  vi.spyOn(HTMLMediaElement.prototype, "play").mockImplementation(function (this: HTMLMediaElement) {
    Object.defineProperty(this, "paused", { configurable: true, value: false });
    this.dispatchEvent(new Event("play")); return Promise.resolve();
  });
  vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(function (this: HTMLMediaElement) {
    if (this.paused) return;
    Object.defineProperty(this, "paused", { configurable: true, value: true });
    this.dispatchEvent(new Event("pause"));
  });
  vi.spyOn(HTMLMediaElement.prototype, "load").mockImplementation(() => {});
});
afterEach(async () => {
  cleanup();
  await act(async () => {});
  vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals();
  Object.defineProperty(document, "fullscreenElement", { configurable: true, value: null });
});

describe("SpaceMediaPreview images", () => {
  it.each(["image", "video", "audio"] as const)("opens the original %s in detail through a button and isolates canvas events", async type => {
    const source = asset(type), open = vi.fn(), canvasClick = vi.fn(), canvasKey = vi.fn(), canvasPointer = vi.fn();
    const { container } = mount(<div onClick={canvasClick} onKeyDown={canvasKey} onPointerDown={canvasPointer}>
      <SpaceMediaPreview asset={source} active onOpen={open} />
    </div>);
    const button = screen.getByRole("button", { name: "View details" });
    expect(screen.queryByRole("link", { name: "Open" })).not.toBeInTheDocument();
    expect(button).not.toHaveAttribute("href"); expect(button).not.toHaveAttribute("target");
    fireEvent.pointerDown(button); fireEvent.keyDown(button, { key: "Enter" }); fireEvent.click(button);
    expect(open).toHaveBeenCalledExactlyOnceWith(source, button, expect.any(Function));
    expect(container.querySelector("[data-space-media-preview]")).toHaveAttribute("data-active", "false");
    await act(async () => open.mock.calls[0][2]());
    expect(container.querySelector("[data-space-media-preview]")).toHaveAttribute("data-active", "true");
    expect(canvasClick).not.toHaveBeenCalled(); expect(canvasKey).not.toHaveBeenCalled(); expect(canvasPointer).not.toHaveBeenCalled();
    const media = container.querySelector<HTMLMediaElement>("audio,video");
    if (media) expect(media.paused).toBe(true);
  });

  it("changes image fit without replacing the source or changing original-file downloads, and leaves video fit alone", () => {
    const source = asset("image"), download = vi.fn();
    const { rerender } = mount(<SpaceMediaPreview asset={source} active onDownload={download} />);
    const image = screen.getByRole("img");
    expect(image).toHaveStyle({ objectFit: "cover" });
    rerender(<SpaceMediaPreview asset={source} active imageFit="contain" onDownload={download} />);
    expect(screen.getByRole("img")).toBe(image);
    expect(image).toHaveStyle({ objectFit: "contain" });
    expect(image).toHaveAttribute("src", source.url);
    fireEvent.click(screen.getByRole("button", { name: "Download image" }));
    expect(download).toHaveBeenCalledExactlyOnceWith(source);
    expect(screen.getByRole("button", { name: "View details" })).not.toHaveAttribute("href");
    expect(fetch).not.toHaveBeenCalled();
    rerender(<SpaceMediaPreview asset={asset("video")} active={false} imageFit="contain" />);
    expect((screen.getByLabelText("Video preview") as HTMLVideoElement).style.objectFit).toBe("");
  });

  it("uses original images at large zoom, stored thumbnails below 200px, and original download controls", () => {
    const source = asset("image", { originalFileName: "photo.jpg", imageVariants: { version: 1, isAnimated: false,
      display: { url: "https://media.example/display.webp", width: 800, height: 450, mimeType: "image/webp", bytes: 10 },
      thumbnail: { url: "https://media.example/thumbnail.webp", width: 200, height: 112, mimeType: "image/webp", bytes: 5 } } });
    const dimensions = vi.fn();
    const { rerender, unmount } = mount(<SpaceMediaPreview asset={source} active zoom={1} onLoadedDimensions={dimensions} />);
    const image = screen.getByRole("img");
    expect(image).toHaveAttribute("src", source.url);
    fireEvent.load(image);
    expect(dimensions).toHaveBeenCalledExactlyOnceWith({ width: 1280, height: 720 });
    expect(screen.getByRole("link", { name: "Download image" })).toHaveAttribute("href", `/api/media-assets/${source.id}/download`);
    expect(screen.getByRole("link", { name: "Download image" })).toHaveAttribute("download", "photo.jpg");
    expect(screen.getByRole("button", { name: "View details" })).not.toHaveAttribute("href");
    act(() => SizeObserver.instances[0].emit(400));
    rerender(<SpaceMediaPreview asset={source} active zoom={0.5} />);
    expect(screen.getByRole("img")).toHaveAttribute("src", source.url);
    act(() => SizeObserver.instances[0].emit(399));
    expect(screen.getByRole("img")).toHaveAttribute("src", "https://media.example/thumbnail.webp");
    fireEvent.error(screen.getByRole("img"));
    expect(screen.getByRole("img")).toHaveAttribute("src", "https://media.example/display.webp");
    fireEvent.error(screen.getByRole("img"));
    expect(screen.getByRole("img")).toHaveAttribute("src", source.url);
    const next = { ...source, version: 2, imageVariants: { ...source.imageVariants!, thumbnail: { ...source.imageVariants!.thumbnail!, url: "https://media.example/new.webp" } } };
    rerender(<SpaceMediaPreview asset={next} active zoom={0.5} />);
    expect(screen.getByRole("img")).toHaveAttribute("src", "https://media.example/new.webp");
    unmount(); expect(SizeObserver.instances.every(observer => observer.disconnect.mock.calls.length)).toBe(true);
  });

  it("shares a bounded local preview from the loaded original only when zoom needs it, retaining original dimensions", async () => {
    vi.useFakeTimers();
    const canvas = thumbnailCanvas(), dimensions = vi.fn(), source = asset("image", { width: null, height: null });
    const { rerender } = mount(<SpaceMediaPreview asset={source} active onLoadedDimensions={dimensions} />);
    const original = screen.getByRole("img");
    loadImage(original);
    act(() => vi.runOnlyPendingTimers());
    expect(canvas.encode).not.toHaveBeenCalled();
    rerender(<SpaceMediaPreview asset={source} active zoom={0.5} onLoadedDimensions={dimensions} />);
    await act(async () => { vi.runOnlyPendingTimers(); });
    const thumbnail = screen.getByRole("img").getAttribute("src");
    expect(thumbnail).not.toBe(source.url);
    expect(canvas.draw.mock.calls[0][0]).toBe(original);
    expect(canvas.sizes).toEqual([[256, 128]]);
    expect(canvas.canvases.every(item => item.width === 0 && item.height === 0)).toBe(true);
    loadImage(screen.getByRole("img"), 256, 128);
    expect(dimensions).toHaveBeenLastCalledWith({ width: 2048, height: 1024 });
    expect(fetch).not.toHaveBeenCalled();
    expect(screen.getByRole("link", { name: "Download image" })).toHaveAttribute("href", `/api/media-assets/${source.id}/download`);
    expect(screen.getByRole("button", { name: "View details" })).not.toHaveAttribute("href");
    rerender(<SpaceMediaPreview asset={source} active />);
    expect(screen.getByRole("img")).toHaveAttribute("src", source.url);
    rerender(<><SpaceMediaPreview asset={source} active zoom={0.5} onLoadedDimensions={dimensions} /><SpaceMediaPreview asset={source} active zoom={0.5} onLoadedDimensions={dimensions} /></>);
    expect(screen.getAllByRole("img").every(image => image.getAttribute("src") === thumbnail)).toBe(true);
    loadImage(screen.getAllByRole("img")[1], 256, 128);
    expect(dimensions).toHaveBeenLastCalledWith({ width: 2048, height: 1024 });
    expect(canvas.encode).toHaveBeenCalledOnce();
    const replaced = { ...source, version: 2, url: `${source.url}-replaced` };
    rerender(<SpaceMediaPreview asset={replaced} active zoom={0.5} />);
    expect(screen.getByRole("img")).toHaveAttribute("src", replaced.url);
  });

  it("starts no local preview work offscreen and cancels queued work on visibility, zoom, source change, and unmount", () => {
    vi.useFakeTimers();
    const canvas = thumbnailCanvas(), source = asset("image");
    const { rerender, unmount } = mount(<SpaceMediaPreview asset={source} zoom={0.5} />);
    loadImage(screen.getByRole("img"));
    act(() => vi.runOnlyPendingTimers());
    expect(canvas.draw).not.toHaveBeenCalled();
    const observer = VisibilityObserver.instances[0];
    act(() => observer.emit(true));
    act(() => observer.emit(false));
    act(() => vi.runOnlyPendingTimers());
    expect(canvas.draw).not.toHaveBeenCalled();
    act(() => observer.emit(true));
    rerender(<SpaceMediaPreview asset={source} zoom={1} />);
    act(() => vi.runOnlyPendingTimers());
    expect(canvas.draw).not.toHaveBeenCalled();
    rerender(<SpaceMediaPreview asset={source} zoom={0.5} />);
    const replaced = asset("image");
    rerender(<SpaceMediaPreview asset={replaced} active zoom={0.5} />);
    act(() => vi.runOnlyPendingTimers());
    expect(screen.getByRole("img")).toHaveAttribute("src", replaced.url);
    expect(canvas.draw).not.toHaveBeenCalled();
    loadImage(screen.getByRole("img"));
    unmount();
    act(() => vi.runOnlyPendingTimers());
    expect(canvas.draw).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("retains the original when both readback and owned content fail, without repeatedly retrying", async () => {
    vi.useFakeTimers();
    const canvas = thumbnailCanvas(), source = asset("image");
    vi.stubGlobal("createImageBitmap", vi.fn());
    canvas.encode.mockImplementation(function (this: HTMLCanvasElement) {
      canvas.canvases.push(this);
      throw new DOMException("Tainted canvas", "SecurityError");
    });
    const { rerender } = mount(<SpaceMediaPreview asset={source} active zoom={0.5} />);
    loadImage(screen.getByRole("img"));
    await act(async () => { vi.advanceTimersByTime(0); });
    expect(screen.getByRole("img")).toHaveAttribute("src", source.url);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(canvas.canvases.every(item => item.width === 0 && item.height === 0)).toBe(true);
    rerender(<SpaceMediaPreview asset={source} active />);
    rerender(<SpaceMediaPreview asset={source} active zoom={0.5} />);
    loadImage(screen.getByRole("img"));
    act(() => vi.runOnlyPendingTimers());
    expect(canvas.encode).toHaveBeenCalledOnce();
    expect(fetch).toHaveBeenCalledExactlyOnceWith(`/api/media-assets/${source.id}/content`, expect.objectContaining({ signal: expect.any(AbortSignal), credentials: "same-origin" }));
  });

  it("shares an owned thumbnail for tainted CDN images only below 200px, then restores the original at large zoom", async () => {
    vi.useFakeTimers();
    const canvas = taintedThumbnailCanvas(), bitmap = imageBitmap(), source = asset("image", { width: 512, height: 384 });
    vi.stubGlobal("createImageBitmap", vi.fn().mockResolvedValue(bitmap));
    vi.mocked(fetch).mockResolvedValue(imageContentResponse());
    const previews = (active: boolean, zoom = 0.65) => <><SpaceMediaPreview asset={source} active={active} zoom={zoom} /><SpaceMediaPreview asset={source} active={active} zoom={zoom} /></>;
    const { rerender } = mount(previews(false));
    screen.getAllByRole("img").forEach(image => { expect(image).not.toHaveAttribute("crossorigin"); loadImage(image, 512, 384); });
    act(() => SizeObserver.instances.forEach(observer => observer.emit(300)));
    await act(async () => { vi.advanceTimersByTime(0); });
    expect(fetch).not.toHaveBeenCalled();
    rerender(previews(true));
    await act(async () => { vi.advanceTimersByTime(0); });
    expect(fetch).toHaveBeenCalledExactlyOnceWith(`/api/media-assets/${source.id}/content`, expect.objectContaining({ signal: expect.any(AbortSignal), credentials: "same-origin" }));
    expect(createImageBitmap).toHaveBeenCalledOnce();
    expect(bitmap.close).toHaveBeenCalledOnce();
    expect(canvas.encode).toHaveBeenCalledOnce();
    expect(canvas.sizes).toEqual([[256, 192]]);
    expect(canvas.canvases.every(item => item.width === 0 && item.height === 0)).toBe(true);
    const thumbnail = screen.getAllByRole("img")[0].getAttribute("src");
    expect(thumbnail).not.toBe(source.url);
    expect(screen.getAllByRole("img").every(image => image.getAttribute("src") === thumbnail)).toBe(true);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: "Download image" }).every(link => link.getAttribute("href") === `/api/media-assets/${source.id}/download`)).toBe(true);
    rerender(previews(true, 1));
    expect(screen.getAllByRole("img").every(image => image.getAttribute("src") === source.url)).toBe(true);
    rerender(previews(true));
    expect(screen.getAllByRole("img").every(image => image.getAttribute("src") === thumbnail)).toBe(true);
    expect(fetch).toHaveBeenCalledOnce();
  });

  it("keeps shared work until the last consumer deactivates, closes a late bitmap, and ignores its result", async () => {
    vi.useFakeTimers();
    const canvas = taintedThumbnailCanvas(), bitmap = imageBitmap(), source = asset("image");
    let finishDecode!: (bitmap: ImageBitmap) => void;
    vi.stubGlobal("createImageBitmap", vi.fn().mockImplementation(() => new Promise<ImageBitmap>(resolve => { finishDecode = resolve; })));
    vi.mocked(fetch).mockResolvedValue(imageContentResponse());
    const previews = (first: boolean, second: boolean) => <><SpaceMediaPreview asset={source} active={first} zoom={0.5} /><SpaceMediaPreview asset={source} active={second} zoom={0.5} /></>;
    const { rerender } = mount(previews(true, true));
    screen.getAllByRole("img").forEach(image => loadImage(image));
    await act(async () => { vi.advanceTimersByTime(0); });
    expect(createImageBitmap).toHaveBeenCalledOnce();
    const signal = vi.mocked(fetch).mock.calls[0][1]!.signal!;
    rerender(previews(false, true));
    expect(signal.aborted).toBe(false);
    rerender(previews(false, false));
    expect(signal.aborted).toBe(true);
    await act(async () => { finishDecode(bitmap); });
    expect(bitmap.close).toHaveBeenCalledOnce();
    expect(canvas.encode).not.toHaveBeenCalled();
    expect(screen.getAllByRole("img").every(image => image.getAttribute("src") === source.url)).toBe(true);
  });

  it("cancels an oversized owned stream before bitmap decode", async () => {
    vi.useFakeTimers();
    taintedThumbnailCanvas();
    const cancel = vi.fn(), source = asset("image");
    const body = new ReadableStream<Uint8Array<ArrayBuffer>>({ start(controller) { controller.enqueue(new Uint8Array(16 * 1024 * 1024 + 1)); }, cancel });
    vi.stubGlobal("createImageBitmap", vi.fn());
    vi.mocked(fetch).mockResolvedValue(imageContentResponse({ body }));
    mount(<SpaceMediaPreview asset={source} active zoom={0.5} />);
    loadImage(screen.getByRole("img"));
    await act(async () => { vi.advanceTimersByTime(0); });
    expect(cancel).toHaveBeenCalledOnce();
    expect(createImageBitmap).not.toHaveBeenCalled();
    expect(screen.getByRole("img")).toHaveAttribute("src", source.url);
  });

  it("aborts an owned request at its deadline and retains the original", async () => {
    vi.useFakeTimers();
    taintedThumbnailCanvas();
    const source = asset("image");
    vi.stubGlobal("createImageBitmap", vi.fn());
    vi.mocked(fetch).mockImplementation((_url, options) => new Promise((_resolve, reject) => {
      options?.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true });
    }));
    mount(<SpaceMediaPreview asset={source} active zoom={0.5} />);
    loadImage(screen.getByRole("img"));
    await act(async () => { vi.advanceTimersByTime(0); });
    const signal = vi.mocked(fetch).mock.calls[0][1]!.signal!;
    act(() => vi.advanceTimersByTime(14_999));
    expect(signal.aborted).toBe(false);
    await act(async () => { vi.advanceTimersByTime(1); });
    expect(signal.aborted).toBe(true);
    expect(createImageBitmap).not.toHaveBeenCalled();
    expect(screen.getByRole("img")).toHaveAttribute("src", source.url);
  });

  it("rejects excessive source pixels and closes oversized decoded bitmaps", async () => {
    vi.useFakeTimers();
    const canvas = taintedThumbnailCanvas(), bitmap = imageBitmap(5000, 5000), source = asset("image");
    vi.stubGlobal("createImageBitmap", vi.fn().mockResolvedValue(bitmap));
    vi.mocked(fetch).mockResolvedValue(imageContentResponse());
    const { rerender } = mount(<SpaceMediaPreview asset={source} active zoom={0.5} />);
    loadImage(screen.getByRole("img"), 5000, 5000);
    await act(async () => { vi.advanceTimersByTime(0); });
    expect(fetch).not.toHaveBeenCalled();
    rerender(<SpaceMediaPreview asset={asset("image")} active zoom={0.5} />);
    loadImage(screen.getByRole("img"), 512, 384);
    await act(async () => { vi.advanceTimersByTime(0); });
    expect(bitmap.close).toHaveBeenCalledOnce();
    expect(canvas.encode).not.toHaveBeenCalled();
  });

  it("preserves explicit download callbacks and detail controls", () => {
    const source = asset("image"), download = vi.fn();
    mount(<SpaceMediaPreview asset={source} active onDownload={download} />);
    fireEvent.click(screen.getByRole("button", { name: "Download image" }));
    expect(download).toHaveBeenCalledExactlyOnceWith(source);
    expect(screen.getByRole("button", { name: "View details" })).not.toHaveAttribute("target");
  });
});

describe("SpaceMediaPreview video policy", () => {
  it("limits fullscreen/PiP controls only when requested without replacing the media or changing its playback and detail actions", async () => {
    const source = asset("video");
    const { rerender } = mount(<SpaceMediaPreview asset={source} active selected />);
    const video = screen.getByLabelText("Video preview") as HTMLVideoElement;
    await act(async () => {});
    expect(video.controls).toBe(false);
    expect(screen.getByRole("button", { name: "Pause" })).toBeInTheDocument();
    expect(video).not.toHaveAttribute("controlslist");
    expect(video).not.toHaveAttribute("disablepictureinpicture");
    video.currentTime = 18;
    rerender(<SpaceMediaPreview asset={source} active selected videoInlineOnly />);
    expect(screen.getByLabelText("Video preview")).toBe(video);
    expect(video).toHaveAttribute("controlslist", "nofullscreen");
    expect(video).toHaveAttribute("disablepictureinpicture");
    expect(video.controls).toBe(false); expect(video.paused).toBe(false); expect(video.currentTime).toBe(18);
    expect(video).toHaveAttribute("src", source.url);
    expect(screen.getByRole("button", { name: "View details" })).not.toHaveAttribute("href");
    expect(screen.getByRole("button", { name: "View details" })).not.toHaveAttribute("target");
    expect(screen.getByRole("link", { name: "Download video" })).toHaveAttribute("href", `/api/media-assets/${source.id}/download`);
    act(() => video.pause());
    rerender(<SpaceMediaPreview asset={source} active selected />);
    expect(video).not.toHaveAttribute("controlslist");
    expect(video).not.toHaveAttribute("disablepictureinpicture");
    expect(video.paused).toBe(true); expect(video.currentTime).toBe(18);
  });

  it("waits 300ms for hover, plays selection immediately, and resumes at the same time after automatic pause", async () => {
    vi.useFakeTimers();
    const source = asset("video");
    const { rerender } = mount(<SpaceMediaPreview asset={source} active />);
    const video = screen.getByLabelText("Video preview") as HTMLVideoElement;
    expect(video).toHaveAttribute("src", source.url); expect(video.play).not.toHaveBeenCalled();
    rerender(<SpaceMediaPreview asset={source} active hovered />);
    act(() => vi.advanceTimersByTime(299)); expect(video.play).not.toHaveBeenCalled();
    await act(async () => { vi.advanceTimersByTime(1); }); expect(video.play).toHaveBeenCalledOnce();
    video.currentTime = 12.5;
    rerender(<SpaceMediaPreview asset={source} active />);
    expect(video.paused).toBe(true); expect(video.currentTime).toBe(12.5);
    rerender(<SpaceMediaPreview asset={source} active selected />);
    expect(video.play).toHaveBeenCalledTimes(2); expect(video.currentTime).toBe(12.5);
    await act(async () => {});
  });

  it("keeps manual pause through loadeddata/hover/selection until explicit play or source replacement", async () => {
    vi.useFakeTimers();
    const source = asset("video");
    const { rerender, unmount } = mount(<SpaceMediaPreview asset={source} active hovered />);
    const video = screen.getByLabelText("Video preview") as HTMLVideoElement;
    await act(async () => { vi.advanceTimersByTime(300); });
    act(() => video.pause());
    rerender(<SpaceMediaPreview asset={source} active selected />);
    fireEvent.loadedData(video);
    await act(async () => { vi.advanceTimersByTime(500); });
    expect(video.play).toHaveBeenCalledOnce();
    await act(async () => { await video.play(); });
    rerender(<SpaceMediaPreview asset={source} active />);
    rerender(<SpaceMediaPreview asset={source} active hovered />);
    await act(async () => { vi.advanceTimersByTime(300); });
    expect(video.play).toHaveBeenCalledTimes(3);
    const next = asset("video");
    rerender(<SpaceMediaPreview asset={next} active selected />);
    const replacement = screen.getByLabelText("Video preview");
    expect(replacement).not.toBe(video); expect(replacement).toHaveAttribute("src", next.url);
    expect(video).not.toHaveAttribute("src"); expect(video.paused).toBe(true);
    const count = vi.mocked(video.play).mock.calls.length;
    fireEvent.loadedData(video); act(() => vi.advanceTimersByTime(500));
    expect(video.play).toHaveBeenCalledTimes(count);
    unmount(); expect(replacement).not.toHaveAttribute("src");
    expect(HTMLMediaElement.prototype.load).toHaveBeenCalledTimes(2);
    await act(async () => {});
  });

  it("cancels hover timers on leave and observes inactive sources without unmounting the video", async () => {
    vi.useFakeTimers();
    const source = asset("video");
    const { rerender, unmount } = mount(<SpaceMediaPreview asset={source} hovered />);
    const video = screen.getByLabelText("Video preview");
    const observer = VisibilityObserver.instances[0];
    expect(video).not.toHaveAttribute("src");
    act(() => observer.emit(true));
    expect(video).toHaveAttribute("src", source.url);
    act(() => vi.advanceTimersByTime(200));
    rerender(<SpaceMediaPreview asset={source} />);
    act(() => vi.advanceTimersByTime(200)); expect(HTMLMediaElement.prototype.play).not.toHaveBeenCalled();
    rerender(<SpaceMediaPreview asset={source} selected />);
    await act(async () => {}); expect(HTMLMediaElement.prototype.play).toHaveBeenCalledOnce();
    act(() => observer.emit(false));
    expect(video).toBeInTheDocument(); expect((video as HTMLVideoElement).paused).toBe(true);
    unmount(); expect(observer.disconnect).toHaveBeenCalledOnce();
    act(() => observer.emit(true));
    expect(video).not.toHaveAttribute("src");
  });

  it("honors fullscreen until exit and applies selection again when decoded data arrives", async () => {
    const source = asset("video"), dimensions = vi.fn();
    const { rerender } = mount(<SpaceMediaPreview asset={source} active selected onLoadedDimensions={dimensions} />);
    const video = screen.getByLabelText("Video preview") as HTMLVideoElement;
    await act(async () => {});
    Object.defineProperty(video, "videoWidth", { configurable: true, value: 1920 });
    Object.defineProperty(video, "videoHeight", { configurable: true, value: 1080 });
    fireEvent.loadedMetadata(video); expect(dimensions).toHaveBeenCalledWith({ width: 1920, height: 1080 });
    Object.defineProperty(document, "fullscreenElement", { configurable: true, value: video });
    video.currentTime = 20;
    rerender(<SpaceMediaPreview asset={source} active={false} />);
    expect(video.paused).toBe(false);
    Object.defineProperty(document, "fullscreenElement", { configurable: true, value: null });
    fireEvent(document, new Event("fullscreenchange"));
    expect(video.paused).toBe(true); expect(video.currentTime).toBe(20);
    rerender(<SpaceMediaPreview asset={source} active selected />);
    await act(async () => {});
    Object.defineProperty(video, "paused", { configurable: true, value: true });
    fireEvent.loadedData(video);
    expect(video.paused).toBe(false);
  });

  it("does not let a late play promise from the preceding policy pause a newer selection", async () => {
    const source = asset("video");
    let resolvePlay!: () => void;
    vi.mocked(HTMLMediaElement.prototype.play).mockImplementationOnce(function (this: HTMLMediaElement) {
      return new Promise<void>(resolve => { resolvePlay = () => { Object.defineProperty(this, "paused", { configurable: true, value: false }); resolve(); }; });
    });
    const { rerender } = mount(<SpaceMediaPreview asset={source} active selected />);
    rerender(<SpaceMediaPreview asset={source} active hovered selected />);
    await act(async () => { resolvePlay(); });
    expect((screen.getByLabelText("Video preview") as HTMLVideoElement).paused).toBe(false);
  });
});

describe("SpaceMediaPreview audio", () => {
  it("applies speed, volume, and mute before metadata and keeps them through deferred source assignment, playback, and source replacement", async () => {
    const user = userEvent.setup(), source = asset("audio");
    const { container, rerender } = mount(<SpaceMediaPreview asset={source} active={false} />);
    const audio = container.querySelector("audio")!;
    expect(audio).not.toHaveAttribute("src");
    await user.click(screen.getByRole("button", { name: "Playback speed: 1×" }));
    expect(screen.getByRole("dialog", { name: "Playback speed" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "1×" })).toHaveAttribute("aria-checked", "true");
    await user.click(screen.getByRole("radio", { name: "1.5×" }));
    expect(audio.playbackRate).toBe(1.5);
    expect(audio.defaultPlaybackRate).toBe(1.5);
    await waitFor(() => expect(screen.getByRole("button", { name: "Playback speed: 1.5×" })).toHaveFocus());

    await user.click(screen.getByRole("button", { name: "Volume" }));
    const volume = screen.getByRole("slider", { name: "Volume" });
    fireEvent.keyDown(volume, { key: "Home" });
    expect(audio.volume).toBe(0); expect(audio.muted).toBe(true);
    fireEvent.keyDown(volume, { key: "End" });
    fireEvent.keyDown(volume, { key: "ArrowLeft" });
    expect(audio.volume).toBe(0.99); expect(audio.muted).toBe(false);
    expect(volume).toHaveAttribute("aria-valuenow", "99");
    expect(screen.getByText("99%")).toBeInTheDocument();
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Volume" })).not.toBeInTheDocument());
    expect(screen.getByRole("button", { name: "Volume" })).toHaveFocus();
    await user.click(screen.getByRole("button", { name: "Mute" }));
    expect(audio.muted).toBe(true); expect(audio.volume).toBe(0.99);
    expect(screen.getByRole("button", { name: "Unmute" })).toHaveAttribute("aria-pressed", "true");
    await user.click(screen.getByRole("button", { name: "Unmute" }));
    expect(audio.muted).toBe(false); expect(audio.volume).toBe(0.99);
    await user.click(screen.getByRole("button", { name: "Mute" }));
    expect(audio).not.toHaveAttribute("src");
    expect(audio.play).not.toHaveBeenCalled(); expect(fetch).not.toHaveBeenCalled();

    rerender(<SpaceMediaPreview asset={source} active />);
    expect(container.querySelector("audio")).toBe(audio);
    expect(audio).toHaveAttribute("src", source.url);
    expect(audio.playbackRate).toBe(1.5); expect(audio.defaultPlaybackRate).toBe(1.5);
    expect(audio.volume).toBe(0.99); expect(audio.muted).toBe(true);
    // Source-loading events must reapply the chosen controls rather than trust
    // browser defaults or wait for the first play click.
    audio.playbackRate = 1; audio.volume = 1; audio.muted = false;
    Object.defineProperty(audio, "duration", { configurable: true, value: 65 });
    fireEvent.loadedMetadata(audio);
    expect(audio.playbackRate).toBe(1.5); expect(audio.defaultPlaybackRate).toBe(1.5);
    expect(audio.volume).toBe(0.99); expect(audio.muted).toBe(true);
    await user.click(screen.getByRole("button", { name: "Play" }));
    expect(audio.paused).toBe(false);
    expect(audio.playbackRate).toBe(1.5); expect(audio.volume).toBe(0.99); expect(audio.muted).toBe(true);
    expect(screen.getByRole("link", { name: "Download audio" })).toHaveAttribute("href", `/api/media-assets/${source.id}/download`);
    expect(screen.getByRole("button", { name: "View details" })).not.toHaveAttribute("href");
    const next = { ...source, version: 2, url: `${source.url}-replaced`, durationMs: 10_000 };
    rerender(<SpaceMediaPreview asset={next} active={false} />);
    const replaced = container.querySelector("audio")!;
    expect(replaced).not.toBe(audio); expect(audio).not.toHaveAttribute("src"); expect(audio.paused).toBe(true);
    expect(replaced).not.toHaveAttribute("src"); expect(replaced.currentTime).toBe(0);
    expect(replaced.playbackRate).toBe(1.5); expect(replaced.defaultPlaybackRate).toBe(1.5);
    expect(replaced.volume).toBe(0.99); expect(replaced.muted).toBe(true);
    expect(screen.getByText("0:00 / 0:10")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Play" }));
    expect(replaced).toHaveAttribute("src", next.url); expect(replaced.paused).toBe(false);
    expect(replaced.playbackRate).toBe(1.5); expect(replaced.volume).toBe(0.99); expect(replaced.muted).toBe(true);
    await act(async () => {});
  });

  it("keeps keyboard seeks pending until metadata and isolates waveform and popover controls from canvas events", async () => {
    const user = userEvent.setup(), source = asset("audio"), key = vi.fn(), pointer = vi.fn(), click = vi.fn();
    const preview = (active: boolean) => <div onKeyDown={key} onPointerDown={pointer} onClick={click}><SpaceMediaPreview asset={source} active={active} /></div>;
    const { container, rerender } = mount(preview(false));
    const audio = container.querySelector("audio")!;
    let hasMetadata = false, currentTime = 0;
    Object.defineProperties(audio, {
      readyState: { configurable: true, get: () => hasMetadata ? 1 : 0 },
      currentTime: { configurable: true, get: () => currentTime, set: (value: number) => {
        if (!hasMetadata) throw new DOMException("No metadata", "InvalidStateError");
        currentTime = value;
      } },
    });
    const seek = screen.getByRole("slider", { name: "Playback position" });
    fireEvent.pointerDown(seek); fireEvent.click(seek);
    expect(fireEvent.keyDown(seek, { key: "ArrowRight" })).toBe(false);
    expect(seek).toHaveAttribute("aria-valuetext", "0:05 / 1:05");
    expect(audio.currentTime).toBe(0);
    fireEvent.keyDown(seek, { key: "End" }); fireEvent.keyDown(seek, { key: "ArrowRight" });
    expect(seek).toHaveAttribute("aria-valuetext", "1:05 / 1:05");
    fireEvent.keyDown(seek, { key: "Home" }); fireEvent.keyDown(seek, { key: "ArrowLeft" });
    expect(seek).toHaveAttribute("aria-valuetext", "0:00 / 1:05");
    fireEvent.change(seek, { target: { value: "32.5" } });
    expect(audio).not.toHaveAttribute("src"); expect(fetch).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Playback speed: 1×" }));
    const normal = screen.getByRole("radio", { name: "1×" });
    act(() => normal.focus()); fireEvent.keyDown(normal, { key: "ArrowRight" });
    expect(audio.playbackRate).toBe(1.25);
    expect(screen.getByRole("radio", { name: "1.25×" })).toHaveFocus();
    fireEvent.keyDown(screen.getByRole("radio", { name: "1.25×" }), { key: "End" });
    expect(audio.playbackRate).toBe(2);
    expect(screen.getByRole("radio", { name: "2×" })).toHaveFocus();
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Playback speed" })).not.toBeInTheDocument());
    expect(screen.getByRole("button", { name: "Playback speed: 2×" })).toHaveFocus();
    await user.click(screen.getByRole("button", { name: "Volume" }));
    fireEvent.keyDown(screen.getByRole("slider", { name: "Volume" }), { key: "ArrowLeft" });
    expect(audio.volume).toBe(0.99);
    await user.keyboard("{Escape}");
    expect(key).not.toHaveBeenCalled(); expect(pointer).not.toHaveBeenCalled(); expect(click).not.toHaveBeenCalled();

    rerender(preview(true));
    hasMetadata = true;
    Object.defineProperty(audio, "duration", { configurable: true, value: 20 });
    fireEvent.loadedMetadata(audio);
    expect(audio.currentTime).toBe(20);
    expect(seek).toHaveAttribute("aria-valuetext", "0:20 / 0:20");
    fireEvent.keyDown(seek, { key: "ArrowLeft" });
    expect(audio.currentTime).toBe(15);
    audio.currentTime = 10; fireEvent.timeUpdate(audio);
    expect(seek).toHaveAttribute("aria-valuetext", "0:10 / 0:20");
    fireEvent.ended(audio);
    expect(audio.currentTime).toBe(0);
    expect(seek).toHaveAttribute("aria-valuetext", "0:00 / 0:20");
    await act(async () => {});
  });

  it("releases a replaced audio source and ignores a late playback rejection", async () => {
    let rejectPlay!: (error: Error) => void;
    vi.mocked(HTMLMediaElement.prototype.play).mockImplementationOnce(() => new Promise((_resolve, reject) => { rejectPlay = reject; }));
    const source = asset("audio"), next = asset("audio", { durationMs: 10_000 });
    const { container, rerender } = mount(<SpaceMediaPreview asset={source} active={false} />);
    const oldAudio = container.querySelector("audio")!;
    fireEvent.click(screen.getByRole("button", { name: "Play" }));
    expect(oldAudio).toHaveAttribute("src", source.url);
    oldAudio.currentTime = 25; fireEvent.timeUpdate(oldAudio);
    rerender(<SpaceMediaPreview asset={next} active={false} />);
    const audio = container.querySelector("audio")!;
    expect(audio).not.toBe(oldAudio);
    expect(oldAudio).not.toHaveAttribute("src");
    expect(oldAudio.load).toHaveBeenCalled();
    await act(async () => { rejectPlay(new Error("Late source failure")); });
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByText("0:00 / 0:10")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Play" }));
    expect(audio).toHaveAttribute("src", next.url);
    expect(audio.paused).toBe(false); expect(audio.currentTime).toBe(0);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("shares one waveform decode, renders play/pause and accessible seek/time, and reuses compact cached peaks", async () => {
    const source = asset("audio");
    const { container, unmount } = mount(<><SpaceMediaPreview asset={source} active /><SpaceMediaPreview asset={source} active /></>);
    await waitFor(() => expect(container.querySelectorAll('[data-space-audio-waveform="ready"]')).toHaveLength(2));
    expect(fetch).toHaveBeenCalledExactlyOnceWith(`/api/media-assets/${source.id}/content`, expect.objectContaining({ signal: expect.any(AbortSignal), credentials: "same-origin" }));
    expect(decode).toHaveBeenCalledOnce(); expect(close).toHaveBeenCalledOnce();
    const audio = container.querySelector("audio")!;
    Object.defineProperty(audio, "duration", { configurable: true, value: 65 }); fireEvent.loadedMetadata(audio);
    fireEvent.click(screen.getAllByRole("button", { name: "Play" })[0]);
    expect(audio.paused).toBe(false);
    expect(screen.getByRole("button", { name: "Pause" })).toBeInTheDocument();
    audio.currentTime = 61; fireEvent.timeUpdate(audio);
    expect(screen.getByText("1:01 / 1:05")).toBeInTheDocument();
    const seek = screen.getAllByRole("slider", { name: "Playback position" })[0];
    fireEvent.change(seek, { target: { value: "32.5" } });
    expect(audio.currentTime).toBe(32.5); expect(seek).toHaveAttribute("aria-valuetext", "0:32 / 1:05");
    fireEvent.click(screen.getByRole("button", { name: "Pause" })); expect(audio.paused).toBe(true);
    unmount(); expect(audio).not.toHaveAttribute("src");
    const cached = mount(<SpaceMediaPreview asset={{ ...source }} active />);
    await waitFor(() => expect(cached.container.querySelector('[data-space-audio-waveform="ready"]')).toBeInTheDocument());
    expect(fetch).toHaveBeenCalledOnce(); expect(decode).toHaveBeenCalledOnce();
  });

  it("does not fetch inactive audio and aborts the source request when the last visible consumer leaves", async () => {
    let signal!: AbortSignal;
    vi.mocked(fetch).mockImplementation((_url, options) => new Promise((_resolve, reject) => {
      signal = options!.signal as AbortSignal;
      signal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true });
    }));
    const source = asset("audio");
    const { container, rerender } = mount(<SpaceMediaPreview asset={source} active={false} />);
    expect(fetch).not.toHaveBeenCalled(); expect(container.querySelector("audio")).not.toHaveAttribute("src");
    rerender(<><SpaceMediaPreview asset={source} active /><SpaceMediaPreview asset={source} active /></>);
    await waitFor(() => expect(fetch).toHaveBeenCalledOnce());
    rerender(<SpaceMediaPreview asset={source} active />);
    expect(signal.aborted).toBe(false);
    rerender(<SpaceMediaPreview asset={source} active={false} />);
    expect(signal.aborted).toBe(true); expect(decode).not.toHaveBeenCalled();
    await act(async () => {});
  });

  it("closes an in-flight decoder on source change, ignores its late result, and resets playback position", async () => {
    let resolveDecode!: (value: AudioBuffer) => void;
    decode.mockImplementationOnce(() => new Promise<AudioBuffer>(resolve => { resolveDecode = resolve; }));
    const source = asset("audio");
    const { container, rerender } = mount(<SpaceMediaPreview asset={source} active />);
    await waitFor(() => expect(decode).toHaveBeenCalledOnce());
    const oldAudio = container.querySelector("audio")!;
    oldAudio.currentTime = 25; fireEvent.timeUpdate(oldAudio);
    expect(screen.getByText("0:25 / 1:05")).toBeInTheDocument();
    rerender(<SpaceMediaPreview asset={asset("audio")} active={false} />);
    expect(close).toHaveBeenCalledOnce(); expect(oldAudio).not.toHaveAttribute("src");
    await act(async () => { resolveDecode(audioBuffer(999)); });
    expect(screen.getByText("0:00 / 1:05")).toBeInTheDocument();
    expect(container.querySelector('[data-space-audio-waveform="ready"]')).not.toBeInTheDocument();
  });

  it("bounds waveform concurrency to two sources and releases a slot after completion", async () => {
    const requests: Array<{ signal: AbortSignal; resolve: (value: Response) => void }> = [];
    vi.mocked(fetch).mockImplementation((_url, options) => new Promise((resolve, reject) => {
      const signal = options!.signal as AbortSignal; requests.push({ signal, resolve });
      signal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true });
    }));
    const sources = [asset("audio"), asset("audio"), asset("audio")];
    mount(<>{sources.map(source => <SpaceMediaPreview key={source.id} asset={source} active />)}</>);
    expect(fetch).toHaveBeenCalledTimes(2);
    await act(async () => { requests[0].resolve(response()); });
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(3));
    cleanup(); expect(requests[1].signal.aborted).toBe(true); expect(requests[2].signal.aborted).toBe(true);
    await act(async () => {});
  });

  it("keeps playback available when waveform decoding fails and reports media errors with retry", async () => {
    decode.mockRejectedValueOnce(new Error("Decoder failure"));
    const { container } = mount(<SpaceMediaPreview asset={asset("audio")} active />);
    await waitFor(() => expect(container.querySelector('[data-space-audio-waveform="error"]')).toBeInTheDocument());
    const audio = container.querySelector("audio")!;
    fireEvent.click(screen.getByRole("button", { name: "Play" })); expect(audio.paused).toBe(false);
    Object.defineProperty(audio, "error", { configurable: true, value: { code: 4, message: "Unsupported audio" } });
    fireEvent.error(audio);
    expect(screen.getByRole("alert")).toHaveTextContent("Could not play the audio. Try again.");
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(audio.play).toHaveBeenCalledTimes(2);
  });

  it("keeps playback usable when a visibility pause interrupts a pending play", async () => {
    const { container } = mount(<SpaceMediaPreview asset={asset("audio")} active />);
    const audio = container.querySelector("audio")!;
    vi.mocked(audio.play).mockRejectedValueOnce(new DOMException("Playback was interrupted by pause", "AbortError"));
    fireEvent.click(screen.getByRole("button", { name: "Play" }));
    await act(async () => {});
    fireEvent.error(audio); // A queued cleanup event has no current MediaError.
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Play" })).toBeEnabled();
  });
});
