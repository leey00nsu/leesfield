import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { mediaAssetService } from "@/server/media-assets/media-asset-service";
import type { MediaOperationWorkerRecord } from "@/server/media-assets/media-asset-repository";
import { directEditSnapshotSchema, editMediaType, validEditGeometry, type DirectEditSnapshot } from "@/shared/media-assets/direct-media-edit";
import { runVideoProcess as run, downloadVideoInput, assertVideoTempBudget, assertVideoOperationActive,
  videoProcessorLimits as limits, VideoOperationError } from "./ffmpeg-video-processor";

type Stream = { codec_type?: string; width?: number; height?: number; sample_aspect_ratio?: string; avg_frame_rate?: string;
  side_data_list?: Array<{ rotation?: number }>; tags?: { rotate?: string } };
async function probe(file: string, signal: AbortSignal) {
  const { stdout } = await run("ffprobe", ["-v", "error", "-show_entries",
    "format=duration:stream=codec_type,width,height,sample_aspect_ratio,avg_frame_rate:stream_tags=rotate:stream_side_data=rotation", "-of", "json", file], signal);
  return JSON.parse(stdout) as { streams?: Stream[]; format?: { duration?: string } };
}

/** Public only to exercise actual decoded pixels and audio, independently of storage. */
export async function renderDirectMediaEdit(file: string, s: DirectEditSnapshot, directory: string, signal: AbortSignal) {
  assertVideoOperationActive(signal);
  if (!validEditGeometry(s.edit, s.width, s.height, s.durationMs) || (await stat(file)).size > limits.inputBytes)
    throw new VideoOperationError("EDIT_RANGE_INVALID");
  const input = await probe(file, signal), stream = input.streams?.find(v => v.codec_type === "video");
  if (!stream?.width || !stream.height) throw new VideoOperationError("VIDEO_INPUT_UNSUPPORTED");
  const [num, den] = (stream.sample_aspect_ratio ?? "1:1").split(":").map(Number);
  const sar = num > 0 && den > 0 ? num / den : 1;
  const rotated = Math.abs(Number(stream.side_data_list?.[0]?.rotation ?? stream.tags?.rotate ?? 0)) % 180 === 90;
  const width = rotated ? stream.height : Math.round(stream.width * sar), height = rotated ? Math.round(stream.width * sar) : stream.height;
  const image = s.edit.kind === "image.crop", inputDuration = Math.round(Number(input.format?.duration) * 1000);
  if (width !== s.width || height !== s.height || (!image && (!Number.isFinite(inputDuration) || inputDuration < 1
    || inputDuration > limits.durationMs || s.durationMs === null || Math.abs(s.durationMs - inputDuration) > 150))) throw new VideoOperationError("EDIT_SOURCE_CHANGED");
  const audio = !image && Boolean(input.streams?.some(v => v.codec_type === "audio"));
  const output = join(directory, image ? "edited.png" : "edited.mp4");
  const trim = s.edit.kind === "video.trim" ? s.edit : null;
  if (trim) {
    const [frames, seconds] = (stream.avg_frame_rate ?? "0/1").split("/").map(Number);
    if (frames > 0 && seconds > 0 && trim.endMs - trim.startMs < Math.ceil(seconds / frames * 1000))
      throw new VideoOperationError("EDIT_RANGE_INVALID");
  }
  // Autorotation precedes this filter; explicit display dimensions also normalize SAR.
  const scale = `scale=${width}:${height},setsar=1`;
  const filter = s.edit.kind === "video.trim" ? `${scale},scale=trunc(iw/2)*2:trunc(ih/2)*2`
    : `${scale},crop=${s.edit.rect.width}:${s.edit.rect.height}:${s.edit.rect.x}:${s.edit.rect.y}`;
  const args = ["-hide_banner", "-loglevel", "error", "-nostdin", "-y", ...(trim ? ["-ss", String(trim.startMs / 1000)] : []),
    "-i", file, ...(trim ? ["-t", String((trim.endMs - trim.startMs) / 1000)] : []), "-map", "0:v:0", "-vf", filter, "-sn", "-dn"];
  if (image) args.push("-an", "-frames:v", "1", "-c:v", "png", "-threads", "1");
  else {
    args.push("-c:v", "libx264", "-preset", "veryfast", "-crf", "23", "-pix_fmt", "yuv420p", "-threads", "2");
    if (audio) args.push("-map", "0:a:0", "-c:a", "aac", "-ar", "48000", "-ac", "2", "-b:a", "128k");
    else args.push("-an");
    args.push("-movflags", "+faststart");
  }
  args.push(output);
  await run("ffmpeg", args, signal);
  await assertVideoTempBudget([file, output]);
  const bytes = (await stat(output)).size;
  if (!bytes || bytes > (image ? 25 * 1024 * 1024 : limits.inputBytes)) throw new VideoOperationError("VIDEO_OUTPUT_INVALID");
  const buffer = await readFile(output);
  assertVideoOperationActive(signal);
  if (image) {
    if (buffer.length < 24 || !buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) || s.edit.kind !== "image.crop"
      || buffer.readUInt32BE(16) !== s.edit.rect.width || buffer.readUInt32BE(20) !== s.edit.rect.height) throw new VideoOperationError("VIDEO_OUTPUT_INVALID");
    return { buffer, width: s.edit.rect.width, height: s.edit.rect.height, durationMs: null };
  }
  const result = await probe(output, signal), v = result.streams?.find(v => v.codec_type === "video"), durationMs = Math.round(Number(result.format?.duration) * 1000);
  const expectedDuration = trim ? trim.endMs - trim.startMs : inputDuration;
  const expectedWidth = s.edit.kind === "video.crop" ? s.edit.rect.width : Math.floor(width / 2) * 2;
  const expectedHeight = s.edit.kind === "video.crop" ? s.edit.rect.height : Math.floor(height / 2) * 2;
  if (!v || v.width !== expectedWidth || v.height !== expectedHeight || !Number.isFinite(durationMs) || Math.abs(durationMs - expectedDuration) > 150
    || Boolean(result.streams?.some(v => v.codec_type === "audio")) !== audio) throw new VideoOperationError("VIDEO_OUTPUT_INVALID");
  return { buffer, width: expectedWidth, height: expectedHeight, durationMs };
}

