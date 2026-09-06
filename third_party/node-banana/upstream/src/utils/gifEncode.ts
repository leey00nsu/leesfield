/**
 * GIF encoding utilities using gifenc.
 *
 * Supports an optional target max size with auto-tune that progressively
 * lowers color count, then dimensions, then drops frames until the GIF
 * fits under the limit.
 */

import { GIFEncoder, quantize, applyPalette } from "gifenc";

export interface GifFrame {
  /** Frame source as a data URL or http(s) URL. */
  src: string;
}

export interface EncodeOptions {
  fps: number;
  loopCount: number;       // 0 = infinite
  colorCount: number;      // 2-256
  dither: boolean;
  /** When set, output will be auto-tuned to fit under this size. */
  targetMaxBytes?: number | null;
  onProgress?: (progress: number) => void;
}

export interface EncodeResult {
  dataUrl: string;
  bytes: number;
  width: number;
  height: number;
  frameCount: number;
  colorsUsed: number;
}

interface RawFrame {
  data: Uint8ClampedArray;
  width: number;
  height: number;
}

/**
 * Cap on the longest edge of the working GIF. Bounds encode time and memory:
 * a 4K frame is ~33MB of ImageData, so uncapped multi-frame encodes can hold
 * hundreds of MB live and freeze the UI for tens of seconds. GIFs are a
 * low-fidelity format, so downscaling past this is visually negligible.
 */
const MAX_EDGE = 1024;

/** Number of frames to process between yields to the event loop. */
const YIELD_EVERY = 2;

/** Yield to the event loop so pending paints (e.g. progress) can flush. */
function yieldToEventLoop(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

/**
 * Scale a width/height so the longest edge is at most MAX_EDGE, preserving
 * aspect ratio. Returns the original size when already within the cap.
 */
function capDimensions(
  width: number,
  height: number,
): { width: number; height: number } {
  const longest = Math.max(width, height);
  if (longest <= MAX_EDGE) return { width, height };
  const scale = MAX_EDGE / longest;
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Failed to load frame"));
    img.src = src;
  });
}

async function loadFrames(srcs: string[]): Promise<HTMLImageElement[]> {
  return Promise.all(srcs.map(loadImage));
}

function rasterize(
  imgs: HTMLImageElement[],
  width: number,
  height: number,
): RawFrame[] {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("Could not get canvas 2d context");

  const frames: RawFrame[] = [];
  for (const img of imgs) {
    // Fill with an opaque background before drawing. The rgb444 GIF path never
    // sets a transparent index, so any transparent padding would encode as
    // opaque black anyway — make that explicit so letterbox bars are intentional.
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, width, height);
    // Letterbox-fit each frame so all input sizes still produce a square GIF
    const srcAspect = img.naturalWidth / img.naturalHeight;
    const tgtAspect = width / height;
    let dw: number;
    let dh: number;
    if (srcAspect > tgtAspect) {
      dw = width;
      dh = width / srcAspect;
    } else {
      dh = height;
      dw = height * srcAspect;
    }
    const dx = (width - dw) / 2;
    const dy = (height - dh) / 2;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(img, dx, dy, dw, dh);
    const id = ctx.getImageData(0, 0, width, height);
    frames.push({ data: id.data, width, height });
  }
  return frames;
}

async function encodeGif(
  frames: RawFrame[],
  opts: { fps: number; loopCount: number; colorCount: number; dither: boolean },
): Promise<{ bytes: Uint8Array; colorsUsed: number }> {
  const enc = GIFEncoder();
  const delay = Math.max(2, Math.round(1000 / Math.max(1, opts.fps)));
  let colorsUsed = 0;

  for (let i = 0; i < frames.length; i++) {
    const frame = frames[i];
    const palette = quantize(frame.data, Math.max(2, Math.min(256, opts.colorCount)), {
      format: "rgb444",
    });
    colorsUsed = Math.max(colorsUsed, palette.length);
    const indexed = applyPalette(frame.data, palette, "rgb444");
    enc.writeFrame(indexed, frame.width, frame.height, {
      palette,
      delay,
      dispose: 2,
    });
    // Yield periodically so the main thread can paint (e.g. progress %).
    if ((i + 1) % YIELD_EVERY === 0 && i + 1 < frames.length) {
      await yieldToEventLoop();
    }
  }
  enc.finish();
  // gifenc embeds NETSCAPE loop chunk by default (looping). Loop count != 0 is
  // not supported via this minimal API path, so we honor 0 = infinite.
  return { bytes: enc.bytes(), colorsUsed };
}

