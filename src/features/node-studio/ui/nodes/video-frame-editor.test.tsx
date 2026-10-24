import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { createRef } from "react";
import messages from "@/shared/i18n/messages/en.json";
import type { MediaAssetDto } from "@/shared/media-assets/media-asset-contract";
import { spaceFilmstripScheduler } from "../../lib/space-filmstrip";
import { VideoFrameEditor, type VideoFrameCapture } from "./video-frame-editor";

const source: MediaAssetDto = { id: "lazy-trim", version: 1, type: "video", status: "completed", origin: "upload", mimeType: "video/mp4", bytes: "2000", width: 320, height: 180, durationMs: 4000, sourceOperationId: null, url: "https://example.com/lazy.mp4", createdAt: "today", updatedAt: "today" };
let observers: Array<{ callback: IntersectionObserverCallback; target?: Element; disconnected: boolean }>;
const visibility = (visible: boolean) => act(() => {
  for (const observer of observers) if (!observer.disconnected && observer.target) observer.callback([{ isIntersecting: visible, target: observer.target } as IntersectionObserverEntry], {} as IntersectionObserver);
});
const ui = (active: boolean, asset = source) => <NextIntlClientProvider locale="en" messages={messages}>
  <VideoFrameEditor source={asset} active={active} writable frame={{ timestampMs: 0, onChange: vi.fn() }} />
</NextIntlClientProvider>;

