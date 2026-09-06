import { afterEach, describe, expect, it, vi } from "vitest";
import { downloadMedia as hostDownload } from "@node-banana-runtime/upstream-node-host";
import { downloadMedia as upstreamDownload } from "@node-banana-runtime/../utils/downloadMedia";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe.each([["host", hostDownload], ["upstream", upstreamDownload]] as const)("%s download filename", (_name, download) => {
  it.each([["image", "png"], ["video", "mp4"], ["audio", "mp3"]] as const)("brands %s downloads", async (media, extension) => {
    vi.useFakeTimers();
    vi.spyOn(Date, "now").mockReturnValue(1234);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, blob: async () => new Blob(["test"], { type: media + "/" + extension }) }));
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:test");
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
    let filename = "";
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) { filename = this.download; });
    await download("https://example.test/result." + extension, media);
    expect(filename).toBe("leesfield-1234." + extension);
    vi.runAllTimers();
  });
});
