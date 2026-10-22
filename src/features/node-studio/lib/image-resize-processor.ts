/* Resize geometry adapted from Node Banana's utils/imageResize.ts.
 * MIT License
 * Copyright (c) 2026 William Falloon
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 */

import { allowedMediaMimeTypes } from "@/shared/media-assets/media-asset-contract";
import type { BrowserMediaOperationPlan } from "../model/node-execution-types";
import type { BrowserMediaOperationOutput } from "./browser-media-operation-runner";

// Match the existing server's browser-image operation capability bounds.
export const SPACE_IMAGE_RESIZE_LIMITS = { bytes: 25 * 1024 * 1024, edge: 8192, pixels: 32 * 1024 * 1024 } as const;
const outputMimes = new Set(["image/png", "image/jpeg", "image/webp"]);
const sourceMimes: ReadonlySet<string> = new Set(allowedMediaMimeTypes.image);

function assertDimensions(width: number | null, height: number | null, output = false) {
  if (!Number.isInteger(width) || !Number.isInteger(height) || (width ?? 0) < 1 || (height ?? 0) < 1
    || (width ?? 0) > SPACE_IMAGE_RESIZE_LIMITS.edge || (height ?? 0) > SPACE_IMAGE_RESIZE_LIMITS.edge
    || (width ?? 0) * (height ?? 0) > SPACE_IMAGE_RESIZE_LIMITS.pixels) {
    throw new Error(output ? "IMAGE_RESIZE_OUTPUT_LIMIT_EXCEEDED" : "IMAGE_RESIZE_SOURCE_LIMIT_EXCEEDED");
  }
}

function finite(value: unknown, fallback: number) {
  if (value === undefined) return fallback;
  if (typeof value !== "number" || !Number.isFinite(value)) throw new Error("IMAGE_RESIZE_PARAMETERS_INVALID");
  return value;
}

function options(parameters: BrowserMediaOperationPlan["parameters"]) {
  const mode = parameters.mode ?? "exact", fit = parameters.fit ?? "contain", format = parameters.format ?? "png";
  if (!["exact", "maxEdge", "scale"].includes(String(mode)) || !["contain", "cover", "stretch"].includes(String(fit))
    || !["keep", "png", "jpeg", "webp"].includes(String(format))
    || (parameters.padColor !== undefined && (typeof parameters.padColor !== "string" || !parameters.padColor.length || parameters.padColor.length > 64))) {
    throw new Error("IMAGE_RESIZE_PARAMETERS_INVALID");
  }
  const result = { mode, fit, format, padColor: parameters.padColor as string | undefined ?? "#00000000",
    width: finite(parameters.width, 128), height: finite(parameters.height, 128), maxEdge: finite(parameters.maxEdge, 128),
    scalePct: finite(parameters.scalePct, 100), quality: finite(parameters.quality, 0.9) };
  if ([result.width, result.height, result.maxEdge, result.scalePct].some(value => value <= 0)) throw new Error("IMAGE_RESIZE_PARAMETERS_INVALID");
  return result;
}

function targetSize(width: number, height: number, opts: ReturnType<typeof options>) {
  let w: number, h: number;
  if (opts.mode === "exact") { w = Math.round(opts.width); h = Math.round(opts.height); }
  else {
    const scale = opts.mode === "maxEdge" ? Math.min(1, opts.maxEdge / Math.max(width, height)) : Math.max(0.01, opts.scalePct / 100);
    w = Math.round(width * scale); h = Math.round(height * scale);
  }
  w = Math.max(1, w); h = Math.max(1, h);
  const scale = Math.min(1, SPACE_IMAGE_RESIZE_LIMITS.edge / Math.max(w, h));
  const target = { width: Math.max(1, Math.round(w * scale)), height: Math.max(1, Math.round(h * scale)) };
  assertDimensions(target.width, target.height, true);
  return target;
}

/** The shared runner replaces signed URLs with the owner-authenticated content endpoint. */
async function sourceBlob(source: BrowserMediaOperationPlan["inputs"][number], signal: AbortSignal) {
  const response = await fetch(source.url, { signal, credentials: "same-origin", redirect: "error", cache: "no-store" });
  const mime = response.headers.get("content-type")?.split(";")[0].trim().toLowerCase() || source.mimeType;
  const declared = Number(response.headers.get("content-length"));
  if (!response.ok || !response.body || !sourceMimes.has(mime) || declared > SPACE_IMAGE_RESIZE_LIMITS.bytes || signal.aborted) {
    void response.body?.cancel().catch(() => undefined);
    signal.throwIfAborted();
    throw new Error(!response.ok ? "IMAGE_RESIZE_SOURCE_FETCH_FAILED" : declared > SPACE_IMAGE_RESIZE_LIMITS.bytes
      ? "IMAGE_RESIZE_SOURCE_LIMIT_EXCEEDED" : "IMAGE_RESIZE_SOURCE_INVALID");
  }
  const reader = response.body.getReader(), chunks: ArrayBuffer[] = [];
  let bytes = 0;
  const abort = () => { void reader.cancel().catch(() => undefined); };
  signal.addEventListener("abort", abort, { once: true });
  try {
    while (true) {
      signal.throwIfAborted();
      const { value, done } = await reader.read();
      signal.throwIfAborted();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > SPACE_IMAGE_RESIZE_LIMITS.bytes) throw new Error("IMAGE_RESIZE_SOURCE_LIMIT_EXCEEDED");
      chunks.push(new Uint8Array(value).buffer);
    }
    if (!bytes) throw new Error("IMAGE_RESIZE_SOURCE_INVALID");
    return new Blob(chunks, { type: mime });
  } finally {
    signal.removeEventListener("abort", abort);
    void reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}