beforeEach(() => {
  observers = [];
  vi.stubGlobal("IntersectionObserver", class {
    state: typeof observers[number];
    constructor(callback: IntersectionObserverCallback) { this.state = { callback, disconnected: false }; observers.push(this.state); }
    observe(target: Element) { this.state.target = target; }
    disconnect() { this.state.disconnected = true; }
  });
  vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => undefined);
  vi.spyOn(HTMLMediaElement.prototype, "load").mockImplementation(() => undefined);
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

it("uses one frame playhead, commits explicit seeks and captures live playback without saving playback ticks", () => {
  const change = vi.fn(), capture = createRef<VideoFrameCapture>();
  const { container } = render(<NextIntlClientProvider locale="en" messages={messages}>
    <VideoFrameEditor source={source} active writable
      frame={{ timestampMs: 1250, onChange: change }} frameCaptureRef={capture} />
  </NextIntlClientProvider>);
  visibility(true);
  const media = container.querySelector("video")!;
  Object.defineProperties(media, { duration: { value: 4, configurable: true }, readyState: { value: 1, configurable: true } });
  fireEvent.loadedMetadata(media);
  expect(media.currentTime).toBe(1.25);
  expect(screen.queryByLabelText("Trim start time")).not.toBeInTheDocument();
  expect(screen.queryByLabelText("Trim end time")).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Remove embedded audio" })).not.toBeInTheDocument();
  const head = screen.getByRole("slider", { name: "Playback position" });
  expect(screen.getAllByRole("slider")).toHaveLength(1);
  fireEvent.keyDown(head, { key: "ArrowRight" });
  expect(change).toHaveBeenLastCalledWith(1350);
  media.currentTime = 2.345; fireEvent.timeUpdate(media);
  expect(change).toHaveBeenCalledOnce();
  expect(capture.current!.timestampMs()).toBe(2345);
  expect(media.pause).toHaveBeenCalled();
  expect(change).toHaveBeenCalledOnce();
});

it("restores an externally edited frame time and captures it before metadata without requesting offscreen media", () => {
  const capture = createRef<VideoFrameCapture>(), change = vi.fn();
  const tree = (timestampMs: number) => <NextIntlClientProvider locale="en" messages={messages}>
    <VideoFrameEditor source={source} writable
      frame={{ timestampMs, onChange: change }} frameCaptureRef={capture} />
  </NextIntlClientProvider>;
  const { container, rerender } = render(tree(1000));
  expect(container.querySelector("video")).not.toHaveAttribute("src");
  expect(capture.current!.timestampMs()).toBe(1000);
  rerender(tree(2876));
  expect(capture.current!.timestampMs()).toBe(2876);
  expect(change).not.toHaveBeenCalled();
});

it("keeps a restored frame time when visible metadata loads before the node is selected", () => {
  const capture = createRef<VideoFrameCapture>(), change = vi.fn();
  const tree = (active: boolean) => <NextIntlClientProvider locale="en" messages={messages}>
    <VideoFrameEditor source={source} active={active} writable
      frame={{ timestampMs: 1250, onChange: change }} frameCaptureRef={capture} />
  </NextIntlClientProvider>;
  const { container, rerender } = render(tree(false));
  visibility(true);
  const media = container.querySelector("video")!;
  Object.defineProperties(media, { duration: { value: 4, configurable: true }, readyState: { value: 1, configurable: true } });
  fireEvent.loadedMetadata(media);
  expect(media.currentTime).toBe(1.25);
  rerender(tree(true));
  expect(capture.current!.timestampMs()).toBe(1250);
  expect(screen.getByRole("slider", { name: "Playback position" })).toHaveAttribute("aria-valuenow", "1.25");
  expect(change).not.toHaveBeenCalled();
});

it("does not download, decode, seek or pin filmstrips for an offscreen inactive Frames", () => {
  const subscribe = vi.spyOn(spaceFilmstripScheduler, "subscribe"), network = vi.fn(); vi.stubGlobal("fetch", network);
  const { container } = render(ui(false));
  const media = container.querySelector("video")!;
  expect(media).not.toHaveAttribute("src"); expect(media).toHaveAttribute("preload", "none");
  expect(media.currentTime).toBe(0); expect(subscribe).not.toHaveBeenCalled(); expect(network).not.toHaveBeenCalled();
  Object.defineProperty(media, "duration", { value: 4, configurable: true }); fireEvent.loadedMetadata(media);
  expect(media.currentTime).toBe(0);
});

it("requires both visible and selected demand and releases a running subscription when either ends", () => {
  const release = vi.fn(), subscribe = vi.spyOn(spaceFilmstripScheduler, "subscribe").mockReturnValue(release);
  const { rerender, container } = render(ui(true)); expect(subscribe).not.toHaveBeenCalled();
  visibility(true); expect(subscribe).toHaveBeenCalledOnce(); expect(container.querySelector("video")).toHaveAttribute("src", source.url);
  rerender(ui(false)); expect(release).toHaveBeenCalledOnce();
  rerender(ui(true)); expect(subscribe).toHaveBeenCalledTimes(2);
  visibility(false); expect(release).toHaveBeenCalledTimes(2);
});

it("visible inactive metadata does not seek and changing viewport preserves a user's playback position", () => {
  const subscribe = vi.spyOn(spaceFilmstripScheduler, "subscribe");
  const { container } = render(ui(false)); visibility(true);
  const media = container.querySelector("video")!; Object.defineProperty(media, "duration", { value: 4, configurable: true });
  fireEvent.loadedMetadata(media); expect(media.currentTime).toBe(0);
  fireEvent.keyDown(screen.getByRole("slider", { name: "Playback position" }), { key: "ArrowRight" });
  expect(media.currentTime).toBeCloseTo(0.1);
  visibility(false); expect(media).toHaveAttribute("src", source.url); expect(media.currentTime).toBeCloseTo(0.1);
  expect(subscribe).not.toHaveBeenCalled();
});

it("a new source offscreen stays unloaded and old observers/subscriptions are disposed", () => {
  const release = vi.fn(), subscribe = vi.spyOn(spaceFilmstripScheduler, "subscribe").mockReturnValue(release);
  const { rerender, container, unmount } = render(ui(true)); visibility(true); visibility(false);
  rerender(ui(false, { ...source, id: "other", url: "https://example.com/other.mp4" }));
  expect(container.querySelector("video")).not.toHaveAttribute("src"); expect(subscribe).toHaveBeenCalledOnce();
  expect(release).toHaveBeenCalledOnce(); unmount(); expect(observers.every(observer => observer.disconnected)).toBe(true);
});

