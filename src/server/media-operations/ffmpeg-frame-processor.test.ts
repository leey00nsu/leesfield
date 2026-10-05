// @vitest-environment node
import { execFile, execFileSync } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { hasFfmpegVideoProcessor } from "./ffmpeg-video-processor";
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
  }, 30000);

  it("rejects audio-only input and cancellation without publishing a frame", async () => {
    const audio = join(directory, "audio.m4a");
    await ffmpeg(["-f", "lavfi", "-i", "sine=duration=0.1", "-c:a", "aac", audio]);
    await expect(renderVideoFrames(audio, directory, new AbortController().signal)).rejects.toMatchObject({ code: "VIDEO_INPUT_UNSUPPORTED" });
    const controller = new AbortController(); controller.abort();
    await expect(renderVideoFrames(audio, directory, controller.signal)).rejects.toMatchObject({ code: "MEDIA_OPERATION_CANCELLED" });
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
});
