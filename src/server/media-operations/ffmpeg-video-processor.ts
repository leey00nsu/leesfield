import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { open, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

import { RemoteAccessError, requestRemoteStream } from "@/server/http/safe-remote";
import type { MediaOperationWorkerRecord } from "@/server/media-assets/media-asset-repository";
import { mediaAssetService } from "@/server/media-assets/media-asset-service";

const runFile = promisify(execFile);
const INPUT_MAX_BYTES = 500 * 1024 * 1024;
const INPUT_TOTAL_MAX_BYTES = 600 * 1024 * 1024;
const OUTPUT_MAX_BYTES = 500 * 1024 * 1024;
const TEMP_MAX_BYTES = 2 * 1024 * 1024 * 1024;
const MAX_DURATION_MS = 600_000;
const MAX_CLIPS = 20;
const JOB_TIMEOUT_MS = 12 * 60_000;
const MAX_DIMENSION = 8_192;
const MAX_PIXELS = 32 * 1024 * 1024;
const DOWNLOAD_TIMEOUT_MS = 120_000;
const PROCESS_TIMEOUT_MS = 180_000;
export const videoProcessorLimits = {
  inputBytes: INPUT_MAX_BYTES, tempBytes: TEMP_MAX_BYTES, durationMs: MAX_DURATION_MS,
  dimension: MAX_DIMENSION, pixels: MAX_PIXELS, jobTimeoutMs: JOB_TIMEOUT_MS,
} as const;
export { run as runVideoProcess, download as downloadVideoInput,
  assertTempBudget as assertVideoTempBudget, assertActive as assertVideoOperationActive };

type Probe = {
  streams?: Array<{ codec_type?: string; width?: number; height?: number }>;
  format?: { duration?: string };
};

type InspectedFile = {
  path: string;
  durationMs: number;
  width: number;
  height: number;
  hasAudio: boolean;
};

export class VideoOperationError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = "VideoOperationError";
  }
}

function assertActive(signal: AbortSignal) {
  if (signal.aborted) throw new VideoOperationError(
    signal.reason?.name === "TimeoutError" ? "VIDEO_PROCESSOR_TIMEOUT" : "MEDIA_OPERATION_CANCELLED",
  );
}

async function run(binary: "ffmpeg" | "ffprobe", args: string[], signal?: AbortSignal) {
  try {
    return await runFile(binary, args, {
      timeout: PROCESS_TIMEOUT_MS,
      maxBuffer: 1024 * 1024,
      signal,
      windowsHide: true,
    });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      throw new VideoOperationError("PROCESSOR_UNAVAILABLE");
    }
    if (signal) assertActive(signal);
    throw new VideoOperationError("VIDEO_PROCESSOR_FAILED");
  }
}

export async function hasFfmpegVideoProcessor() {
  try {
    await Promise.all([
      runFile("ffmpeg", ["-version"], { timeout: 2_000 }),
      runFile("ffprobe", ["-version"], { timeout: 2_000 }),
    ]);
    return true;
  } catch {
    return false;
  }
}

async function inspect(path: string, signal?: AbortSignal): Promise<InspectedFile> {
  const { stdout } = await run("ffprobe", [
    "-v", "error", "-show_entries", "format=duration:stream=codec_type,width,height",
    "-of", "json", path,
  ], signal);
  let probe: Probe;
  try {
    probe = JSON.parse(stdout) as Probe;
  } catch {
    throw new VideoOperationError("VIDEO_INPUT_UNSUPPORTED");
  }
  const video = probe.streams?.find((stream) => stream.codec_type === "video");
  const durationMs = Math.round(Number(probe.format?.duration) * 1_000);
  if (
    !video || !Number.isInteger(video.width) || !Number.isInteger(video.height) ||
    !video.width || !video.height ||
    video.width > MAX_DIMENSION || video.height > MAX_DIMENSION ||
    video.width * video.height > MAX_PIXELS ||
    !Number.isFinite(durationMs) || durationMs < 1 || durationMs > MAX_DURATION_MS
  ) {
    throw new VideoOperationError("VIDEO_INPUT_UNSUPPORTED");
  }
  return {
    path, durationMs, width: video.width, height: video.height,
    hasAudio: Boolean(probe.streams?.some((stream) => stream.codec_type === "audio")),
  };
}