function loadImage(image: HTMLImageElement, url: string, signal: AbortSignal): Promise<void> {
  signal.throwIfAborted();
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (error?: unknown) => {
      if (settled) return;
      settled = true;
      signal.removeEventListener("abort", abort);
      image.onload = null; image.onerror = null;
      if (error) { image.removeAttribute("src"); reject(error); } else resolve();
    };
    const abort = () => finish(signal.reason ?? new DOMException("Image resize cancelled", "AbortError"));
    image.onload = () => finish();
    image.onerror = () => finish(new Error("IMAGE_RESIZE_DECODE_FAILED"));
    signal.addEventListener("abort", abort, { once: true });
    try { image.src = url; } catch (error) { finish(error); }
    if (signal.aborted) abort();
  });
}

function encode(canvas: HTMLCanvasElement, mime: string, quality: number, signal: AbortSignal): Promise<Blob> {
  signal.throwIfAborted();
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (blob?: Blob | null, error?: unknown) => {
      if (settled) return;
      settled = true;
      signal.removeEventListener("abort", abort);
      if (error) reject(error);
      else if (!blob?.size || !outputMimes.has(blob.type)) reject(new Error("IMAGE_RESIZE_ENCODE_FAILED"));
      else resolve(blob);
    };
    const abort = () => finish(null, signal.reason ?? new DOMException("Image resize cancelled", "AbortError"));
    signal.addEventListener("abort", abort, { once: true });
    try { canvas.toBlob(blob => finish(blob), mime, mime === "image/png" ? undefined : Math.max(0, Math.min(1, quality))); }
    catch (error) { finish(null, error); }
    if (signal.aborted) abort();
  });
}

/** Only the active Resize leaf. Upload/provenance, progress publication and the 120s timeout belong to the runner. */
export async function processSpaceImageResize({ plan, signal, onProgress }: {
  plan: BrowserMediaOperationPlan; signal: AbortSignal; onProgress: (progress: number) => void;
}): Promise<{ outputs: BrowserMediaOperationOutput[] }> {
  signal.throwIfAborted();
  if (plan.kind !== "edit.image.resize" || plan.inputs.length !== 1 || plan.expectedOutputCount !== 1
    || plan.outputMediaType !== "image" || plan.outputPortId !== "image") throw new Error("IMAGE_RESIZE_PLAN_INVALID");
  const source = plan.inputs[0], bytes = Number(source.bytes), opts = options(plan.parameters);
  if (source.type !== "image" || source.portId !== "image" || !sourceMimes.has(source.mimeType)) throw new Error("IMAGE_RESIZE_SOURCE_INVALID");
  if (!Number.isSafeInteger(bytes) || bytes <= 0 || bytes > SPACE_IMAGE_RESIZE_LIMITS.bytes) throw new Error("IMAGE_RESIZE_SOURCE_LIMIT_EXCEEDED");
  assertDimensions(source.width, source.height);
  onProgress(5);
  let image: HTMLImageElement | undefined, canvas: HTMLCanvasElement | undefined, url: string | undefined;
  try {
    const blob = await sourceBlob(source, signal);
    signal.throwIfAborted(); onProgress(30);
    url = URL.createObjectURL(blob); image = new Image();
    await loadImage(image, url, signal);
    signal.throwIfAborted();
    assertDimensions(image.naturalWidth, image.naturalHeight);
    const target = targetSize(image.naturalWidth, image.naturalHeight, opts);
    onProgress(45); signal.throwIfAborted();
    canvas = document.createElement("canvas"); canvas.width = target.width; canvas.height = target.height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("IMAGE_RESIZE_CANVAS_UNAVAILABLE");
    if (opts.fit === "contain" && opts.padColor !== "#00000000" && opts.padColor !== "transparent") {
      context.fillStyle = opts.padColor; context.fillRect(0, 0, target.width, target.height);
    }
    context.imageSmoothingEnabled = true; context.imageSmoothingQuality = "high";
    signal.throwIfAborted();
    if (opts.fit === "stretch") context.drawImage(image, 0, 0, target.width, target.height);
    else {
      const scale = (opts.fit === "contain" ? Math.min : Math.max)(target.width / image.naturalWidth, target.height / image.naturalHeight);
      const width = image.naturalWidth * scale, height = image.naturalHeight * scale;
      context.drawImage(image, (target.width - width) / 2, (target.height - height) / 2, width, height);
    }
    signal.throwIfAborted(); onProgress(70);
    const mime = opts.format === "keep" ? (outputMimes.has(blob.type) ? blob.type : "image/png") : `image/${opts.format}`;
    const output = await encode(canvas, mime, opts.quality, signal);
    signal.throwIfAborted(); onProgress(90); signal.throwIfAborted();
    const extension = output.type === "image/jpeg" ? "jpg" : output.type.split("/")[1];
    return { outputs: [{ blob: output, mimeType: output.type, fileName: `leesfield-resize.${extension}`, sortOrder: 0 }] };
  } finally {
    if (image) { image.onload = null; image.onerror = null; image.removeAttribute("src"); }
    if (url) URL.revokeObjectURL(url);
    if (canvas) { canvas.width = 0; canvas.height = 0; }
  }
}
