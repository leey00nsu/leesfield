import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { BrowserMediaOperationPlan } from "../model/node-execution-types";
import { processSpaceImageResize, SPACE_IMAGE_RESIZE_LIMITS } from "./image-resize-processor";

function plan(parameters: BrowserMediaOperationPlan["parameters"] = {}): BrowserMediaOperationPlan {
  return { kind: "edit.image.resize", parameters: { mode: "exact", width: 100, height: 100, maxEdge: 128, scalePct: 100,
    fit: "contain", padColor: "#00000000", format: "png", quality: 0.9, ...parameters },
  inputs: [{ assetId: "source", portId: "image", sortOrder: 0, type: "image", mimeType: "image/png", bytes: "128",
    width: 400, height: 200, durationMs: null, url: "/api/media-assets/source/content" }],
  outputPortId: "image", outputMediaType: "image", expectedOutputCount: 1 };
}

const context = { drawImage: vi.fn(), fillRect: vi.fn(), fillStyle: "", imageSmoothingEnabled: false, imageSmoothingQuality: "low" };
let images: HTMLImageElement[], canvases: HTMLCanvasElement[], encoded: Array<{ width: number; height: number; mime: string; quality?: number }>;
let dimensions: { width: number; height: number }, autoLoad: boolean, decodeError: boolean, holdEncode: boolean, nullBlob: boolean;
let lateLoad: ((this: GlobalEventHandlers, event: Event) => unknown) | null, lateEncode: BlobCallback | null;
let fetchSource: ReturnType<typeof vi.fn<typeof fetch>>;

