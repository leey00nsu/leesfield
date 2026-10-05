import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { mediaAssetService } from "@/server/media-assets/media-asset-service";
import type { MediaOperationWorkerRecord } from "@/server/media-assets/media-asset-repository";
import { runVideoProcess, downloadVideoInput, assertVideoTempBudget, assertVideoOperationActive,
  videoProcessorLimits as limits, VideoOperationError } from "./ffmpeg-video-processor";

type VideoStream = {
  width?: number; height?: number; duration?: string; sample_aspect_ratio?: string;
  side_data_list?: Array<{ rotation?: number }>; tags?: { rotate?: string };
};
const IMAGE_MAX_BYTES = 25 * 1024 * 1024;

function dimensions(width: number, height: number) {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 ||
    width > limits.dimension || height > limits.dimension || width * height > limits.pixels)
    throw new VideoOperationError("VIDEO_INPUT_UNSUPPORTED");
}

async function png(path: string) {
  const size = (await stat(path)).size;
  if (size < 24 || size > IMAGE_MAX_BYTES) throw new VideoOperationError("VIDEO_OUTPUT_INVALID");
  const buffer = await readFile(path);
  if (!buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])))
    throw new VideoOperationError("VIDEO_OUTPUT_INVALID");
  const width = buffer.readUInt32BE(16), height = buffer.readUInt32BE(20);
  dimensions(width, height);
  return { buffer, width, height };
}

/** Overwrite one PNG to retain the final decoded display frame without a reverse buffer. */
export async function renderVideoFrames(file: string, directory: string, signal: AbortSignal) {
  const { stdout } = await runVideoProcess("ffprobe", [
    "-v", "error", "-select_streams", "v:0", "-show_entries",
    "format=duration:stream=width,height,duration,sample_aspect_ratio:stream_tags=rotate:stream_side_data=rotation",
    "-of", "json", file,
  ], signal);
  let probe: { streams?: VideoStream[]; format?: { duration?: string } };
  try { probe = JSON.parse(stdout); } catch { throw new VideoOperationError("VIDEO_INPUT_UNSUPPORTED"); }
  const stream = probe.streams?.[0];
  if (!stream) throw new VideoOperationError("VIDEO_INPUT_UNSUPPORTED");
  dimensions(Number(stream.width), Number(stream.height));
  const streamSeconds = Number(stream.duration), formatSeconds = Number(probe.format?.duration);
  const inputSeconds = Math.max(Number.isFinite(streamSeconds) ? streamSeconds : 0,
    Number.isFinite(formatSeconds) ? formatSeconds : 0);
  if (inputSeconds <= 0 || inputSeconds * 1000 > limits.durationMs)
    throw new VideoOperationError("VIDEO_INPUT_UNSUPPORTED");
  const sarParts = stream.sample_aspect_ratio?.split(":").map(Number);
  const sar = sarParts?.length === 2 && sarParts[0] > 0 && sarParts[1] > 0 ? sarParts[0] / sarParts[1] : 1;
  const rotation = Math.abs(Number(stream.side_data_list?.[0]?.rotation ?? stream.tags?.rotate ?? 0)) % 180;
  const displayWidth = Math.round(Number(stream.width) * sar), displayHeight = Number(stream.height);
  dimensions(rotation === 90 ? displayHeight : displayWidth, rotation === 90 ? displayWidth : displayHeight);
  const first = join(directory, "start.png"), last = join(directory, "end.png");
  const decode = async (output: string, seek: number | null, firstOnly: boolean) => {
    await rm(output, { force: true });
    await runVideoProcess("ffmpeg", [
      "-hide_banner", "-loglevel", "error", "-nostdin", "-y",
      ...(seek !== null ? ["-ss", String(seek)] : []), "-i", file,
      "-map", "0:v:0", "-an", "-sn", "-dn",
      // Autorotation inverts SAR for quarter turns; preserve the original display resolution.
      "-vf", rotation === 90 ? `scale=${displayHeight}:${displayWidth},setsar=1` : "scale=round(iw*sar):ih,setsar=1", "-fps_mode", "passthrough",
      ...(firstOnly ? ["-frames:v", "1"] : []),
      "-c:v", "png", "-f", "image2", "-update", "1", "-atomic_writing", "1", output,
    ], signal);
    await assertVideoTempBudget([file, ...(output === last ? [first] : []), output]);
    return png(output);
  };
  const start = await decode(first, null, true);
  let end;
  if (Number.isFinite(streamSeconds) && streamSeconds > 0) {
    try { end = await decode(last, Math.max(0, streamSeconds - 3), false); }
    catch (error) {
      assertVideoOperationActive(signal);
      if (!(error instanceof VideoOperationError) && (error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      if (error instanceof VideoOperationError && error.code !== "VIDEO_PROCESSOR_FAILED") throw error;
    }
  }
  // Unknown stream boundary or an empty tail: decode to EOF within the same job budget.
  end ??= await decode(last, null, false);
  assertVideoOperationActive(signal);
  return [{ ...start, outputPortId: "startFrame" as const }, { ...end, outputPortId: "endFrame" as const }];
}

export async function processVideoFrameOperation(operation: MediaOperationWorkerRecord, signal: AbortSignal) {
  const directory = await mkdtemp(join(tmpdir(), "leesfield-frames-"));
  try {
    const boundedSignal = AbortSignal.any([signal, AbortSignal.timeout(limits.jobTimeoutMs)]);
    if (operation.type !== "edit.video.extractFrames" || operation.inputs.length !== 1 ||
      operation.inputs[0].portId !== "video") throw new VideoOperationError("VIDEO_INPUT_UNSUPPORTED");
    const asset = await mediaAssetService.get(operation.ownerEmail, operation.inputs[0].assetId);
    if (asset.type !== "video") throw new VideoOperationError("VIDEO_INPUT_UNSUPPORTED");
    const file = join(directory, "input");
    await downloadVideoInput(asset.url, file, limits.inputBytes, boundedSignal);
    return await renderVideoFrames(file, directory, boundedSignal);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
