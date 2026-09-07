import { describe, expect, it } from "vitest";
import type { FileResponse } from "leemage-sdk";
import { imageUrlsFor } from "@/shared/media-assets/image-variants";
import { detectImageAnimation, imageUploadOptions, mapUploadedImage } from "./image-upload-policy";
const original = { url: "https://media.test/original.png", format: "png", size: 1000, width: 1200, height: 800, label: "1200x800" };
const display = { ...original, url: "https://media.test/full.webp", format: "webp", size: 300 };
const thumbnail = { ...display, url: "https://media.test/thumb.webp", size: 30, width: 480, height: 320, label: "thumbnail" };
const file = { id: "file", url: original.url, mimeType: "image/png", size: original.size, variants: [thumbnail, display, original], thumbnail } as FileResponse;
describe("image upload policy", () => {
  it("applies source WebP only to images without sharing mutable options", () => {
    expect(imageUploadOptions("image/png")).toEqual({ variants: [{ sizeLabel: "source", format: "webp" }] });
    expect(imageUploadOptions("video/mp4")).toEqual({});
    expect(imageUploadOptions("audio/wav")).toEqual({});
    expect(imageUploadOptions("image/png").variants).not.toBe(imageUploadOptions("image/png").variants);
  });
  it("keeps original metadata and selects roles despite shuffled variants", () => {
    const mapped = mapUploadedImage(file, { isAnimated: false });
    expect(mapped).toMatchObject({ url: original.url, bytes: 1000, mimeType: "image/png", imageVariants: { display: { url: display.url, bytes: 300 }, thumbnail: { url: thumbnail.url, bytes: 30 } } });
    expect(imageUrlsFor(mapped, "list")).toEqual([thumbnail.url, display.url, original.url]);
    expect(imageUrlsFor(mapped, "display")).toEqual([display.url, original.url]);
    expect(imageUrlsFor(mapped, "original")).toEqual([original.url]);
  });
  it("supports shared small-image versions and originals already in WebP", () => {
    const small = { ...thumbnail, width: 200, height: 100 };
    const mapped = mapUploadedImage({ ...file, thumbnail: small, variants: [small, { ...original, width: 200, height: 100 }] }, { isAnimated: false });
    expect(imageUrlsFor(mapped, "list")).toEqual([small.url, original.url]);
    const webp = mapUploadedImage({ ...file, mimeType: "image/webp", url: display.url, variants: [display], thumbnail: undefined }, { isAnimated: false });
    expect(imageUrlsFor(webp, "display")).toEqual([display.url]);
  });
  it("accepts an oriented full-size version and preserves unknown animation", () => {
    const mapped = mapUploadedImage({ ...file, variants: [original, { ...display, width: 800, height: 1200 }] });
    expect(mapped.imageVariants?.display?.url).toBe(display.url);
    expect(imageUrlsFor(mapped, "display")).toEqual([original.url]);
    expect(imageUrlsFor({ url: original.url, imageVariants: { invalid: true } }, "list")).toEqual([original.url]);
  });
  it("detects animated WebP and treats unknown formats conservatively", () => {
    const bytes = new Uint8Array(30); bytes.set(new TextEncoder().encode("RIFF"), 0); bytes.set(new TextEncoder().encode("WEBPVP8X"), 8);
    expect(detectImageAnimation(bytes, "image/webp")).toBe(false);
    bytes[20] = 2; expect(detectImageAnimation(bytes, "image/webp")).toBe(true);
    expect(detectImageAnimation(bytes, "image/gif")).toBeNull();
  });
});