function run(nextPlan = plan(), controller = new AbortController(), onProgress = vi.fn()) {
  return { work: processSpaceImageResize({ plan: nextPlan, signal: controller.signal, onProgress }), controller, onProgress };
}
beforeEach(() => {
  images = []; canvases = []; encoded = []; dimensions = { width: 400, height: 200 }; autoLoad = true; decodeError = false;
  holdEncode = false; nullBlob = false; lateLoad = null; lateEncode = null;
  context.drawImage.mockReset(); context.fillRect.mockReset(); context.fillStyle = "";
  fetchSource = vi.fn<typeof fetch>().mockImplementation(async () => new Response(new Uint8Array([1, 2, 3]), { headers: { "content-type": "image/png" } }));
  vi.stubGlobal("fetch", fetchSource);
  vi.stubGlobal("URL", class extends URL {
    static createObjectURL = vi.fn(() => "blob:resize-source");
    static revokeObjectURL = vi.fn();
  });
  vi.stubGlobal("Image", function () {
    const image = document.createElement("img"); images.push(image);
    Object.defineProperties(image, {
      naturalWidth: { get: () => dimensions.width }, naturalHeight: { get: () => dimensions.height },
      src: { get: () => image.getAttribute("src") ?? "", set: (value: string) => {
        image.setAttribute("src", value); lateLoad = image.onload;
        if (autoLoad) queueMicrotask(() => { (decodeError ? image.onerror : image.onload)?.call(image, new Event(decodeError ? "error" : "load")); });
      } },
    });
    return image;
  });
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(function (this: HTMLCanvasElement) {
    canvases.push(this); return context as unknown as CanvasRenderingContext2D;
  });
  vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation(function (this: HTMLCanvasElement, callback, mime, quality) {
    encoded.push({ width: this.width, height: this.height, mime: mime ?? "image/png", quality }); lateEncode = callback;
    if (!holdEncode) callback(nullBlob ? null : new Blob(["encoded-bitmap"], { type: mime }));
  });
  vi.spyOn(HTMLCanvasElement.prototype, "toDataURL").mockImplementation(() => { throw new Error("Unexpected data URL conversion"); });
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("processSpaceImageResize", () => {
  it.each([
    ["contain", [0, 25, 100, 50]], ["cover", [-50, 0, 200, 100]], ["stretch", [0, 0, 100, 100]],
  ] as const)("centers the source with %s fit inside the exact output rectangle", async (fit, rectangle) => {
    const operation = run(plan({ fit, padColor: "#ffffff" }));
    const { outputs } = await operation.work;
    expect(encoded).toEqual([{ width: 100, height: 100, mime: "image/png", quality: undefined }]);
    expect(context.drawImage).toHaveBeenCalledExactlyOnceWith(images[0], ...rectangle);
    expect(context.fillRect.mock.calls).toEqual(fit === "contain" ? [[0, 0, 100, 100]] : []);
    expect(context.imageSmoothingEnabled).toBe(true); expect(context.imageSmoothingQuality).toBe("high");
    expect(outputs).toEqual([{ blob: expect.any(Blob), fileName: "leesfield-resize.png", mimeType: "image/png", sortOrder: 0 }]);
    expect(outputs[0].blob.size).toBe("encoded-bitmap".length);
    expect(operation.onProgress.mock.calls.flat()).toEqual([5, 30, 45, 70, 90]);
    expect(fetchSource).toHaveBeenCalledExactlyOnceWith("/api/media-assets/source/content", expect.objectContaining({
      signal: operation.controller.signal, credentials: "same-origin", redirect: "error", cache: "no-store",
    }));
    expect(URL.revokeObjectURL).toHaveBeenCalledExactlyOnceWith("blob:resize-source");
    expect(images[0].hasAttribute("src")).toBe(false); expect(canvases[0].width).toBe(0); expect(canvases[0].height).toBe(0);
  });

  it.each(["transparent", "#00000000"])("preserves transparent padding for %s", async padColor => {
    await run(plan({ padColor })).work;
    expect(context.fillRect).not.toHaveBeenCalled();
  });

  it.each([
    [{ mode: "maxEdge", maxEdge: 100 }, 100, 50],
    [{ mode: "maxEdge", maxEdge: 2048 }, 400, 200],
    [{ mode: "scale", scalePct: 25 }, 100, 50],
    [{ mode: "scale", scalePct: 1 }, 4, 2],
    [{ mode: "exact", width: 16384, height: 8192 }, 8192, 4096],
  ])("computes bounded dimensions for %j", async (parameters, width, height) => {
    await run(plan(parameters)).work;
    expect(encoded[0]).toMatchObject({ width, height });
  });

  it("caps a large scale proportionally at 8192 without exceeding the server's pixel budget", async () => {
    dimensions = { width: 2000, height: 1000 };
    const next = plan({ mode: "scale", scalePct: 800 }); next.inputs[0] = { ...next.inputs[0], ...dimensions };
    await run(next).work;
    expect(encoded[0]).toMatchObject({ width: 8192, height: 4096 });
  });

  it.each([
    ["keep", "image/jpeg", "image/jpeg", "jpg"], ["keep", "image/webp", "image/webp", "webp"],
    ["keep", "image/png", "image/png", "png"], ["keep", "image/gif", "image/png", "png"],
    ["keep", "image/avif", "image/png", "png"], ["jpeg", "image/png", "image/jpeg", "jpg"],
    ["webp", "image/png", "image/webp", "webp"], ["png", "image/jpeg", "image/png", "png"],
  ])("encodes %s from %s as %s with a matching file name", async (format, sourceMime, mime, extension) => {
    const next = plan({ format, quality: 0.35 }); next.inputs[0].mimeType = sourceMime;
    fetchSource.mockResolvedValue(new Response("source", { headers: { "content-type": `${sourceMime}; charset=binary` } }));
    const result = await run(next).work;
    expect(encoded[0]).toMatchObject({ mime, quality: mime === "image/png" ? undefined : 0.35 });
    expect(result.outputs[0]).toMatchObject({ mimeType: mime, fileName: `leesfield-resize.${extension}` });
    expect(fetchSource).toHaveBeenCalledTimes(1);
  });

  it.each([[0, 0], [-1, 0], [2, 1]])("preserves/clamps quality %s to %s", async (quality, expected) => {
    await run(plan({ format: "webp", quality })).work;
    expect(encoded[0].quality).toBe(expected);
  });

  it("rejects retired operation plans without fetching or allocating media", async () => {
    await expect(run({ ...plan(), kind: "edit.image.splitGrid" }).work).rejects.toThrow("IMAGE_RESIZE_PLAN_INVALID");
    expect(fetchSource).not.toHaveBeenCalled(); expect(images).toHaveLength(0);
  });

  it.each([
    { bytes: String(SPACE_IMAGE_RESIZE_LIMITS.bytes + 1) }, { bytes: null }, { width: 8193 }, { width: 8192, height: 8192 },
  ])("rejects unsupported source metadata before download: %j", async metadata => {
    const next = plan(); Object.assign(next.inputs[0], metadata);
    await expect(run(next).work).rejects.toThrow("IMAGE_RESIZE_SOURCE_LIMIT_EXCEEDED");
    expect(fetchSource).not.toHaveBeenCalled();
  });

  it("checks decoded source dimensions instead of trusting plan metadata", async () => {
    dimensions = { width: 9000, height: 100 };
    await expect(run().work).rejects.toThrow("IMAGE_RESIZE_SOURCE_LIMIT_EXCEEDED");
    expect(canvases).toHaveLength(0); expect(URL.revokeObjectURL).toHaveBeenCalledOnce();
  });

  it("rejects an oversized output before allocating a canvas", async () => {
    await expect(run(plan({ width: 8192, height: 8192 })).work).rejects.toThrow("IMAGE_RESIZE_OUTPUT_LIMIT_EXCEEDED");
    expect(canvases).toHaveLength(0); expect(URL.revokeObjectURL).toHaveBeenCalledOnce();
  });

  it.each([{ width: Number.NaN }, { scalePct: 0 }, { mode: "unknown" }])("rejects malformed parameters: %j", async parameters => {
    await expect(run(plan(parameters)).work).rejects.toThrow("IMAGE_RESIZE_PARAMETERS_INVALID");
    expect(fetchSource).not.toHaveBeenCalled();
  });

  it.each([
    new Response("failure", { status: 403 }), new Response("not an image", { headers: { "content-type": "text/html" } }),
    new Response(null, { headers: { "content-type": "image/png" } }),
  ])("rejects a failed, non-image or empty source response", async response => {
    fetchSource.mockResolvedValue(response);
    await expect(run().work).rejects.toThrow(/IMAGE_RESIZE_SOURCE_(FETCH_FAILED|INVALID)/);
    expect(images).toHaveLength(0);
  });

  it("cancels an excessive declared body before reading it", async () => {
    const cancel = vi.fn(), stream = new ReadableStream<Uint8Array>({ cancel });
    fetchSource.mockResolvedValue(new Response(stream, { headers: { "content-type": "image/png", "content-length": String(SPACE_IMAGE_RESIZE_LIMITS.bytes + 1) } }));
    await expect(run().work).rejects.toThrow("IMAGE_RESIZE_SOURCE_LIMIT_EXCEEDED");
    expect(cancel).toHaveBeenCalledOnce(); expect(stream.locked).toBe(false);
  });

  it("bounds streaming bytes even without a trustworthy content length and releases the reader", async () => {
    const cancel = vi.fn(), stream = new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(new Uint8Array(SPACE_IMAGE_RESIZE_LIMITS.bytes + 1)); }, cancel });
    fetchSource.mockResolvedValue(new Response(stream, { headers: { "content-type": "image/png", "content-length": "1" } }));
    await expect(run().work).rejects.toThrow("IMAGE_RESIZE_SOURCE_LIMIT_EXCEEDED");
    expect(cancel).toHaveBeenCalledOnce(); expect(stream.locked).toBe(false); expect(images).toHaveLength(0);
  });

  it("cancels a pending source read and does not decode a partial image", async () => {
    const cancel = vi.fn(), stream = new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(new Uint8Array([1])); }, cancel });
    fetchSource.mockResolvedValue(new Response(stream, { headers: { "content-type": "image/png" } }));
    const operation = run(), result = expect(operation.work).rejects.toMatchObject({ name: "AbortError" });
    await vi.waitFor(() => expect(stream.locked).toBe(true)); operation.controller.abort(); await result;
    expect(cancel).toHaveBeenCalledOnce(); expect(stream.locked).toBe(false); expect(images).toHaveLength(0);
  });

  it("aborts an image load, revokes its URL and ignores a late load callback", async () => {
    autoLoad = false;
    const operation = run(), result = expect(operation.work).rejects.toMatchObject({ name: "AbortError" });
    await vi.waitFor(() => expect(images).toHaveLength(1)); const callback = lateLoad;
    operation.controller.abort(); await result; callback?.call(images[0], new Event("load"));
    expect(images[0].onload).toBeNull(); expect(images[0].onerror).toBeNull(); expect(images[0].hasAttribute("src")).toBe(false);
    expect(URL.revokeObjectURL).toHaveBeenCalledOnce(); expect(canvases).toHaveLength(0);
  });

  it("aborts a pending encode, releases the canvas and ignores a late blob callback", async () => {
    holdEncode = true;
    const operation = run(), result = expect(operation.work).rejects.toThrow("BROWSER_OPERATION_TIMEOUT");
    await vi.waitFor(() => expect(encoded).toHaveLength(1)); const callback = lateEncode;
    operation.controller.abort(new Error("BROWSER_OPERATION_TIMEOUT")); await result;
    callback?.(new Blob(["late"], { type: "image/png" }));
    expect(operation.onProgress.mock.calls.flat()).toEqual([5, 30, 45, 70]);
    expect(canvases[0].width).toBe(0); expect(canvases[0].height).toBe(0); expect(URL.revokeObjectURL).toHaveBeenCalledOnce();
  });

  it("stops canvas work when cancellation occurs while drawing", async () => {
    const controller = new AbortController(); context.drawImage.mockImplementation(() => controller.abort());
    await expect(run(plan(), controller).work).rejects.toMatchObject({ name: "AbortError" });
    expect(encoded).toHaveLength(0); expect(canvases[0].width).toBe(0); expect(URL.revokeObjectURL).toHaveBeenCalledOnce();
  });

  it("does no work with an already-aborted signal", async () => {
    const controller = new AbortController(); controller.abort();
    await expect(run(plan(), controller).work).rejects.toMatchObject({ name: "AbortError" });
    expect(fetchSource).not.toHaveBeenCalled();
  });

  it("cleans up after decode failure", async () => {
    decodeError = true;
    await expect(run().work).rejects.toThrow("IMAGE_RESIZE_DECODE_FAILED");
    expect(URL.revokeObjectURL).toHaveBeenCalledOnce(); expect(images[0].hasAttribute("src")).toBe(false);
  });

  it("cleans up when the canvas is unavailable", async () => {
    vi.mocked(HTMLCanvasElement.prototype.getContext).mockReturnValue(null);
    await expect(run().work).rejects.toThrow("IMAGE_RESIZE_CANVAS_UNAVAILABLE");
    expect(URL.revokeObjectURL).toHaveBeenCalledOnce();
  });

  it("cleans up when drawing throws or the encoder returns no bitmap", async () => {
    context.drawImage.mockImplementationOnce(() => { throw new Error("draw failed"); });
    await expect(run().work).rejects.toThrow("draw failed");
    expect(canvases[0].width).toBe(0);
    nullBlob = true;
    await expect(run().work).rejects.toThrow("IMAGE_RESIZE_ENCODE_FAILED");
    expect(canvases[1].width).toBe(0); expect(URL.revokeObjectURL).toHaveBeenCalledTimes(2);
  });
});
