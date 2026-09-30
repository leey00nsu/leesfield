import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { mediaAssetService } from "@/server/media-assets/media-asset-service";
import { requestRemote } from "@/server/http/safe-remote";
import { AssistantProviderError, type AssistantVisual } from "./assistant-provider";
import type { AssistantInputSnapshot } from "./assistant-execution-repository";

const run = promisify(execFile);
const IMAGE_BYTES = 8 * 1024 * 1024;
const VIDEO_BYTES = 60 * 1024 * 1024;
const VISUAL_TOTAL_BYTES = 8 * 1024 * 1024;

function assertActive(signal: AbortSignal) {
  if (signal.aborted) throw new AssistantProviderError("ASSISTANT_CANCELLED");
}

async function download(url: string, maxBytes: number, signal: AbortSignal) {
  assertActive(signal);
  let response;
  try { response = await requestRemote(url, { timeoutMs: 20_000, maxBytes, signal }); }
  catch { throw new AssistantProviderError("ASSISTANT_INPUT_UNAVAILABLE"); }
  if (response.status !== 200 || response.body.length < 1) throw new AssistantProviderError("ASSISTANT_INPUT_UNAVAILABLE");
  return response.body;
}

async function videoFrames(data: Buffer, durationMs: number, signal: AbortSignal): Promise<AssistantVisual[]> {
  const directory = await mkdtemp(join(tmpdir(), "leesfield-assistant-"));
  try {
    const input = join(directory, "input.video");
    await writeFile(input, data);
    const positions = [0, 0.5, 0.9].map((ratio) => Math.max(0, Math.min(durationMs - 100, Math.round(durationMs * ratio))));
    const frames: AssistantVisual[] = [];
    for (let index = 0; index < positions.length; index++) {
      assertActive(signal);
      const output = join(directory, `${index}.jpg`);
      try {
        await run("ffmpeg", ["-v", "error", "-nostdin", "-ss", String(positions[index] / 1000), "-i", input,
          "-frames:v", "1", "-vf", "scale=768:768:force_original_aspect_ratio=decrease", "-q:v", "4", "-y", output],
        { timeout: 15_000, signal, maxBuffer: 256 * 1024, windowsHide: true });
      } catch { throw new AssistantProviderError("ASSISTANT_FRAME_EXTRACTION_FAILED"); }
      const frame = await readFile(output);
      if (!frame.length || frame.length > 1024 * 1024) throw new AssistantProviderError("ASSISTANT_FRAME_EXTRACTION_FAILED");
      frames.push({ mimeType: "image/jpeg", data: frame, label: `Video frame at ${(positions[index] / 1000).toFixed(1)} seconds` });
    }
    return frames;
  } finally { await rm(directory, { recursive: true, force: true }); }
}

export async function prepareAssistantVisuals(ownerEmail: string, snapshot: AssistantInputSnapshot, signal: AbortSignal) {
  const visuals: AssistantVisual[] = [];
  let total = 0;
  for (const input of snapshot.assets) {
    assertActive(signal);
    const asset = await mediaAssetService.get(ownerEmail, input.assetId);
    if (asset.type !== input.type) throw new AssistantProviderError("ASSISTANT_INPUT_INVALID");
    const bytes = Number(asset.bytes);
    const limit = input.type === "image" ? IMAGE_BYTES : VIDEO_BYTES;
    if (!Number.isSafeInteger(bytes) || bytes < 1 || bytes > limit) throw new AssistantProviderError("ASSISTANT_INPUT_TOO_LARGE");
    if (input.type === "image") {
      if (!["image/jpeg", "image/png", "image/webp"].includes(asset.mimeType)) throw new AssistantProviderError("ASSISTANT_INPUT_UNSUPPORTED");
      const data = await download(asset.url, IMAGE_BYTES, signal);
      visuals.push({ mimeType: asset.mimeType as AssistantVisual["mimeType"], data, label: `Image reference ${input.sortOrder + 1}` });
      total += data.length;
    } else {
      if (!asset.durationMs || asset.durationMs > 60_000) throw new AssistantProviderError("ASSISTANT_INPUT_UNSUPPORTED");
      const data = await download(asset.url, VIDEO_BYTES, signal);
      const frames = await videoFrames(data, asset.durationMs, signal);
      visuals.push(...frames);
      total += frames.reduce((sum, frame) => sum + frame.data.length, 0);
    }
    if (total > VISUAL_TOTAL_BYTES) throw new AssistantProviderError("ASSISTANT_INPUT_TOO_LARGE");
  }
  return visuals;
}
