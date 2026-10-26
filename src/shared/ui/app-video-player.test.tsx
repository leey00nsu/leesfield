import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { createRef, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import messages from "@/shared/i18n/messages/en.json";
import { AppVideoPlayer } from "./app-video-player";

function mount(children: ReactNode) {
  return render(children, { wrapper: ({ children }) => <NextIntlClientProvider locale="en" messages={messages}>{children}</NextIntlClientProvider> });
}
function metadata(video: HTMLVideoElement, duration = 80) {
  Object.defineProperties(video, { duration: { configurable: true, value: duration }, readyState: { configurable: true, value: 1 } });
  fireEvent.loadedMetadata(video);
}
beforeEach(() => {
  vi.spyOn(HTMLMediaElement.prototype, "play").mockImplementation(function (this: HTMLMediaElement) {
    Object.defineProperty(this, "paused", { configurable: true, value: false });
    this.dispatchEvent(new Event("play")); return Promise.resolve();
  });
  vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(function (this: HTMLMediaElement) {
    if (this.paused) return;
    Object.defineProperty(this, "paused", { configurable: true, value: true }); this.dispatchEvent(new Event("pause"));
  });
  vi.spyOn(HTMLMediaElement.prototype, "load").mockImplementation(() => {});
  Object.defineProperty(document, "hidden", { configurable: true, value: false });
  Object.defineProperty(document, "fullscreenElement", { configurable: true, value: null });
  Object.defineProperty(document, "fullscreenEnabled", { configurable: true, value: false });
  Object.defineProperty(document, "pictureInPictureEnabled", { configurable: true, value: false });
  Object.defineProperty(document, "pictureInPictureElement", { configurable: true, value: null });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("AppVideoPlayer", () => {
  it.each(["Playback speed", "Volume"])("keeps %s popovers inside the fullscreen player and restores normal portal/focus on exit", async label => {
    const user = userEvent.setup(), ref = createRef<HTMLVideoElement>();
    mount(<AppVideoPlayer src="/fullscreen-popovers.mp4" ref={ref} />);
    const root = ref.current!.closest("[data-app-video-player]")!;
    const trigger = within(root as HTMLElement).getByRole("button", { name: label === "Playback speed" ? "Playback speed: 1×" : label });
    await user.click(trigger);
    expect(root.contains(screen.getByRole("dialog", { name: label }))).toBe(false);
    await user.keyboard("{Escape}"); expect(trigger).toHaveFocus();
    Object.defineProperty(document, "fullscreenElement", { configurable: true, value: root }); fireEvent(document, new Event("fullscreenchange"));
    await user.click(trigger);
    expect(root.contains(screen.getByRole("dialog", { name: label }))).toBe(true);
    await user.keyboard("{Escape}"); expect(trigger).toHaveFocus();
    Object.defineProperty(document, "fullscreenElement", { configurable: true, value: null }); fireEvent(document, new Event("fullscreenchange"));
    await user.click(trigger);
    expect(root.contains(screen.getByRole("dialog", { name: label }))).toBe(false);
    await user.keyboard("{Escape}"); expect(trigger).toHaveFocus();
  });

  it.each([false, true])("keeps PiP playback through hiding and inactivity (pending play: %s)", async pending => {
    let resolve!: () => void;
    if (pending) vi.mocked(HTMLMediaElement.prototype.play).mockImplementationOnce(function (this: HTMLMediaElement) {
      return new Promise<void>(done => { resolve = () => {
        Object.defineProperty(this, "paused", { configurable: true, value: false }); this.dispatchEvent(new Event("play")); done();
      }; });
    });
    const ref = createRef<HTMLVideoElement>(), { rerender } = mount(<AppVideoPlayer src="/pip-background.mp4" ref={ref} />);
    const video = ref.current!; fireEvent.click(screen.getByRole("button", { name: "Play" }));
    Object.defineProperty(document, "pictureInPictureElement", { configurable: true, value: video });
    fireEvent(video, new Event("enterpictureinpicture"));
    const pauses = vi.mocked(video.pause).mock.calls.length;
    Object.defineProperty(document, "hidden", { configurable: true, value: true }); fireEvent(document, new Event("visibilitychange"));
    rerender(<AppVideoPlayer src="/pip-background.mp4" ref={ref} active={false} />);
    if (pending) await act(async () => { resolve(); }); else await act(async () => {});
    expect(video.paused).toBe(false); expect(video.pause).toHaveBeenCalledTimes(pauses); expect(video).toHaveAttribute("src");
    Object.defineProperty(document, "pictureInPictureElement", { configurable: true, value: null }); fireEvent(video, new Event("leavepictureinpicture"));
    expect(video.paused).toBe(true);
  });

  it("keeps a pending selected preview playing in PiP and reapplies hidden policy on PiP exit", async () => {
    let resolve!: () => void;
    vi.mocked(HTMLMediaElement.prototype.play).mockImplementationOnce(function (this: HTMLMediaElement) {
      return new Promise<void>(done => { resolve = () => {
        Object.defineProperty(this, "paused", { configurable: true, value: false }); this.dispatchEvent(new Event("play")); done();
      }; });
    });
    const ref = createRef<HTMLVideoElement>();
    const { rerender } = mount(<AppVideoPlayer src="/preview-pip.mp4" ref={ref} autoPreview={{ selected: true }} muted />);
    const video = ref.current!;
    Object.defineProperty(document, "pictureInPictureElement", { configurable: true, value: video });
    Object.defineProperty(document, "hidden", { configurable: true, value: true }); fireEvent(document, new Event("visibilitychange"));
    rerender(<AppVideoPlayer src="/preview-pip.mp4" ref={ref} active={false} autoPreview={{ selected: false }} muted />);
    await act(async () => { resolve(); }); expect(video.paused).toBe(false);
    Object.defineProperty(document, "pictureInPictureElement", { configurable: true, value: null }); fireEvent(video, new Event("leavepictureinpicture"));
    expect(video.paused).toBe(true);
  });

  it("pauses ordinary silent previews when hidden", async () => {
    const ref = createRef<HTMLVideoElement>(); mount(<AppVideoPlayer src="/silent-preview.mp4" controls={false} muted ref={ref} />);
    const video = ref.current!; await act(async () => { await video.play(); }); expect(video.paused).toBe(false);
    Object.defineProperty(document, "hidden", { configurable: true, value: true }); fireEvent(document, new Event("visibilitychange"));
    expect(video.paused).toBe(true); expect(video).toHaveAttribute("src");
    // Decoder/autoplay events can arrive after visibility was already lost.
    await act(async () => { await video.play(); }); expect(video.paused).toBe(true);
  });

  it("leaves a newer play intent alone when an older play resolves after pause and replay", async () => {
    const completions: Array<() => void> = [];
    vi.mocked(HTMLMediaElement.prototype.play).mockImplementation(function (this: HTMLMediaElement) {
      Object.defineProperty(this, "paused", { configurable: true, value: false }); this.dispatchEvent(new Event("play"));
      return new Promise<void>(resolve => { completions.push(resolve); });
    });
    const ref = createRef<HTMLVideoElement>(); mount(<AppVideoPlayer src="/intent.mp4" ref={ref} />);
    const video = ref.current!;
    fireEvent.click(screen.getByRole("button", { name: "Play" }));
    fireEvent.click(screen.getByRole("button", { name: "Pause" }));
    fireEvent.click(screen.getByRole("button", { name: "Play" }));
    const pauses = vi.mocked(video.pause).mock.calls.length;
    await act(async () => { completions[1](); completions[0](); });
    expect(video.paused).toBe(false); expect(video.pause).toHaveBeenCalledTimes(pauses);
  });

  it("does not let a stale play completion resurrect an inactive then reactivated player", async () => {
    let resolve!: () => void;
    vi.mocked(HTMLMediaElement.prototype.play).mockImplementationOnce(function (this: HTMLMediaElement) {
      return new Promise<void>(done => { resolve = () => { Object.defineProperty(this, "paused", { configurable: true, value: false }); done(); }; });
    });
    const ref = createRef<HTMLVideoElement>(), { rerender } = mount(<AppVideoPlayer src="/inactive-intent.mp4" ref={ref} />);
    fireEvent.click(screen.getByRole("button", { name: "Play" }));
    rerender(<AppVideoPlayer src="/inactive-intent.mp4" ref={ref} active={false} />);
    rerender(<AppVideoPlayer src="/inactive-intent.mp4" ref={ref} active />);
    await act(async () => { resolve(); }); expect(ref.current!.paused).toBe(true);
  });

  it("uses finite decoder metadata for seek, reflects playback/buffering, and forwards media events and refs", async () => {
    const mediaRef = createRef<HTMLVideoElement>(), loaded = vi.fn(), pointer = vi.fn();
    mount(<div onPointerDown={pointer}><AppVideoPlayer src="/clip-a.mp4" title="Clip" mediaRef={mediaRef} onLoadedMetadata={loaded} /></div>);
    const video = mediaRef.current!;
    expect(video).toHaveAttribute("src", "/clip-a.mp4"); expect(video.controls).toBe(false);
    const seek = screen.getByRole("slider", { name: "Playback position" });
    expect(seek).toBeDisabled(); expect(screen.queryByRole("button", { name: "Enter full screen" })).not.toBeInTheDocument();
    metadata(video, Infinity); expect(seek).toBeDisabled();
    metadata(video); expect(loaded).toHaveBeenCalledTimes(2); expect(seek).toBeEnabled();
    fireEvent.loadedData(video);
    fireEvent.change(seek, { target: { value: "25" } }); expect(video.currentTime).toBe(25);
    fireEvent.keyDown(seek, { key: "ArrowRight" }); expect(video.currentTime).toBe(30);
    fireEvent.keyDown(seek, { key: "End" }); expect(video.currentTime).toBe(80);
    fireEvent.keyDown(seek, { key: "Home" }); expect(video.currentTime).toBe(0);
    fireEvent.pointerDown(seek); expect(pointer).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Play" }));
    expect(screen.getByRole("button", { name: "Pause" })).toBeInTheDocument();
    fireEvent.waiting(video); expect(screen.getByRole("status")).toHaveTextContent("Buffering");
    fireEvent.playing(video); expect(screen.queryByRole("status")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Pause" })); expect(video.paused).toBe(true);
    await act(async () => {});
  });

  it("keeps native volume/rate events and custom controls synchronized after metadata", async () => {
    const user = userEvent.setup(), ref = createRef<HTMLVideoElement>();
    mount(<AppVideoPlayer src="/clip-b.mp4" ref={ref} />); const video = ref.current!; metadata(video);
    act(() => { video.volume = 0.35; video.muted = true; video.playbackRate = 1.5; });
    expect(screen.getByRole("button", { name: "Playback speed: 1.5×" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Unmute" })).toHaveAttribute("aria-pressed", "true");
    await user.click(screen.getByRole("button", { name: "Volume" }));
    expect(screen.getByRole("slider", { name: "Volume" })).toHaveAttribute("aria-valuenow", "35");
    await user.keyboard("{Escape}");
    await user.click(screen.getByRole("button", { name: "Playback speed: 1.5×" }));
    await user.click(screen.getByRole("radio", { name: "2×" }));
    expect(video.playbackRate).toBe(2); expect(video.defaultPlaybackRate).toBe(2); expect(video.preservesPitch).toBe(true);
    expect(video.volume).toBe(0.35); expect(video.muted).toBe(true);
    await user.click(screen.getByRole("button", { name: "Unmute" })); expect(video.volume).toBe(0.35); expect(video.muted).toBe(false);
  });

  it("retains user preferences but releases old source/state and ignores late rejected playback", async () => {
    const ref = createRef<HTMLVideoElement>(); let reject!: (error: Error) => void;
    const { rerender } = mount(<AppVideoPlayer src="/old.mp4" ref={ref} />); const old = ref.current!; metadata(old);
    act(() => { old.volume = 0.4; old.playbackRate = 1.25; });
    old.currentTime = 40; fireEvent.timeUpdate(old);
    vi.mocked(old.play).mockImplementationOnce(() => new Promise<void>((_, fail) => { reject = fail; }));
    fireEvent.click(screen.getByRole("button", { name: "Play" }));
    rerender(<AppVideoPlayer src="/new.mp4" ref={ref} active={false} />);
    expect(ref.current).not.toBe(old); expect(old).not.toHaveAttribute("src"); expect(old.load).toHaveBeenCalled();
    expect(ref.current).not.toHaveAttribute("src"); expect(ref.current!.volume).toBe(0.4); expect(ref.current!.playbackRate).toBe(1.25);
    expect(screen.getByText("0:00 / 0:00")).toBeInTheDocument();
    await act(async () => { reject(new Error("old rejection")); }); expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("keeps changed external muted props through decoder metadata, activation and source replacement", () => {
    const ref = createRef<HTMLVideoElement>();
    const { rerender } = mount(<AppVideoPlayer src="/strip-audio.mp4" ref={ref} muted={false} controls={false} active={false} />);
    const video = ref.current!; expect(video.muted).toBe(false);
    rerender(<AppVideoPlayer src="/strip-audio.mp4" ref={ref} muted controls={false} active={false} />);
    expect(video.muted).toBe(true); metadata(video); expect(video.muted).toBe(true);
    rerender(<AppVideoPlayer src="/strip-audio.mp4" ref={ref} muted controls={false} active />);
    expect(ref.current).toBe(video); expect(video.muted).toBe(true);
    rerender(<AppVideoPlayer src="/strip-audio.mp4" ref={ref} muted={false} controls={false} active />);
    metadata(video); expect(video.muted).toBe(false);
    rerender(<AppVideoPlayer src="/strip-audio-next.mp4" ref={ref} muted controls={false} active />);
    expect(ref.current!.muted).toBe(true); metadata(ref.current!); expect(ref.current!.muted).toBe(true);
  });

  it("preserves the media element and position across inactive previews and frees explicitly disposable references", () => {
    const ref = createRef<HTMLVideoElement>();
    const { rerender, unmount } = mount(<AppVideoPlayer src="/preview.mp4" controls={false} mediaRef={ref} className="preview" active={false} />);
    const video = ref.current!; expect(video).not.toHaveAttribute("src"); expect(video.parentElement).toHaveClass("preview");
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    rerender(<AppVideoPlayer src="/preview.mp4" controls={false} mediaRef={ref} active />);
    video.currentTime = 15; act(() => { void video.play(); });
    rerender(<AppVideoPlayer src="/preview.mp4" controls={false} mediaRef={ref} active={false} />);
    expect(ref.current).toBe(video); expect(video.paused).toBe(true); expect(video.currentTime).toBe(15); expect(video).toHaveAttribute("src");
    rerender(<AppVideoPlayer src="/preview.mp4" controls={false} mediaRef={ref} active={false} releaseWhenInactive />);
    expect(video).not.toHaveAttribute("src"); unmount(); expect(ref.current).toBeNull();
  });

  it("recovers actual decoder errors and suppresses errors caused by released sources", async () => {
    const ref = createRef<HTMLVideoElement>(); mount(<AppVideoPlayer src="/broken.mp4" ref={ref} />);
    const video = ref.current!; fireEvent.error(video); expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    Object.defineProperty(video, "error", { configurable: true, value: { code: 4 } }); fireEvent.error(video);
    expect(screen.getByRole("alert")).toHaveTextContent("Could not play the video.");
    fireEvent.click(screen.getByRole("button", { name: "Retry" })); expect(video.load).toHaveBeenCalled(); expect(video.play).toHaveBeenCalledOnce();
    await act(async () => {}); expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("uses capability guards for fullscreen/PiP, keeps inline-only restrictions and handles rejected browser requests", async () => {
    Object.defineProperty(document, "fullscreenEnabled", { configurable: true, value: true });
    Object.defineProperty(document, "pictureInPictureEnabled", { configurable: true, value: true });
    const fullscreen = vi.fn().mockRejectedValue(new Error("denied")), pip = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(HTMLDivElement.prototype, "requestFullscreen", { configurable: true, value: fullscreen });
    Object.defineProperty(HTMLVideoElement.prototype, "requestPictureInPicture", { configurable: true, value: pip });
    const ref = createRef<HTMLVideoElement>();
    const { rerender } = mount(<AppVideoPlayer src="/capable.mp4" ref={ref} />); metadata(ref.current!);
    fireEvent.click(screen.getByRole("button", { name: "Picture in Picture" })); expect(pip).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole("button", { name: "Enter full screen" }));
    await act(async () => {}); expect(screen.getByText("Full screen is unavailable.")).toHaveAttribute("role", "status");
    const video = ref.current;
    rerender(<AppVideoPlayer src="/capable.mp4" ref={ref} inlineOnly />);
    expect(ref.current).toBe(video); expect(video).toHaveAttribute("disablepictureinpicture"); expect(video).toHaveAttribute("controlslist", "nofullscreen");
    expect(screen.queryByRole("button", { name: "Picture in Picture" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Enter full screen" })).not.toBeInTheDocument();
    delete (HTMLDivElement.prototype as Partial<HTMLDivElement>).requestFullscreen;
    delete (HTMLVideoElement.prototype as Partial<HTMLVideoElement>).requestPictureInPicture;
  });

  it("pauses hidden media, ignores stale play rejection and releases a late successful play after unmount", async () => {
    const ref = createRef<HTMLVideoElement>(); let resolve!: () => void;
    vi.mocked(HTMLMediaElement.prototype.play).mockImplementationOnce(function (this: HTMLMediaElement) {
      return new Promise<void>(done => { resolve = () => { Object.defineProperty(this, "paused", { configurable: true, value: false }); done(); }; });
    });
    const { unmount } = mount(<AppVideoPlayer src="/pending.mp4" ref={ref} />); const video = ref.current!;
    fireEvent.click(screen.getByRole("button", { name: "Play" }));
    Object.defineProperty(document, "hidden", { configurable: true, value: true }); fireEvent(document, new Event("visibilitychange"));
    unmount(); await act(async () => { resolve(); }); expect(video.paused).toBe(true); expect(video).not.toHaveAttribute("src");
  });
});

it("shows shared skeleton until the first frame, preserves callbacks and clears it on source changes/errors", () => {
 const ref=createRef<HTMLVideoElement>(), loaded=vi.fn();
 const view=mount(<AppVideoPlayer src="/first-frame.mp4" controls={false} ref={ref} onLoadedData={loaded}/>);
 expect(screen.getByRole("status",{name:"Loading media"})).toBeInTheDocument();
 fireEvent.loadedMetadata(ref.current!);
 expect(screen.getByRole("status",{name:"Loading media"})).toBeInTheDocument();
 fireEvent.loadedData(ref.current!);
 expect(loaded).toHaveBeenCalledOnce();expect(screen.queryByRole("status",{name:"Loading media"})).not.toBeInTheDocument();
 view.rerender(<AppVideoPlayer src="/next-frame.mp4" controls={false} ref={ref}/>);
 expect(screen.getByRole("status",{name:"Loading media"})).toBeInTheDocument();
 fireEvent.error(ref.current!);
 expect(screen.queryByRole("status",{name:"Loading media"})).not.toBeInTheDocument();
 view.rerender(<AppVideoPlayer src="/offscreen.mp4" controls={false} active={false} ref={ref}/>);
 expect(ref.current).not.toHaveAttribute("src");
 expect(screen.queryByRole("status",{name:"Loading media"})).not.toBeInTheDocument();
 view.rerender(<AppVideoPlayer src="/card-offscreen.mp4" controls={false} active={false} showLoadingWhenInactive ref={ref}/>);
 expect(ref.current).not.toHaveAttribute("src");
 expect(screen.getByRole("status",{name:"Loading media"})).toBeInTheDocument();
});