export async function processDirectMediaEdit(operation: MediaOperationWorkerRecord, signal: AbortSignal) {
  const s = directEditSnapshotSchema.parse(operation.parameters), directory = await mkdtemp(join(tmpdir(), "leesfield-direct-edit-"));
  try {
    const bounded = AbortSignal.any([signal, AbortSignal.timeout(limits.jobTimeoutMs)]);
    if (operation.type !== "direct." + s.edit.kind || operation.configVersion !== 1 || operation.expectedOutputCount !== 1 || operation.inputs.length !== 1
      || operation.inputs[0].assetId !== s.sourceAssetId || operation.inputs[0].portId !== editMediaType(s.edit)) throw new VideoOperationError("EDIT_SOURCE_CHANGED");
    const asset = await mediaAssetService.get(operation.ownerEmail, s.sourceAssetId);
    if (asset.version !== s.sourceVersion || asset.status !== "completed" || asset.type !== editMediaType(s.edit)) throw new VideoOperationError("EDIT_SOURCE_CHANGED");
    const file = join(directory, "source");
    await downloadVideoInput(asset.url, file, s.edit.kind === "image.crop" ? 50 * 1024 * 1024 : limits.inputBytes, bounded);
    return await renderDirectMediaEdit(file, s, directory, bounded);
  } catch (error) {
    if (error instanceof VideoOperationError) throw error;
    assertVideoOperationActive(signal);
    throw new VideoOperationError("EDIT_PROCESSOR_FAILED");
  } finally { await rm(directory, { recursive: true, force: true }); }
}
