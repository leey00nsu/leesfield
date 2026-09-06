import type { ImageGenerationAdapterResult } from "@/server/image-generation/adapters/types";
import type { AudioGenerationAdapterResult } from "@/server/audio-generation/adapters/types";
import type { VideoGenerationAdapterResult } from "@/server/video-generation/adapters/types";

/**
 * Deterministic media used by the real-browser Node Studio suite.  The E2E
 * server enables these branches explicitly; normal development and production
 * requests always use the configured model providers. Storage always uses its
 * normal upload and lifecycle path, including when provider fixtures are enabled.
 */

const IMAGE_BYTES = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAACd0lEQVR4AUXBT4iUBRzG8e/ze9+Z6RAqSCaalaDrIcfDwNJFAj2E4MFAgoKYS3TRPUi3KMj20kVEIgiCIDeIOiRoC4KG05+xRNnFHBH/hKARXpKWDrmz876/xxkz+nx06cEzCuUuoA0c4zGnACHMhPmXwowdAgYeNnql7F1ysQ+800wYLCTAjAVITAijTMa6Nn0hSkTb1k6sDhhF0GhB2mQNWQsEYiKwjUwnMMa3S/AxBEhIYMOnHyZ3biUzh0vWbRSZYJtHFCBju4PpBAZswDRb4sRnyW9Xa1zDlQtJWYJtsAGDjW3MhAgsEITgrz/N6a8q9r8Z/L0E26eDQmBDWYpmE8qGwAJECgIFo2GQFhfPJavXBr1TZvt0sNA3X3xcIcTNgXmnW3NyLmm0AkWBgbL1RDL/ZdJswOWf4cZls60tlh+YX86ae7+bZ7fUfP1JMrVDfD+f7H4lGC2bVauDqOqaqbY58405fyY5OBvseT248F2y5QV4bitc/xU2bobhstnzqjh+tKL3bU2zBVGNRHsaZmbF+k2wrwuL55Ol+7B033TfDvqnk6uXYPM2sXa9WPgRXtobjFZE2KKqgkyoRnDuJJz63Dw/JV7eL44fSVaG5qkNUDbER+/VzMwG6zYY11C89e6Th+1g1Zrg7i1zbQFmPij44475Yd7sfSN47WDB4k/m3t3kwPsFO140K0NDCl3852nLDSSIgrFAMjZkmqKErEVRmgmnqEY1AjwqKIFDmK6hU1UgJgwIEKMVI4xrMCBAKsBeFMyVQTGQ1GfM0BHGgJgQ/zNCPLYI6oMGpaqiZwvBbUEHBBgjIPmPKDBGgGFOMDD0HgIWUjUt3xqemAAAAABJRU5ErkJggg==",
  "base64",
);

// This is the checked-in one-second sample clip used by the video E2E. It
// keeps generated video previews playable without a network provider.
const VIDEO_BYTES = Buffer.from(
  "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",
  "base64",
);

function wavBytes() {
  const sampleRate = 8_000;
  const sampleCount = sampleRate;
  const dataSize = sampleCount * 2;
  const buffer = Buffer.alloc(44 + dataSize);
  buffer.write("RIFF", 0, "ascii");
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write("WAVE", 8, "ascii");
  buffer.write("fmt ", 12, "ascii");
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write("data", 36, "ascii");
  buffer.writeUInt32LE(dataSize, 40);
  for (let index = 0; index < sampleCount; index += 1) {
    buffer.writeInt16LE(Math.round(Math.sin((index / sampleRate) * Math.PI * 2 * 440) * 8_000), 44 + index * 2);
  }
  return buffer;
}

function dataUrl(type: "image" | "audio" | "video") {
  const bytes = type === "image" ? IMAGE_BYTES : type === "audio" ? wavBytes() : VIDEO_BYTES;
  const mimeType = type === "image" ? "image/png" : type === "audio" ? "audio/wav" : "video/mp4";
  return `data:${mimeType};base64,${bytes.toString("base64")}`;
}

export function isNodeStudioE2EMockGenerationEnabled() {
  return process.env.NODE_ENV !== "production" && process.env.NODE_STUDIO_E2E_MOCK_GENERATION === "1";
}

export function isNodeStudioE2EMockBackgroundRemovalEnabled() {
  return process.env.NODE_ENV !== "production" && process.env.NODE_STUDIO_E2E_MOCK_BACKGROUND_REMOVAL === "1";
}

export function mockImageGenerationResult(
  payload: { imageCount?: number },
): ImageGenerationAdapterResult {
  const count = Math.max(1, Math.min(4, payload.imageCount ?? 1));
  return {
    images: Array.from({ length: count }, () => dataUrl("image")),
  };
}

export function mockAudioGenerationResult(): AudioGenerationAdapterResult {
  return {
    audios: [dataUrl("audio")],
    meta: { duration_sec: 1 },
  };
}

export function mockVideoGenerationResult(): VideoGenerationAdapterResult {
  return {
    videos: [dataUrl("video")],
    meta: { width: 640, height: 360, duration_sec: 1 },
  };
}

export function mockBackgroundRemovalDataUrl() {
  return dataUrl("image");
}
