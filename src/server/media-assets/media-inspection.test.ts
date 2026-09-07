import { describe, expect, it, vi } from "vitest";

import { MediaVerificationError } from "./media-asset-errors";
import { inspectMediaUrl, mediaInspectionInternals } from "./media-inspection";

function png(width: number, height: number) {
  const bytes = new Uint8Array(33);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  bytes.set([0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52], 8);
  const view = new DataView(bytes.buffer);
  view.setUint32(16, width);
  view.setUint32(20, height);
  return bytes;
}

describe("media inspection", () => {
  it("detects magic bytes and image dimensions without trusting response headers", async () => {
    const fetchImpl = vi.fn(async () => new Response(png(640, 360), {
      status: 206,
      headers: { "Content-Type": "application/octet-stream" },
    }));

    await expect(
      inspectMediaUrl(
        { url: "https://storage.example/file", expectedType: "image", declaredMimeType: "image/png" },
        fetchImpl as typeof fetch,
      ),
    ).resolves.toEqual({
      detectedMimeType: "image/png",
      width: 640,
      height: 360,
      durationMs: null,
      isAnimated: null,
    });
    expect(fetchImpl).toHaveBeenCalledWith(
      "https://storage.example/file",
      expect.objectContaining({ headers: { Range: "bytes=0-1048575" }, signal: expect.any(AbortSignal) }),
    );
  });

  it("rejects a declared type that disagrees with file magic", async () => {
    const fetchImpl = vi.fn(async () => new Response(png(1, 1), { status: 200 }));
    await expect(
      inspectMediaUrl(
        { url: "https://storage.example/file", expectedType: "video", declaredMimeType: "video/mp4" },
        fetchImpl as typeof fetch,
      ),
    ).rejects.toBeInstanceOf(MediaVerificationError);
  });

  it("reads WAV and MP4 v1 duration metadata from their canonical offsets", () => {
    const wav = new Uint8Array(48);
    wav.set(new TextEncoder().encode("RIFF"), 0);
    wav.set(new TextEncoder().encode("WAVEfmt "), 8);
    const wavView = new DataView(wav.buffer);
    wavView.setUint32(16, 16, true);
    wavView.setUint32(28, 48_000, true);
    wav.set(new TextEncoder().encode("data"), 36);
    wavView.setUint32(40, 96_000, true);
    expect(mediaInspectionInternals.durationMs(wav, "audio/wav")).toBe(2_000);

    const mp4 = new Uint8Array(64);
    mp4.set(new TextEncoder().encode("mvhd"), 8);
    mp4[12] = 1;
    const mp4View = new DataView(mp4.buffer);
    mp4View.setUint32(32, 1_000);
    mp4View.setUint32(36, 0);
    mp4View.setUint32(40, 12_345);
    expect(mediaInspectionInternals.durationMs(mp4, "video/mp4")).toBe(12_345);
  });
});
