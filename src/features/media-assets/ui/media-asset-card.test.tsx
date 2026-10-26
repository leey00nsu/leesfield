import { act, cleanup, fireEvent, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithIntl } from "@/test-utils/intl";
import enMessages from "@/shared/i18n/messages/en.json";
import type { MediaAssetDto } from "@/shared/media-assets/media-asset-contract";
import { MediaAssetCard } from "./media-asset-card";

const asset: MediaAssetDto = {
  id: "audio-asset", version: 1, name: "Edited asset label", type: "audio", origin: "generation", status: "completed",
  mimeType: "audio/wav", bytes: "64", width: null, height: null, durationMs: 1811, sourceOperationId: null,
  url: "/unit-audio.wav", createdAt: "2026-10-21T00:00:00Z", updatedAt: "2026-10-21T00:00:00Z",
};

function deferredPlay() {
  let finish!: () => void;
  const promise = new Promise<void>(resolve => { finish = resolve; });
  return { promise, finish };
}

beforeEach(() => {
  vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue();
  vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
  vi.spyOn(HTMLMediaElement.prototype, "load").mockImplementation(() => {});
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("asset audio cards", () => {
  it.each(["compact", "gallery"] as const)("shows the original TTS text separately from the name/ID in %s", presentation => {
    const text = "[Speaker 1] 안녕하세요.\n[Speaker 2] Read the original script, please.";
    const select = vi.fn();
    renderWithIntl(<MediaAssetCard asset={{ ...asset, inputPrompt: text, description: "Unrelated asset description", originalFileName: "original.wav" }}
      presentation={presentation} onSelect={select} />);
    expect(screen.getByTitle(text, { normalizer: value => value })).toBeInTheDocument();
    expect(screen.getByText(asset.name!)).toBeInTheDocument();
    expect(screen.getByText(asset.id)).toBeInTheDocument();
    expect(screen.queryByText("Unrelated asset description")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: asset.name }));
    expect(select).toHaveBeenCalledOnce();
  });

  it.each([
    ["ko", undefined, "입력 원문이 따로 저장되지 않은 기록입니다.", "직접 입력한 프롬프트가 없습니다."],
    ["en", enMessages, "The original input was not stored separately.", "No prompt was entered directly."],
  ] as const)("distinguishes missing text and explicit empty text in %s", (locale, messages, unknown, empty) => {
    const view = renderWithIntl(<MediaAssetCard asset={asset} onSelect={vi.fn()} />, { locale, messages });
    expect(screen.getByText(unknown)).toBeInTheDocument();
    view.rerender(<MediaAssetCard asset={{ ...asset, inputPrompt: "" }} onSelect={vi.fn()} />);
    expect(screen.getByText(empty)).toBeInTheDocument();
    expect(screen.queryByText(unknown)).not.toBeInTheDocument();
    view.rerender(<MediaAssetCard asset={{ ...asset, origin: "upload", inputPrompt: "Incorrect generated text" }} onSelect={vi.fn()} />);
    expect(screen.queryByText(empty)).not.toBeInTheDocument();
    expect(screen.queryByText("Incorrect generated text")).not.toBeInTheDocument();
  });

  it.each(["audio", "video"] as const)("preserves %s hover/focus playback and stop/reset through the shared preview", type => {
    const view = renderWithIntl(<MediaAssetCard asset={{ ...asset, type }} onSelect={vi.fn()} />);
    const media = view.container.querySelector(type)!;
    const preview = media.parentElement!;
    const play = vi.mocked(HTMLMediaElement.prototype.play), pause = vi.mocked(HTMLMediaElement.prototype.pause);
    expect(media.controls).toBe(false);
    expect(media.preload).toBe(type === "audio" ? "none" : "metadata");
    expect(play).not.toHaveBeenCalled();
    fireEvent.pointerEnter(preview);
    expect(play).toHaveBeenCalledOnce();
    expect(play.mock.instances[0]).toBe(media);
    media.currentTime = 0.5;
    fireEvent.pointerLeave(preview);
    expect(pause).toHaveBeenCalled(); expect(media.currentTime).toBe(0);
    fireEvent.focus(screen.getByRole("button", { name: asset.name }));
    expect(play).toHaveBeenCalledTimes(2);
    media.currentTime = 0.8;
    fireEvent.blur(screen.getByRole("button", { name: asset.name }));
    expect(media.currentTime).toBe(0);
    view.rerender(<MediaAssetCard asset={{ ...asset, type, version: 2, updatedAt: "2026-10-21T01:00:00Z" }} onSelect={vi.fn()} />);
    const currentMedia = view.container.querySelector(type)!;
    fireEvent.focus(screen.getByRole("button", { name: asset.name }));
    expect(play.mock.instances.at(-1)).toBe(currentMedia);
    fireEvent.blur(screen.getByRole("button", { name: asset.name }));
    view.unmount();
    expect(pause.mock.instances).toContain(media);
  });

  describe.each(["audio", "video"] as const)("%s preview lifetime", type => {
    it.each(["pointer leave", "blur", "hidden", "source change", "unmount", "disabled", "ended", "error"] as const)("pauses and resets late playback after %s", async boundary => {
      const pending = deferredPlay(), play = vi.mocked(HTMLMediaElement.prototype.play), pause = vi.mocked(HTMLMediaElement.prototype.pause);
      play.mockImplementationOnce(() => pending.promise);
      const view = renderWithIntl(<MediaAssetCard asset={{ ...asset, type }} onSelect={vi.fn()} />);
      const media = view.container.querySelector(type)!, preview = media.parentElement!;
      const button = screen.getByRole("button", { name: asset.name });
      if (boundary === "blur") fireEvent.focus(button); else fireEvent.pointerEnter(preview);
      expect(play).toHaveBeenCalledOnce();
      let nextMedia: HTMLMediaElement | null = null;
      if (boundary === "pointer leave") fireEvent.pointerLeave(preview);
      else if (boundary === "blur") fireEvent.blur(button);
      else if (boundary === "hidden") {
        vi.spyOn(document, "hidden", "get").mockReturnValue(true);
        fireEvent(document, new Event("visibilitychange"));
      } else if (boundary === "source change") {
        view.rerender(<MediaAssetCard asset={{ ...asset, type, url: "/replacement-media" }} onSelect={vi.fn()} />);
        nextMedia = view.container.querySelector(type);
        expect(nextMedia).not.toBe(media);
      } else if (boundary === "disabled") view.rerender(<MediaAssetCard asset={{ ...asset, type }} disabled onSelect={vi.fn()} />);
      else if (boundary === "ended" || boundary === "error") fireEvent(media, new Event(boundary));
      else view.unmount();
      await act(async () => {});
      pause.mockClear(); media.currentTime = 1;
      await act(async () => { pending.finish(); await pending.promise; });
      expect(pause.mock.instances).toContain(media);
      expect(media.currentTime).toBe(0);
      if (nextMedia) expect(pause.mock.instances).not.toContain(nextMedia);
      if (media.isConnected) {
        for (const event of ["play", "playing"]) {
          pause.mockClear(); media.currentTime = 1;
          fireEvent(media, new Event(event));
          expect(pause.mock.instances).toContain(media);
          expect(media.currentTime).toBe(0);
        }
      }
    });

    it("keeps the latest hover or focus intent when an older play request resolves", async () => {
      const first = deferredPlay(), second = deferredPlay();
      const play = vi.mocked(HTMLMediaElement.prototype.play), pause = vi.mocked(HTMLMediaElement.prototype.pause);
      play.mockImplementationOnce(() => first.promise).mockImplementationOnce(() => second.promise);
      const view = renderWithIntl(<MediaAssetCard asset={{ ...asset, type }} onSelect={vi.fn()} />);
      const media = view.container.querySelector(type)!, preview = media.parentElement!, button = screen.getByRole("button", { name: asset.name });
      fireEvent.pointerEnter(preview);
      fireEvent.pointerLeave(preview);
      fireEvent.pointerEnter(preview);
      expect(play).toHaveBeenCalledTimes(2);
      pause.mockClear(); media.currentTime = 0.5;
      await act(async () => { first.finish(); await first.promise; });
      expect(pause.mock.instances).not.toContain(media);
      expect(media.currentTime).toBe(0.5);
      fireEvent.focus(button);
      fireEvent.pointerLeave(preview);
      expect(pause.mock.instances).not.toContain(media);
      await act(async () => { second.finish(); await second.promise; });
      expect(pause.mock.instances).not.toContain(media);
      fireEvent.pointerEnter(preview);
      fireEvent.blur(button);
      expect(pause.mock.instances).not.toContain(media);
      fireEvent.pointerLeave(preview);
      expect(pause.mock.instances).toContain(media);
      expect(media.currentTime).toBe(0);
    });
  });

  it("does not let a retired lifetime pause the current video when its media element is reused", async () => {
    const first = deferredPlay(), second = deferredPlay();
    const play = vi.mocked(HTMLMediaElement.prototype.play), pause = vi.mocked(HTMLMediaElement.prototype.pause);
    play.mockImplementationOnce(() => first.promise).mockImplementationOnce(() => second.promise);
    const view = renderWithIntl(<MediaAssetCard asset={{ ...asset, type: "video" }} onSelect={vi.fn()} />);
    const media = view.container.querySelector("video")!;
    fireEvent.pointerEnter(media.parentElement!);
    view.rerender(<MediaAssetCard asset={{ ...asset, type: "video", version: 2 }} onSelect={vi.fn()} />);
    expect(view.container.querySelector("video")).toBe(media);
    pause.mockClear(); media.currentTime = 1;
    await act(async () => { first.finish(); await first.promise; });
    expect(pause.mock.instances).not.toContain(media);
    expect(media.currentTime).toBe(1);
    await act(async () => { second.finish(); await second.promise; });
    expect(pause.mock.instances).not.toContain(media);
    fireEvent.pointerLeave(media.parentElement!);
    expect(media.currentTime).toBe(0);
  });
});

it("uses independent history-style file skeletons without nested retry buttons in asset selectors", () => {
 const select=vi.fn();
 const view=renderWithIntl(<MediaAssetCard asset={{...asset,type:"image",url:"/asset-image.png"}} onSelect={select}/>);
 expect(view.container.querySelector("[data-media-preview-loading]")).toBeInTheDocument();
 fireEvent.load(view.container.querySelector("img")!);
 expect(view.container.querySelector("[data-media-preview-loading]")).not.toBeInTheDocument();
 view.rerender(<MediaAssetCard asset={{...asset,type:"image",url:"/other-image.png"}} onSelect={select}/>);
 expect(view.container.querySelector("[data-media-preview-loading]")).toBeInTheDocument();
 fireEvent.error(view.container.querySelector("img")!);
 expect(view.container.querySelector("[data-media-preview-loading]")).not.toBeInTheDocument();
 expect(screen.queryByRole("button",{name:"다시 시도"})).not.toBeInTheDocument();
 expect(view.container.querySelector("button button")).toBeNull();
 fireEvent.click(screen.getByRole("button",{name:asset.name}));expect(select).toHaveBeenCalledOnce();
});
