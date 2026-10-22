// @vitest-environment node
import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { buildMediaZip, MEDIA_ZIP_MAX_BYTES } from "./media-zip-download";

// Independent STORE ZIP reader: do not validate JSZip with JSZip itself.
function entries(buffer: ArrayBuffer) {
  const view = new DataView(buffer);
  const end = buffer.byteLength - 22;
  expect(view.getUint32(end, true)).toBe(0x06054b50);
  const count = view.getUint16(end + 10, true);
  const result: { name: string; digest: string }[] = [];
  let offset = 0;
  for (let i = 0; i < count; i += 1) {
    expect(view.getUint32(offset, true)).toBe(0x04034b50);
    expect(view.getUint16(offset + 8, true)).toBe(0); // STORE, original bytes
    const size = view.getUint32(offset + 18, true);
    const nameSize = view.getUint16(offset + 26, true);
    const extraSize = view.getUint16(offset + 28, true);
    const start = offset + 30 + nameSize + extraSize;
    result.push({
      name: new TextDecoder().decode(buffer.slice(offset + 30, offset + 30 + nameSize)),
      digest: createHash("sha256").update(new Uint8Array(buffer, start, size)).digest("hex"),
    });
    offset = start + size;
  }
  expect(offset).toBe(view.getUint32(end + 16, true)); // central directory start
  return result;
}

describe("selected media ZIP", () => {
  it("preserves entry order, exact bytes, duplicate assets and MIME extensions", async () => {
    const fetchAsset = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response("original png", { headers: { "content-type": "image/png" } }))
      .mockResolvedValueOnce(new Response("original jpeg", { headers: { "content-type": "image/jpeg; charset=binary" } }))
      .mockResolvedValueOnce(new Response("original png", { headers: { "content-type": "image/png" } }));
    const signal = new AbortController().signal;
    const buffer = await buildMediaZip(["a", "b", "a"], signal, fetchAsset);
    expect(entries(buffer)).toEqual(["original png", "original jpeg", "original png"].map((bytes, index) => ({
      name: `leesfield-image-00${index + 1}.${index === 1 ? "jpg" : "png"}`,
      digest: createHash("sha256").update(bytes).digest("hex"),
    })));
    expect(fetchAsset.mock.calls.map(([url]) => url)).toEqual([
      "/api/media-assets/a/content", "/api/media-assets/b/content", "/api/media-assets/a/content",
    ]);
    expect(fetchAsset.mock.calls[0][1]).toMatchObject({ signal, credentials: "same-origin", redirect: "error" });
  });

  it.each([[], Array(101).fill("asset"), ["https://other.example/image"], ["../secret"]])("rejects invalid selection before fetching (%j)", async (ids) => {
    const fetchAsset = vi.fn<typeof fetch>();
    await expect(buildMediaZip(ids, new AbortController().signal, fetchAsset)).rejects.toThrow();
    expect(fetchAsset).not.toHaveBeenCalled();
  });

  it.each([
    new Response("missing", { status: 404 }),
    new Response("html", { headers: { "content-type": "text/html" } }),
    new Response("", { headers: { "content-type": "image/png" } }),
    new Response("large", { headers: { "content-type": "image/png", "content-length": String(MEDIA_ZIP_MAX_BYTES + 1) } }),
  ])("rejects missing, unsupported, empty and declared-oversize assets", async (response) => {
    await expect(buildMediaZip(["a"], new AbortController().signal, vi.fn<typeof fetch>().mockResolvedValue(response))).rejects.toThrow();
  });

  it("enforces actual aggregate bytes even when Content-Length lies", async () => {
    const cancel = vi.fn();
    const body = new ReadableStream({ start(controller) {
      controller.enqueue(new Uint8Array(MEDIA_ZIP_MAX_BYTES + 1));
    }, cancel });
    const fetchAsset = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response("a", { headers: { "content-type": "image/png" } }))
      .mockResolvedValueOnce(new Response(body, { headers: { "content-type": "audio/wav", "content-length": "1" } }));
    await expect(buildMediaZip(["a", "b"], new AbortController().signal, fetchAsset)).rejects.toThrow("100 MiB");
    expect(cancel).toHaveBeenCalledOnce();
    expect(fetchAsset).toHaveBeenCalledTimes(2);
  });

  it("cancels a pending body read and never proceeds to the next file", async () => {
    const cancel = vi.fn();
    const controller = new AbortController();
    const fetchAsset = vi.fn<typeof fetch>().mockResolvedValue(new Response(new ReadableStream({ cancel }), {
      headers: { "content-type": "image/png" },
    }));
    const pending = buildMediaZip(["a", "b"], controller.signal, fetchAsset);
    await vi.waitFor(() => expect(fetchAsset).toHaveBeenCalledOnce());
    controller.abort();
    await expect(pending).rejects.toThrow();
    expect(cancel).toHaveBeenCalledOnce();
    expect(fetchAsset).toHaveBeenCalledOnce();
  });

  it("rejects an already cancelled request before any fetch", async () => {
    const controller = new AbortController();
    controller.abort();
    const fetchAsset = vi.fn<typeof fetch>();
    await expect(buildMediaZip(["a"], controller.signal, fetchAsset)).rejects.toThrow();
    expect(fetchAsset).not.toHaveBeenCalled();
  });

  it("stores every supported audio/video format and mixed duplicate occurrences without changing bytes", async () => {
    const formats = [
      ["image/png", "image", "png"], ["audio/wav", "audio", "wav"], ["audio/mpeg", "audio", "mp3"],
      ["audio/ogg", "audio", "ogg"], ["audio/flac", "audio", "flac"], ["audio/aac", "audio", "aac"],
      ["audio/mp4", "audio", "m4a"], ["video/mp4", "video", "mp4"], ["video/webm", "video", "webm"],
      ["video/quicktime", "video", "mov"], ["audio/wav", "audio", "wav"],
    ];
    const ids = formats.map((_, index) => index === formats.length - 1 ? "asset-1" : `asset-${index}`);
    const fetchAsset = vi.fn<typeof fetch>();
    for (const [index, [mime]] of formats.entries())
      fetchAsset.mockResolvedValueOnce(new Response(ids[index], { headers: { "content-type": mime + "; charset=binary" } }));
    const result = entries(await buildMediaZip(ids, new AbortController().signal, fetchAsset));
    expect(result).toEqual(formats.map(([, type, extension], index) => ({
      name: `leesfield-${type}-${String(index + 1).padStart(3, "0")}.${extension}`,
      digest: createHash("sha256").update(ids[index]).digest("hex"),
    })));
    expect(fetchAsset.mock.calls.at(-1)?.[0]).toBe("/api/media-assets/asset-1/content");
  });

  it("does not return a partial archive when a later mixed-media source is missing", async () => {
    const cancel = vi.fn(), fetchAsset = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response("audio", { headers: { "content-type": "audio/mpeg" } }))
      .mockResolvedValueOnce(new Response(new ReadableStream({ cancel }), { status: 404 }));
    await expect(buildMediaZip(["audio", "video"], new AbortController().signal, fetchAsset)).rejects.toThrow("404");
    expect(fetchAsset).toHaveBeenCalledTimes(2); expect(cancel).toHaveBeenCalledOnce();
  });
});