async function download(
  url: string,
  path: string,
  remainingBytes: number,
  signal: AbortSignal,
) {
  if (remainingBytes < 1) throw new VideoOperationError("VIDEO_INPUT_TOO_LARGE");
  let response: Awaited<ReturnType<typeof requestRemoteStream>>;
  try {
    response = await requestRemoteStream(url, {
      timeoutMs: DOWNLOAD_TIMEOUT_MS,
      maxBytes: Math.min(INPUT_MAX_BYTES, remainingBytes),
      signal,
    });
  } catch (error) {
    assertActive(signal);
    if (error instanceof RemoteAccessError && error.code === "REMOTE_TOO_LARGE") {
      throw new VideoOperationError("VIDEO_INPUT_TOO_LARGE");
    }
    throw new VideoOperationError("VIDEO_INPUT_UNAVAILABLE");
  }
  if (response.status !== 200) {
    await response.body.cancel().catch(() => undefined);
    throw new VideoOperationError("VIDEO_INPUT_UNAVAILABLE");
  }
  const handle = await open(path, "w");
  const reader = response.body.getReader();
  let bytes = 0;
  try {
    while (true) {
      assertActive(signal);
      const next = await reader.read();
      if (next.done) break;
      bytes += next.value.byteLength;
      if (bytes > remainingBytes) throw new VideoOperationError("VIDEO_INPUT_TOO_LARGE");
      await handle.write(next.value);
    }
  } catch (error) {
    assertActive(signal);
    if (error instanceof RemoteAccessError && error.code === "REMOTE_TOO_LARGE") {
      throw new VideoOperationError("VIDEO_INPUT_TOO_LARGE");
    }
    if (error instanceof VideoOperationError) throw error;
    throw new VideoOperationError("VIDEO_INPUT_UNAVAILABLE");
  } finally {
    await reader.cancel().catch(() => undefined);
    await handle.close();
  }
  if (bytes === 0) throw new VideoOperationError("VIDEO_INPUT_UNSUPPORTED");
  return bytes;
}

async function assertTempBudget(files: string[]) {
  let bytes = 0;
  for (const file of files) {
    bytes += (await stat(file)).size;
    if (bytes > TEMP_MAX_BYTES) throw new VideoOperationError("VIDEO_TEMP_LIMIT_EXCEEDED");
  }
}

function even(value: number) {
  return Math.max(2, Math.ceil(value / 2) * 2);
}

async function stitch(
  clips: InspectedFile[],
  soundtrack: string | null,
  parameters: Record<string, unknown>,
  directory: string,
  signal: AbortSignal,
) {
  const repeat = Number(parameters.repeat);
  const stripAudio = parameters.stripAudio === true;
  if (!Number.isInteger(repeat) || repeat < 1 || repeat > 3 || clips.length < 2 || clips.length > MAX_CLIPS) {
    throw new VideoOperationError("VIDEO_INPUT_UNSUPPORTED");
  }
  const totalMs = clips.reduce((sum, clip) => sum + clip.durationMs, 0) * repeat;
  if (totalMs > MAX_DURATION_MS) throw new VideoOperationError("VIDEO_OUTPUT_TOO_LONG");
  const first = clips[0];
  const scale = Math.min(1, 1280 / first.width, 720 / first.height);
  const width = even(Math.floor(first.width * scale));
  const height = even(Math.floor(first.height * scale));
  const withEmbeddedAudio = !stripAudio && !soundtrack && clips.some((clip) => clip.hasAudio);
  const segments: string[] = [];
  for (const [index, clip] of clips.entries()) {
    const segment = join(directory, `segment-${index}.mp4`);
    const args = ["-hide_banner", "-loglevel", "error", "-nostdin", "-y", "-i", clip.path];
    if (withEmbeddedAudio && !clip.hasAudio) {
      args.push("-f", "lavfi", "-i", "anullsrc=channel_layout=stereo:sample_rate=48000");
    }
    args.push(
      "-map", "0:v:0", "-vf",
      `fps=30,scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2,setsar=1,format=yuv420p`,
      "-c:v", "libx264", "-preset", "veryfast", "-crf", "23", "-pix_fmt", "yuv420p",
    );
    if (withEmbeddedAudio) {
      args.push(
        "-map", clip.hasAudio ? "0:a:0" : "1:a:0",
        "-af", `aresample=48000:async=1:first_pts=0,apad,atrim=duration=${clip.durationMs / 1_000}`,
        "-c:a", "aac", "-ar", "48000", "-ac", "2", "-b:a", "128k",
      );
    } else {
      args.push("-an");
    }
    args.push("-t", String(clip.durationMs / 1_000), "-movflags", "+faststart", segment);
    await run("ffmpeg", args, signal);
    segments.push(segment);
    await assertTempBudget([...clips.map((item) => item.path), ...segments]);
  }
  const listPath = join(directory, "concat.txt");
  await writeFile(listPath, Array.from({ length: repeat }, () => segments)
    .flat().map((segment) => `file '${segment}'`).join("\n") + "\n");
  const concatenated = join(directory, "concatenated.mp4");
  await run("ffmpeg", [
    "-hide_banner", "-loglevel", "error", "-nostdin", "-y",
    "-f", "concat", "-safe", "0", "-i", listPath,
    "-map", "0:v:0", ...(withEmbeddedAudio ? ["-map", "0:a:0"] : []),
    "-c", "copy", "-movflags", "+faststart", concatenated,
  ], signal);
  await assertTempBudget([...clips.map((item) => item.path), ...segments, concatenated]);
  if (!soundtrack || stripAudio) return concatenated;
  const result = join(directory, "result.mp4");
  await run("ffmpeg", [
    "-hide_banner", "-loglevel", "error", "-nostdin", "-y",
    "-i", concatenated, "-stream_loop", "-1", "-i", soundtrack,
    "-map", "0:v:0", "-map", "1:a:0", "-c:v", "copy", "-c:a", "aac",
    "-ar", "48000", "-ac", "2", "-b:a", "128k", "-t", String(totalMs / 1_000),
    "-movflags", "+faststart", result,
  ], signal);
  await assertTempBudget([...clips.map((item) => item.path), ...segments, concatenated, result]);
  return result;
}

