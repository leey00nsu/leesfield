import { act, cleanup, render, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MediaAssetDto } from "@/shared/media-assets/media-asset-contract";
import messages from "@/shared/i18n/messages/en.json";
import { AppAudioPlayer } from "./app-audio-player";
import { AppAudioWaveform } from "./app-audio-waveform";

const decode = vi.fn(), close = vi.fn();
let serial = 0;
class AudioDecoder {
  state = "running";
  decodeAudioData = decode;
  close() { this.state = "closed"; close(); return Promise.resolve(); }
}
function asset(): MediaAssetDto {
  return { id: `silent-waveform-${++serial}`, version: 1, type: "audio", status: "completed", origin: "generation",
    url: `https://audio.example/clip-${serial}.wav`, mimeType: "audio/wav", bytes: "28844", width: null, height: null,
    durationMs: 1800, sourceOperationId: null, createdAt: "2026-10-22T00:00:00Z", updatedAt: "2026-10-22T00:00:00Z" };
}
function mount(children: ReactNode) {
  return render(children, { wrapper: ({ children }) => <NextIntlClientProvider locale="en" messages={messages}>{children}</NextIntlClientProvider> });
}
function buffer(duration = 1.8) {
  return { duration, numberOfChannels: 1, getChannelData: () => Float32Array.from({ length: 14_400 }, (_, index) => Math.sin(index / 12) * 0.8) };
}
beforeEach(() => {
  decode.mockReset().mockResolvedValue(buffer()); close.mockClear();
  vi.stubGlobal("AudioContext", AudioDecoder);
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, headers: new Headers(), body: null, arrayBuffer: async () => new ArrayBuffer(16) }));
  vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue();
  vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
  vi.spyOn(HTMLMediaElement.prototype, "load").mockImplementation(() => {});
});
afterEach(async () => { cleanup(); await act(async () => {}); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("AppAudioWaveform", () => {
  it("shares owned peaks with players and duplicate previews without creating playable media", async () => {
    const source = asset();
    const { container, unmount } = mount(<>
      <AppAudioWaveform src={source.url} asset={source} className="gallery-waveform" />
      <AppAudioWaveform src={source.url} asset={source} />
      <AppAudioPlayer src={source.url} asset={source} />
    </>);
    await waitFor(() => expect(container.querySelectorAll('[data-app-audio-waveform="ready"]')).toHaveLength(3));
    expect(fetch).toHaveBeenCalledExactlyOnceWith(`/api/media-assets/${source.id}/content`, expect.objectContaining({ credentials: "same-origin", signal: expect.any(AbortSignal) }));
    expect(decode).toHaveBeenCalledOnce(); expect(close).toHaveBeenCalledOnce();
    const preview = container.querySelector(".gallery-waveform")!;
    expect(preview.querySelector("audio, video, button, input")).not.toBeInTheDocument();
    expect(preview.querySelector('path[d="M0 32H512"]')).not.toBeInTheDocument();
    expect(preview.querySelector("path")?.getAttribute("d")).toBe(container.querySelector('[data-app-audio-player] path')?.getAttribute("d"));
    expect(container.querySelectorAll("audio")).toHaveLength(1);
    expect(HTMLMediaElement.prototype.play).not.toHaveBeenCalled();
    unmount();
    const cached = mount(<AppAudioWaveform src={source.url} asset={{ ...source }} />);
    expect(cached.container.querySelector('[data-app-audio-waveform="ready"]')).toBeInTheDocument();
    expect(cached.container.querySelector("audio, button, input")).not.toBeInTheDocument();
    expect(fetch).toHaveBeenCalledOnce(); expect(decode).toHaveBeenCalledOnce();
  });

  it("starts only visible work, keeps two source requests, and cancels queued and active work on departure", async () => {
    const requests: Array<{ url: string; signal: AbortSignal }> = [];
    vi.mocked(fetch).mockImplementation((url, options) => new Promise((_resolve, reject) => {
      const signal = options!.signal as AbortSignal;
      requests.push({ url: String(url), signal });
      signal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true });
    }));
    const sources = [asset(), asset(), asset(), asset()];
    const tree = (active: boolean[]) => sources.map((source, index) => <AppAudioWaveform key={source.id} src={source.url} asset={source} active={active[index]} />);
    const { container, rerender, unmount } = mount(tree([false, false, false, false]));
    expect(fetch).not.toHaveBeenCalled(); expect(container.querySelector("audio")).not.toBeInTheDocument();
    rerender(tree([true, true, true, true]));
    expect(requests).toHaveLength(2);
    rerender(tree([false, true, true, false]));
    expect(requests[0].signal.aborted).toBe(true); expect(requests[1].signal.aborted).toBe(false);
    await waitFor(() => expect(requests).toHaveLength(3));
    expect(requests[2].url).toBe(`/api/media-assets/${sources[2].id}/content`);
    unmount(); await act(async () => {});
    expect(requests.every(request => request.signal.aborted)).toBe(true);
    expect(requests).toHaveLength(3); expect(decode).not.toHaveBeenCalled();
    expect(HTMLMediaElement.prototype.play).not.toHaveBeenCalled();
  });

  it("drops late decoded peaks after the asset revision changes", async () => {
    let finish!: (value: ReturnType<typeof buffer>) => void;
    decode.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    const source = asset(), next = { ...source, version: 2, updatedAt: "2026-10-22T00:00:01Z" };
    const { container, rerender } = mount(<AppAudioWaveform src={source.url} asset={source} />);
    await waitFor(() => expect(decode).toHaveBeenCalledOnce());
    rerender(<AppAudioWaveform src={next.url} asset={next} active={false} />);
    expect(close).toHaveBeenCalledOnce();
    await act(async () => { finish(buffer(90)); });
    expect(container.querySelector('[data-app-audio-waveform="ready"]')).not.toBeInTheDocument();
    rerender(<AppAudioWaveform src={next.url} asset={next} />);
    await waitFor(() => expect(container.querySelector('[data-app-audio-waveform="ready"]')).toBeInTheDocument());
    expect(fetch).toHaveBeenCalledTimes(2); expect(decode).toHaveBeenCalledTimes(2);
    expect(container.querySelector("audio")).not.toBeInTheDocument();
  });
});
