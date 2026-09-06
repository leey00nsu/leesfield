// @vitest-environment node
import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { buildImageZip, IMAGE_ZIP_MAX_BYTES, selectedImageAssetIds } from "./image-zip-download";
import type { NodeBananaRuntimeGraph } from "@node-banana-runtime/runtime-entry";

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

describe("selected image ZIP", () => {
  it("preserves entry order, exact bytes, duplicate assets and MIME extensions", async () => {
    const fetchAsset = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response("original png", { headers: { "content-type": "image/png" } }))
      .mockResolvedValueOnce(new Response("original jpeg", { headers: { "content-type": "image/jpeg; charset=binary" } }))
      .mockResolvedValueOnce(new Response("original png", { headers: { "content-type": "image/png" } }));
    const signal = new AbortController().signal;
    const buffer = await buildImageZip(["a", "b", "a"], signal, fetchAsset);
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
    await expect(buildImageZip(ids, new AbortController().signal, fetchAsset)).rejects.toThrow();
    expect(fetchAsset).not.toHaveBeenCalled();
  });

  it.each([
    new Response("missing", { status: 404 }),
    new Response("audio", { headers: { "content-type": "audio/wav" } }),
    new Response("", { headers: { "content-type": "image/png" } }),
    new Response("large", { headers: { "content-type": "image/png", "content-length": String(IMAGE_ZIP_MAX_BYTES + 1) } }),
  ])("rejects missing, unsupported, empty and declared-oversize assets", async (response) => {
    await expect(buildImageZip(["a"], new AbortController().signal, vi.fn<typeof fetch>().mockResolvedValue(response))).rejects.toThrow();
  });

  it("enforces actual aggregate bytes even when Content-Length lies", async () => {
    const cancel = vi.fn();
    const body = new ReadableStream({ start(controller) {
      controller.enqueue(new Uint8Array(IMAGE_ZIP_MAX_BYTES + 1));
    }, cancel });
    const fetchAsset = vi.fn<typeof fetch>().mockResolvedValue(new Response(body, {
      headers: { "content-type": "image/png", "content-length": "1" },
    }));
    await expect(buildImageZip(["a"], new AbortController().signal, fetchAsset)).rejects.toThrow("100 MiB");
    expect(cancel).toHaveBeenCalledOnce();
  });

  it("cancels a pending body read and never proceeds to the next file", async () => {
    const cancel = vi.fn();
    const controller = new AbortController();
    const fetchAsset = vi.fn<typeof fetch>().mockResolvedValue(new Response(new ReadableStream({ cancel }), {
      headers: { "content-type": "image/png" },
    }));
    const pending = buildImageZip(["a", "b"], controller.signal, fetchAsset);
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
    await expect(buildImageZip(["a"], controller.signal, fetchAsset)).rejects.toThrow();
    expect(fetchAsset).not.toHaveBeenCalled();
  });

  it("matches upstream eligible node types and filters paused output connections", () => {
    const graph: NodeBananaRuntimeGraph = {
      nodes: [
        { id: "input", type: "canonicalNode", position: { x: 0, y: 0 }, data: { canonicalKind: "input.image", config: { assetId: "a" } } },
        { id: "generated", type: "generationNode", position: { x: 0, y: 0 }, data: { canonicalKind: "generate.image", selectedOutputAssetId: "b" } },
        { id: "resize", type: "canonicalNode", position: { x: 0, y: 0 }, data: { canonicalKind: "edit.image.resize", selectedOutputAssetId: "c" } },
        { id: "output", type: "canonicalNode", position: { x: 0, y: 0 }, data: { canonicalKind: "output.single" } },
      ],
      edges: [{ id: "edge", source: "input", target: "output", targetHandle: "image", data: {} }],
    };
    const selection = ["output", "resize", "generated", "input"];
    expect(selectedImageAssetIds(graph, selection)).toEqual(["a", "b", "a"]);
    expect(selectedImageAssetIds({ ...graph, edges: [{ ...graph.edges[0], data: { hasPause: true } }] }, selection)).toEqual(["a", "b"]);
  });

  it("does not export a hidden local image from an empty connected Ref, but preserves Split cell assets", () => {
    const graph: NodeBananaRuntimeGraph = {
      nodes: [
        { id: "source", type: "generationNode", position: { x: 0, y: 0 }, data: { canonicalKind: "generate.image" } },
        { id: "input", type: "canonicalNode", position: { x: 0, y: 0 }, data: { canonicalKind: "input.image", config: { assetId: "hidden-local" } } },
      ],
      edges: [{ id: "ref", source: "source", target: "input", targetHandle: "reference", data: { targetPortId: "reference" } }],
    };
    expect(selectedImageAssetIds(graph, ["input"])).toEqual([]);
    expect(selectedImageAssetIds({ ...graph, edges: [{ ...graph.edges[0], data: { ...graph.edges[0].data, hasPause: true } }] }, ["input"]))
      .toEqual(["hidden-local"]);
    graph.nodes[0].data.canonicalKind = "edit.image.splitGrid";
    expect(selectedImageAssetIds(graph, ["input"])).toEqual(["hidden-local"]);
  });

  it("does not export an image input hidden by a video Output selection", () => {
    const graph: NodeBananaRuntimeGraph = {
      nodes: [
        { id: "image", type: "canonicalNode", position: { x: 0, y: 0 }, data: { canonicalKind: "input.image", config: { assetId: "a" } } },
        { id: "output", type: "canonicalNode", position: { x: 0, y: 0 }, data: { canonicalKind: "output.single", config: { mediaType: "video" } } },
      ],
      edges: [{ id: "edge", source: "image", target: "output", targetHandle: "image", data: {} }],
    };
    expect(selectedImageAssetIds(graph, ["output"])).toEqual([]);
  });
});
