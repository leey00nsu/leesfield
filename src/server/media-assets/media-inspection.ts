import { detectImageAnimation } from "./image-upload-policy";
import { fileTypeFromBuffer } from "file-type";

import type { MediaType } from "@/shared/media-assets/media-asset-contract";

import { MediaVerificationError } from "./media-asset-errors";
import type { InspectedMedia } from "./media-storage";

const INSPECTION_BYTES = 1024 * 1024;

function normalizeMimeType(mimeType: string) {
  const normalized = mimeType.toLowerCase().split(";", 1)[0]?.trim() ?? "";
  if (normalized === "image/jpg") return "image/jpeg";
  if (normalized === "audio/x-wav") return "audio/wav";
  if (normalized === "audio/mp3") return "audio/mpeg";
  return normalized;
}

function mimeMatches(declared: string, detected: string, expectedType: MediaType) {
  const left = normalizeMimeType(declared);
  const right = normalizeMimeType(detected);
  if (left === right) return true;
  // ISO-BMFF does not reliably distinguish an M4A audio-only container from MP4 video.
  return expectedType === "audio" && left === "audio/mp4" && right === "video/mp4";
}

function pngDimensions(buffer: Uint8Array) {
  if (buffer.length < 24) return null;
  return {
    width: new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength).getUint32(16),
    height: new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength).getUint32(20),
  };
}

function gifDimensions(buffer: Uint8Array) {
  if (buffer.length < 10) return null;
  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  return { width: view.getUint16(6, true), height: view.getUint16(8, true) };
}

