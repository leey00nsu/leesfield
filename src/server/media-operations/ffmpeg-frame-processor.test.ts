// @vitest-environment node
import { execFile, execFileSync } from "node:child_process";
import { mkdtemp, rm, truncate, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { hasFfmpegVideoProcessor, videoProcessorLimits } from "./ffmpeg-video-processor";
import * as videoProcessor from "./ffmpeg-video-processor";
import { renderVideoFrames } from "./ffmpeg-frame-processor";

const run = promisify(execFile);
const available = await hasFfmpegVideoProcessor();
const ffmpeg = (args: string[]) => run("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", ...args], { timeout: 30000 });
const pixel = (png: Buffer) => execFileSync("ffmpeg", ["-v", "error", "-i", "pipe:0", "-vf", "scale=1:1", "-frames:v", "1", "-f", "rawvideo", "-pix_fmt", "rgb24", "pipe:1"], { input: png, timeout: 30000 });

describe.runIf(available)("first and final decoded video frames", () => {
  let directory: string;
  beforeAll(async () => { directory = await mkdtemp(join(tmpdir(), "leesfield-frame-test-")); });
  afterAll(async () => { if (directory) await rm(directory, { recursive: true, force: true }); });

  it.each(["ordinary", "long-audio", "variable-rate", "unknown-stream-duration"])("preserves red first / blue final frames: %s", async (variant) => {
    const file = join(directory, variant === "unknown-stream-duration" ? "frames.webm" : `${variant}.mp4`);
    const extraAudio = variant === "long-audio" ? ["-f", "lavfi", "-i", "sine=duration=6"] : [];
    const vfr = variant === "variable-rate" ? ",setpts='if(lt(N,12),N/(24*TB),0.5+(N-12)/(6*TB))'" : "";
    await ffmpeg(["-f", "lavfi", "-i", `color=red:s=160x90:r=24:d=${variant === "variable-rate" ? 0.5 : 4}`, "-f", "lavfi", "-i", "color=blue:s=160x90:r=24:d=0.5", ...extraAudio,
      "-filter_complex", `[0:v][1:v]concat=n=2:v=1:a=0${vfr}[v]`, "-map", "[v]", ...(extraAudio.length ? ["-map", "2:a", "-c:a", "aac"] : []),
      "-fps_mode", "vfr", "-c:v", variant === "unknown-stream-duration" ? "libvpx-vp9" : "libx264", "-pix_fmt", "yuv420p", file]);
    if (variant === "unknown-stream-duration") {
      const probe = await run("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=duration", "-of", "json", file]);
      expect(JSON.parse(probe.stdout).streams[0].duration).toBeUndefined();
    }
    const [start, end] = await renderVideoFrames(file, directory, new AbortController().signal);
    expect([start.outputPortId, end.outputPortId]).toEqual(["startFrame", "endFrame"]);
    expect(pixel(start.buffer)[0]).toBeGreaterThan(200);
    expect(pixel(end.buffer)[2]).toBeGreaterThan(200);
    expect(start).toMatchObject({ width: 160, height: 90 });
    expect(end).toMatchObject({ width: 160, height: 90 });
    const metadata = await run("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "json", file]);
    const durationMs = Math.round(Number(JSON.parse(metadata.stdout).format.duration) * 1000);
    for (const timestampMs of [0, durationMs - 1, durationMs]) {
      const frames = await renderVideoFrames(file, directory, new AbortController().signal, timestampMs);
      expect(frames).toHaveLength(1);
      expect(frames[0]).toMatchObject({ outputPortId: "frame", width: 160, height: 90 });
      expect(pixel(frames[0].buffer)[timestampMs === 0 ? 0 : 2]).toBeGreaterThan(200);
    }
    await expect(renderVideoFrames(file, directory, new AbortController().signal, durationMs + 1))
      .rejects.toMatchObject({ code: "VIDEO_INPUT_UNSUPPORTED" });
  }, 30000);

  it("returns the displayed red/green/blue frame at multiple independently known times, boundaries and EOF", async () => {
    const file = join(directory, "three-colors.mp4");
    await ffmpeg(["-f", "lavfi", "-i", "color=red:s=160x90:r=4:d=1", "-f", "lavfi", "-i", "color=lime:s=160x90:r=4:d=1",
      "-f", "lavfi", "-i", "color=blue:s=160x90:r=4:d=1", "-filter_complex", "[0:v][1:v][2:v]concat=n=3:v=1:a=0[v]",
      "-map", "[v]", "-c:v", "libx264", "-pix_fmt", "yuv420p", file]);
    for (const [timestampMs, channel] of [[0, 0], [500, 0], [999, 0], [1000, 1], [1250, 1], [1999, 1], [2000, 2], [2999, 2], [3000, 2]]) {
      const frames = await renderVideoFrames(file, directory, new AbortController().signal, timestampMs);
      expect(frames).toHaveLength(1);
      expect(frames[0].outputPortId).toBe("frame");
      const rgb = pixel(frames[0].buffer);
      expect([...rgb].map((value, index) => index === channel ? value > 200 : value < 50), `timestamp ${timestampMs}: ${[...rgb]}`).toEqual([true, true, true]);
    }
    const legacy = await renderVideoFrames(file, directory, new AbortController().signal);
    expect(legacy.map(frame => frame.outputPortId)).toEqual(["startFrame", "endFrame"]);
    expect(pixel(legacy[0].buffer)[0]).toBeGreaterThan(200);
    expect(pixel(legacy[1].buffer)[2]).toBeGreaterThan(200);
    for (const timestampMs of [-1, 0.5, 3001, 600_001, NaN, Infinity, -Infinity]) {
      await expect(renderVideoFrames(file, directory, new AbortController().signal, timestampMs))
        .rejects.toMatchObject({ code: "VIDEO_INPUT_UNSUPPORTED" });
    }
  }, 30000);

  it("retains a VFR frame held across a seek window instead of selecting the next color", async () => {
    const file = join(directory, "held-vfr.mp4");
    await ffmpeg(["-f", "lavfi", "-i", "color=red:s=160x90:r=1:d=1", "-f", "lavfi", "-i", "color=blue:s=160x90:r=1:d=1",
      "-f", "lavfi", "-i", "color=lime:s=160x90:r=1:d=1", "-filter_complex", "[0:v][1:v][2:v]concat=n=3:v=1:a=0,setpts=N*5/TB[v]",
      "-map", "[v]", "-fps_mode", "vfr", "-c:v", "libx264", "-pix_fmt", "yuv420p", file]);
    for (const [timestampMs, channel] of [[4500, 0], [5000, 2], [9500, 2], [10_000, 1]]) {
      const frames = await renderVideoFrames(file, directory, new AbortController().signal, timestampMs);
      expect(frames).toHaveLength(1);
      expect(pixel(frames[0].buffer)[channel], `timestamp ${timestampMs}`).toBeGreaterThan(200);
    }
  }, 30000);

  it("accepts a short single-frame video and applies rotation and display aspect", async () => {
    const one = join(directory, "one.mp4");
    await ffmpeg(["-f", "lavfi", "-i", "color=red:s=160x90:r=24:d=0.1", "-frames:v", "1", "-vf", "setsar=2", "-c:v", "libx264", one]);
    const single = await renderVideoFrames(one, directory, new AbortController().signal);
    expect(single[0].buffer).toEqual(single[1].buffer);
    expect(single[0]).toMatchObject({ width: 320, height: 90 });
    const rotated = join(directory, "rotated.mp4");
    await ffmpeg(["-display_rotation", "90", "-i", one, "-c", "copy", rotated]);
    const probe = await run("ffprobe", ["-v", "error", "-show_entries", "stream_side_data=rotation", "-of", "json", rotated]);
    expect(Math.abs(JSON.parse(probe.stdout).streams[0].side_data_list[0].rotation)).toBe(90);
    const frames = await renderVideoFrames(rotated, directory, new AbortController().signal);
    expect(frames[0]).toMatchObject({ width: 90, height: 320 });
    expect(frames[1]).toMatchObject({ width: 90, height: 320 });
    expect(pixel(frames[1].buffer)[0]).toBeGreaterThan(200);
    const [point] = await renderVideoFrames(rotated, directory, new AbortController().signal, 0);
    expect(point).toMatchObject({ outputPortId: "frame", width: 90, height: 320 });
    expect(pixel(point.buffer)[0]).toBeGreaterThan(200);
  }, 30000);

  it("rejects audio-only input and cancellation without publishing a frame", async () => {
    const audio = join(directory, "audio.m4a");
    await ffmpeg(["-f", "lavfi", "-i", "sine=duration=0.1", "-c:a", "aac", audio]);
    await expect(renderVideoFrames(audio, directory, new AbortController().signal)).rejects.toMatchObject({ code: "VIDEO_INPUT_UNSUPPORTED" });
    const controller = new AbortController(); controller.abort();
    await expect(renderVideoFrames(audio, directory, controller.signal)).rejects.toMatchObject({ code: "MEDIA_OPERATION_CANCELLED" });
    const timedOut = new AbortController(); timedOut.abort(new DOMException("Time budget exhausted", "TimeoutError"));
    await expect(renderVideoFrames(audio, directory, timedOut.signal, 0)).rejects.toMatchObject({ code: "VIDEO_PROCESSOR_TIMEOUT" });
  });

  it("enforces duration and display-dimension limits before image decoding", async () => {
    const long = join(directory, "too-long.mp4"), wide = join(directory, "too-wide.mp4");
    await ffmpeg(["-f", "lavfi", "-i", "color=red:s=160x90:r=1:d=601", "-c:v", "libx264", long]);
    const metadata = await run("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "json", long]);
    expect(Number(JSON.parse(metadata.stdout).format.duration)).toBeGreaterThan(600);
    await ffmpeg(["-f", "lavfi", "-i", "color=red:s=4200x2:r=24:d=0.1", "-vf", "setsar=2", "-c:v", "libx264", wide]);
    for (const file of [long, wide]) await expect(renderVideoFrames(file, directory, new AbortController().signal))
      .rejects.toMatchObject({ code: "VIDEO_INPUT_UNSUPPORTED" });
  });

  it("rejects oversized input bytes and decoded pixels before starting image decoding", async () => {
    const file = join(directory, "oversized-input");
    await writeFile(file, "small");
    await truncate(file, videoProcessorLimits.inputBytes + 1);
    await expect(renderVideoFrames(file, directory, new AbortController().signal, 0)).rejects.toMatchObject({ code: "VIDEO_INPUT_TOO_LARGE" });
    await truncate(file, 5);
    const probe = vi.spyOn(videoProcessor, "runVideoProcess").mockResolvedValue({ stdout: JSON.stringify({
      streams: [{ width: 8192, height: 4097, duration: "1" }], format: { duration: "1" },
    }), stderr: "" });
    try {
      await expect(renderVideoFrames(file, directory, new AbortController().signal, 0)).rejects.toMatchObject({ code: "VIDEO_INPUT_UNSUPPORTED" });
      expect(probe).toHaveBeenCalledOnce();
      expect(probe.mock.calls[0][0]).toBe("ffprobe");
    } finally { probe.mockRestore(); }
  });
});