async function trim(
  clip: InspectedFile,
  parameters: Record<string, unknown>,
  directory: string,
  signal: AbortSignal,
) {
  const startMs = Number(parameters.startMs);
  const endMs = Number(parameters.endMs);
  if (
    !Number.isInteger(startMs) || !Number.isInteger(endMs) || startMs < 0 ||
    endMs <= startMs || endMs > clip.durationMs
  ) throw new VideoOperationError("VIDEO_INTERVAL_INVALID");
  const result = join(directory, "result.mp4");
  const args = [
    "-hide_banner", "-loglevel", "error", "-nostdin", "-y",
    "-ss", String(startMs / 1_000), "-i", clip.path,
    "-t", String((endMs - startMs) / 1_000), "-map", "0:v:0",
    "-c:v", "libx264", "-preset", "veryfast", "-crf", "23", "-pix_fmt", "yuv420p",
  ];
  if (clip.hasAudio && parameters.stripAudio !== true) {
    args.push("-map", "0:a:0", "-c:a", "aac", "-ar", "48000", "-ac", "2", "-b:a", "128k");
  } else {
    args.push("-an");
  }
  args.push("-movflags", "+faststart", result);
  await run("ffmpeg", args, signal);
  return result;
}

export async function renderVideoOperation(
  type: "edit.video.stitch" | "edit.video.trim",
  inputs: Array<{ portId: string; file: string }>,
  parameters: Record<string, unknown>,
  directory: string,
  signal: AbortSignal,
) {
  let result: string;
  let expectedAudio: boolean;
  if (type === "edit.video.stitch") {
    const clips = await Promise.all(inputs.filter((input) => input.portId === "clips")
      .map((input) => inspect(input.file, signal)));
    const soundtrack = inputs.find((input) => input.portId === "soundtrack")?.file ?? null;
    if (soundtrack) {
      const { stdout } = await run("ffprobe", ["-v", "error", "-select_streams", "a",
        "-show_entries", "stream=codec_type", "-of", "json", soundtrack], signal);
      if (!(JSON.parse(stdout) as Probe).streams?.length) throw new VideoOperationError("VIDEO_INPUT_UNSUPPORTED");
    }
    expectedAudio = parameters.stripAudio !== true &&
      (Boolean(soundtrack) || clips.some((clip) => clip.hasAudio));
    result = await stitch(clips, soundtrack, parameters, directory, signal);
  } else {
    const source = inputs.find((input) => input.portId === "video");
    if (!source) throw new VideoOperationError("VIDEO_INPUT_UNSUPPORTED");
    const clip = await inspect(source.file, signal);
    expectedAudio = clip.hasAudio && parameters.stripAudio !== true;
    result = await trim(clip, parameters, directory, signal);
  }
  const output = await inspect(result, signal);
  if (output.hasAudio !== expectedAudio || (await stat(result)).size > OUTPUT_MAX_BYTES) {
    throw new VideoOperationError("VIDEO_OUTPUT_INVALID");
  }
  return { path: result, width: output.width, height: output.height, durationMs: output.durationMs };
}

export async function processVideoOperation(
  operation: MediaOperationWorkerRecord,
  signal: AbortSignal,
) {
  const directory = await mkdtemp(join(tmpdir(), `leesfield-video-${randomUUID()}-`));
  try {
    const boundedSignal = AbortSignal.any([signal, AbortSignal.timeout(JOB_TIMEOUT_MS)]);
    let totalBytes = 0;
    const inputs: Array<{ portId: string; file: string }> = [];
    for (const [index, input] of operation.inputs.entries()) {
      assertActive(boundedSignal);
      const asset = await mediaAssetService.get(operation.ownerEmail, input.assetId);
      const file = join(directory, `input-${index}`);
      totalBytes += await download(asset.url, file, INPUT_TOTAL_MAX_BYTES - totalBytes, boundedSignal);
      inputs.push({ portId: input.portId, file });
    }
    if (operation.type !== "edit.video.stitch" && operation.type !== "edit.video.trim") {
      throw new VideoOperationError("VIDEO_INPUT_UNSUPPORTED");
    }
    const output = await renderVideoOperation(
      operation.type, inputs, operation.parameters as Record<string, unknown>, directory, boundedSignal,
    );
    const buffer = await readFile(output.path);
    assertActive(boundedSignal);
    return {
      buffer,
      width: output.width,
      height: output.height,
      durationMs: output.durationMs,
    };
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