function bytesToDataUrl(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return `data:image/gif;base64,${btoa(binary)}`;
}

export async function encodeFramesToGif(
  srcs: string[],
  opts: EncodeOptions,
): Promise<EncodeResult> {
  if (srcs.length === 0) throw new Error("No frames to encode");

  const imgs = await loadFrames(srcs);
  // Use the first frame's intrinsic size as the canvas size, capped so the
  // longest edge stays within MAX_EDGE to bound encode time and memory.
  const { width, height } = capDimensions(
    imgs[0].naturalWidth,
    imgs[0].naturalHeight,
  );

  const target = opts.targetMaxBytes ?? null;

  // Initial encode pass
  let workingFrames = rasterize(imgs, width, height);
  let workingWidth = width;
  let workingHeight = height;
  let colors = Math.max(2, Math.min(256, opts.colorCount));
  let frameKeep = workingFrames.length;
  opts.onProgress?.(20);
  await yieldToEventLoop();

  let { bytes, colorsUsed } = await encodeGif(workingFrames, {
    fps: opts.fps,
    loopCount: opts.loopCount,
    colorCount: colors,
    dither: opts.dither,
  });
  opts.onProgress?.(50);

  // Auto-tune if a target is set and we're over
  if (target && bytes.length > target) {
    // Step 1: progressively halve color count down to 32
    while (bytes.length > target && colors > 32) {
      colors = Math.max(32, Math.floor(colors / 2));
      await yieldToEventLoop();
      ({ bytes, colorsUsed } = await encodeGif(workingFrames, {
        fps: opts.fps,
        loopCount: opts.loopCount,
        colorCount: colors,
        dither: opts.dither,
      }));
    }
    opts.onProgress?.(70);

    // Step 2: scale dimensions down (keep square aspect with original ratio)
    const minEdge = 32;
    while (
      bytes.length > target &&
      Math.min(workingWidth, workingHeight) > minEdge
    ) {
      workingWidth = Math.max(minEdge, Math.floor(workingWidth * 0.85));
      workingHeight = Math.max(minEdge, Math.floor(workingHeight * 0.85));
      workingFrames = rasterize(imgs, workingWidth, workingHeight);
      await yieldToEventLoop();
      ({ bytes, colorsUsed } = await encodeGif(workingFrames, {
        fps: opts.fps,
        loopCount: opts.loopCount,
        colorCount: colors,
        dither: opts.dither,
      }));
    }
    opts.onProgress?.(85);

    // Step 3: drop every other frame, repeatedly
    while (bytes.length > target && frameKeep > 2) {
      frameKeep = Math.max(2, Math.floor(frameKeep / 2));
      const stride = workingFrames.length / frameKeep;
      const reduced: RawFrame[] = [];
      for (let i = 0; i < frameKeep; i++) {
        reduced.push(workingFrames[Math.min(workingFrames.length - 1, Math.round(i * stride))]);
      }
      workingFrames = reduced;
      await yieldToEventLoop();
      ({ bytes, colorsUsed } = await encodeGif(workingFrames, {
        fps: opts.fps,
        loopCount: opts.loopCount,
        colorCount: colors,
        dither: opts.dither,
      }));
    }
  }
  opts.onProgress?.(95);

  const dataUrl = bytesToDataUrl(bytes);
  opts.onProgress?.(100);
  return {
    dataUrl,
    bytes: bytes.length,
    width: workingWidth,
    height: workingHeight,
    frameCount: workingFrames.length,
    colorsUsed,
  };
}
