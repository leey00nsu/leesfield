import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { createRef, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import messages from "@/shared/i18n/messages/en.json";
import { AppAudioPlayer } from "./app-audio-player";

const decode = vi.fn(), close = vi.fn(); let serial = 0;
class AudioDecoder {
  state = "running";
  decodeAudioData = decode;
  close() { this.state = "closed"; close(); return Promise.resolve(); }
}
function mount(children: ReactNode) {
  return render(children, { wrapper: ({ children }) => <NextIntlClientProvider locale="en" messages={messages}>{children}</NextIntlClientProvider> });
}
function source() { return `/raw-audio-${++serial}.wav`; }
beforeEach(() => {
  Object.defineProperty(document, "hidden", { configurable: true, value: false });
  decode.mockReset().mockResolvedValue({ duration: 30, numberOfChannels: 1, getChannelData: () => Float32Array.from([0, 0.2, -1, 0.7]) });
  close.mockClear(); vi.stubGlobal("AudioContext", AudioDecoder);
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, headers: new Headers(), body: null, arrayBuffer: async () => new ArrayBuffer(4) }));
  vi.spyOn(HTMLMediaElement.prototype, "play").mockImplementation(function (this: HTMLMediaElement) {
    Object.defineProperty(this, "paused", { configurable: true, value: false }); this.dispatchEvent(new Event("play")); return Promise.resolve();
  });
  vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(function (this: HTMLMediaElement) {
    if (this.paused) return; Object.defineProperty(this, "paused", { configurable: true, value: true }); this.dispatchEvent(new Event("pause"));
  });
  vi.spyOn(HTMLMediaElement.prototype, "load").mockImplementation(() => {});
});
afterEach(async () => { cleanup(); await act(async () => {}); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("AppAudioPlayer", () => {
  it.each([false, true])("keeps explicit audio playing in a hidden tab (pending play: %s)", async pending => {
    let resolve!: () => void;
    if (pending) vi.mocked(HTMLMediaElement.prototype.play).mockImplementationOnce(function (this: HTMLMediaElement) {
      return new Promise<void>(done => { resolve = () => {
        Object.defineProperty(this, "paused", { configurable: true, value: false }); this.dispatchEvent(new Event("play")); done();
      }; });
    });
    const ref = createRef<HTMLAudioElement>(), { unmount } = mount(<AppAudioPlayer src={source()} ref={ref} />);
    fireEvent.click(screen.getByRole("button", { name: "Play" }));
    const audio = ref.current!, pauses = vi.mocked(audio.pause).mock.calls.length;
    Object.defineProperty(document, "hidden", { configurable: true, value: true }); fireEvent(document, new Event("visibilitychange"));
    if (pending) await act(async () => { resolve(); }); else await act(async () => {});
    expect(audio.paused).toBe(false); expect(audio.pause).toHaveBeenCalledTimes(pauses);
    fireEvent.click(screen.getByRole("button", { name: "Pause" })); expect(audio.paused).toBe(true);
    unmount(); expect(audio).not.toHaveAttribute("src");
  });

  it("shares bounded URL waveform work/cache outside Spaces and keeps embedded media unnamed visually", async () => {
    const src = source(), ref = createRef<HTMLAudioElement>();
    const { container } = mount(<><AppAudioPlayer src={src} ref={ref} embedded title="A named recording" /><AppAudioPlayer src={src} embedded /></>);
    await waitFor(() => expect(container.querySelectorAll('[data-app-audio-waveform="ready"]')).toHaveLength(2));
    expect(fetch).toHaveBeenCalledExactlyOnceWith(src, expect.objectContaining({ signal: expect.any(AbortSignal), credentials: "same-origin" }));
    expect(decode).toHaveBeenCalledOnce(); expect(close).toHaveBeenCalledOnce();
    expect(screen.queryByText("A named recording")).not.toBeInTheDocument(); expect(ref.current).toHaveAttribute("aria-label", "A named recording");
    expect(screen.getAllByText("0:00 / 0:30")).toHaveLength(2);
  });

  it("does no waveform or media loading for inactive and controls=false previews and forwards the underlying ref/events", () => {
    const src = source(), ref = createRef<HTMLAudioElement>(), loaded = vi.fn();
    const { rerender, unmount } = mount(<AppAudioPlayer src={src} controls={false} mediaRef={ref} active={false} className="hidden" onLoadedMetadata={loaded} />);
    const audio = ref.current!; expect(audio).not.toHaveAttribute("src"); expect(audio).toHaveClass("hidden"); expect(audio.controls).toBe(false);
    expect(fetch).not.toHaveBeenCalled(); expect(screen.queryByRole("button")).not.toBeInTheDocument();
    rerender(<AppAudioPlayer src={src} controls={false} mediaRef={ref} active onLoadedMetadata={loaded} />);
    expect(ref.current).toBe(audio); expect(audio).toHaveAttribute("src", src); expect(fetch).not.toHaveBeenCalled();
    fireEvent.loadedMetadata(audio); expect(loaded).toHaveBeenCalledOnce();
    unmount(); expect(audio).not.toHaveAttribute("src"); expect(ref.current).toBeNull();
  });

  it("keeps keyboard waveform seeking and space playback after decode failure without native controls", async () => {
    decode.mockRejectedValueOnce(new Error("unsupported"));
    const ref = createRef<HTMLAudioElement>(); mount(<AppAudioPlayer src={source()} ref={ref} />);
    const audio = ref.current!; Object.defineProperty(audio, "duration", { configurable: true, value: 20 }); fireEvent.loadedMetadata(audio);
    await waitFor(() => expect(decode).toHaveBeenCalledOnce());
    const seek = screen.getByRole("slider", { name: "Playback position" }); fireEvent.keyDown(seek, { key: "ArrowRight" });
    expect(audio.currentTime).toBe(5); fireEvent.keyDown(seek, { key: " " }); expect(audio.paused).toBe(false);
    fireEvent.keyDown(seek, { key: " " }); expect(audio.paused).toBe(true); expect(audio.controls).toBe(false);
    await act(async () => {});
  });

  it("cancels an oversized raw stream before decoding while retaining explicit playback", async () => {
    const cancel = vi.fn().mockResolvedValue(undefined), releaseLock = vi.fn();
    const read = vi.fn().mockResolvedValue({ done: false, value: { byteLength: 50 * 1024 * 1024 + 1 } });
    vi.mocked(fetch).mockResolvedValueOnce({ ok: true, headers: new Headers(), body: { getReader: () => ({ read, cancel, releaseLock }) } } as unknown as Response);
    const ref = createRef<HTMLAudioElement>(), { container } = mount(<AppAudioPlayer src={source()} ref={ref} />);
    await waitFor(() => expect(container.querySelector('[data-app-audio-waveform="error"]')).toBeInTheDocument());
    expect(decode).not.toHaveBeenCalled(); expect(cancel).toHaveBeenCalled(); expect(releaseLock).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole("button", { name: "Play" })); expect(ref.current!.paused).toBe(false);
    await act(async () => {});
  });

  it("aborts a stalled raw waveform request when the final active subscriber leaves", async () => {
    let signal!: AbortSignal;
    vi.mocked(fetch).mockImplementationOnce((_url, options) => new Promise((_resolve, reject) => {
      signal = options!.signal as AbortSignal;
      signal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true });
    }));
    const src = source(); const { rerender } = mount(<AppAudioPlayer src={src} />);
    await waitFor(() => expect(fetch).toHaveBeenCalledOnce());
    rerender(<AppAudioPlayer src={src} active={false} />); expect(signal.aborted).toBe(true); expect(decode).not.toHaveBeenCalled();
    await act(async () => {});
  });
});