function jpegDimensions(buffer: Uint8Array) {
  let offset = 2;
  while (offset + 9 < buffer.length) {
    if (buffer[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    const marker = buffer[offset + 1];
    const length = (buffer[offset + 2] << 8) | buffer[offset + 3];
    if (length < 2) return null;
    if (
      marker >= 0xc0 &&
      marker <= 0xcf &&
      ![0xc4, 0xc8, 0xcc].includes(marker)
    ) {
      return {
        height: (buffer[offset + 5] << 8) | buffer[offset + 6],
        width: (buffer[offset + 7] << 8) | buffer[offset + 8],
      };
    }
    offset += length + 2;
  }
  return null;
}

function webpDimensions(buffer: Uint8Array) {
  if (buffer.length < 30) return null;
  const chunk = String.fromCharCode(...buffer.slice(12, 16));
  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  if (chunk === "VP8X") {
    const width = 1 + buffer[24] + (buffer[25] << 8) + (buffer[26] << 16);
    const height = 1 + buffer[27] + (buffer[28] << 8) + (buffer[29] << 16);
    return { width, height };
  }
  if (chunk === "VP8 " && buffer.length >= 30) {
    return { width: view.getUint16(26, true) & 0x3fff, height: view.getUint16(28, true) & 0x3fff };
  }
  if (chunk === "VP8L" && buffer.length >= 25) {
    const bits =
      buffer[21] | (buffer[22] << 8) | (buffer[23] << 16) | (buffer[24] << 24);
    return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
  }
  return null;
}

function imageDimensions(buffer: Uint8Array, mimeType: string) {
  if (mimeType === "image/png") return pngDimensions(buffer);
  if (mimeType === "image/jpeg") return jpegDimensions(buffer);
  if (mimeType === "image/gif") return gifDimensions(buffer);
  if (mimeType === "image/webp") return webpDimensions(buffer);
  return null;
}

function wavDurationMs(buffer: Uint8Array) {
  if (buffer.length < 44) return null;
  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  let offset = 12;
  let byteRate: number | null = null;
  let dataBytes: number | null = null;
  while (offset + 8 <= buffer.length) {
    const chunk = String.fromCharCode(...buffer.slice(offset, offset + 4));
    const size = view.getUint32(offset + 4, true);
    if (chunk === "fmt " && offset + 20 <= buffer.length) byteRate = view.getUint32(offset + 16, true);
    if (chunk === "data") {
      dataBytes = size;
      break;
    }
    offset += 8 + size + (size % 2);
  }
  return byteRate && dataBytes !== null ? Math.round((dataBytes / byteRate) * 1000) : null;
}

function mp4DurationMs(buffer: Uint8Array) {
  const marker = [0x6d, 0x76, 0x68, 0x64]; // mvhd
  for (let index = 4; index + 28 < buffer.length; index += 1) {
    if (!marker.every((byte, offset) => buffer[index + offset] === byte)) continue;
    const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
    const version = buffer[index + 4];
    if (version === 0 && index + 24 < buffer.length) {
      const timescale = view.getUint32(index + 16);
      const duration = view.getUint32(index + 20);
      return timescale > 0 ? Math.round((duration / timescale) * 1000) : null;
    }
    if (version === 1 && index + 35 < buffer.length) {
      const timescale = view.getUint32(index + 24);
      const high = view.getUint32(index + 28);
      const low = view.getUint32(index + 32);
      const duration = high * 2 ** 32 + low;
      return timescale > 0 && Number.isSafeInteger(duration)
        ? Math.round((duration / timescale) * 1000)
        : null;
    }
  }
  return null;
}

function durationMs(buffer: Uint8Array, mimeType: string) {
  if (mimeType === "audio/wav") return wavDurationMs(buffer);
  if (["video/mp4", "video/quicktime", "audio/mp4"].includes(mimeType)) {
    return mp4DurationMs(buffer);
  }
  return null;
}

export async function inspectMediaUrl(
  input: {
    url: string;
    expectedType: MediaType;
    declaredMimeType: string;
  },
  fetchImpl: typeof fetch = fetch,
): Promise<InspectedMedia> {
  const response = await fetchImpl(input.url, {
    headers: { Range: `bytes=0-${INSPECTION_BYTES - 1}` },
    cache: "no-store",
    // Keep the deadline alive while the response body is being consumed.
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new MediaVerificationError("MEDIA_MAGIC_INVALID");
  let buffer: Uint8Array;
  if (!response.body) {
    buffer = new Uint8Array(await response.arrayBuffer()).slice(0, INSPECTION_BYTES);
  } else {
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    while (total < INSPECTION_BYTES) {
      const { done, value } = await reader.read();
      if (done) break;
      const remaining = INSPECTION_BYTES - total;
      const chunk = value.length > remaining ? value.slice(0, remaining) : value;
      chunks.push(chunk);
      total += chunk.length;
      if (value.length > remaining) break;
    }
    await reader.cancel().catch(() => undefined);
    buffer = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
      buffer.set(chunk, offset);
      offset += chunk.length;
    }
  }
  const detected = await fileTypeFromBuffer(buffer);
  if (!detected) throw new MediaVerificationError("MEDIA_MAGIC_INVALID");
  if (!mimeMatches(input.declaredMimeType, detected.mime, input.expectedType)) {
    throw new MediaVerificationError("MEDIA_MIME_MISMATCH");
  }
  const normalizedDeclared = normalizeMimeType(input.declaredMimeType);
  const normalizedDetected = normalizeMimeType(detected.mime);
  const detectedMimeType =
    input.expectedType === "audio" &&
    normalizedDeclared === "audio/mp4" &&
    normalizedDetected === "video/mp4"
      ? "audio/mp4"
      : normalizedDetected;
  const dimensions = imageDimensions(buffer, detectedMimeType);
  const resolvedDuration = durationMs(buffer, detectedMimeType);
  return {
    detectedMimeType,
    isAnimated: input.expectedType === "image" ? detectImageAnimation(buffer, detectedMimeType) : null,
    width: dimensions?.width ?? null,
    height: dimensions?.height ?? null,
    durationMs: resolvedDuration,
  };
}

export const mediaInspectionInternals = {
  imageDimensions,
  durationMs,
  mimeMatches,
};
