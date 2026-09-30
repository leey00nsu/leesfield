import { execFile, execFileSync } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

import { hasFfmpegVideoProcessor, renderVideoOperation } from "./ffmpeg-video-processor";

const runFile = promisify(execFile);
const available = await hasFfmpegVideoProcessor();

async function ffmpeg(args: string[]) {
  await runFile("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", ...args], { timeout: 30_000 });
}

async function probe(file: string) {
  const { stdout } = await runFile("ffprobe", [
    "-v", "error", "-show_entries", "format=duration:stream=codec_type,sample_rate,width,height",
    "-of", "json", file,
  ]);
  return JSON.parse(stdout) as {
    streams: Array<{ codec_type: string; sample_rate?: string; width?: number; height?: number }>;
    format: { duration: string };
  };
}

async function maxVolume(file: string, start: number) {
  const { stderr } = await runFile("ffmpeg", [
    "-hide_banner", "-ss", String(start), "-i", file, "-t", "0.15",
    "-vn", "-af", "volumedetect", "-f", "null", "-",
  ], { timeout: 30_000 });
  const match = stderr.match(/max_volume: (-?[\d.]+) dB/);
  return match ? Number(match[1]) : -Infinity;
}

function centerPixel(file: string, second: number) {
  const pixel = execFileSync("ffmpeg", [
    "-hide_banner", "-loglevel", "error", "-ss", String(second), "-i", file,
    "-frames:v", "1", "-vf", "scale=1:1", "-f", "rawvideo", "-pix_fmt", "rgb24", "-",
  ], { timeout: 30_000 });
  return [pixel[0], pixel[1], pixel[2]];
}

describe.runIf(available)("FFmpeg video operations with real AAC and silent media", () => {
  let directory: string;
  let clipA: string;
  let clipB: string;
  let clipC: string;
  let soundtrack: string;

  beforeAll(async () => {
    directory = await mkdtemp(join(tmpdir(), "leesfield-video-test-"));
    clipA = join(directory, "aac-32k.mp4");
    clipB = join(directory, "silent.mp4");
    clipC = join(directory, "aac-44k.mp4");
    soundtrack = join(directory, "soundtrack.m4a");
    await ffmpeg([
      "-f", "lavfi", "-i", "color=c=red:s=320x180:r=24:d=0.6",
      "-f", "lavfi", "-i", "sine=frequency=800:sample_rate=32000:duration=0.6",
      "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest", clipA,
    ]);
    await ffmpeg([
      "-f", "lavfi", "-i", "color=c=blue:s=240x320:r=15:d=0.6",
      "-c:v", "libx264", "-pix_fmt", "yuv420p", clipB,
    ]);
    await ffmpeg([
      "-f", "lavfi", "-i", "color=c=green:s=160x90:r=30:d=0.6",
      "-f", "lavfi", "-i", "sine=frequency=1400:sample_rate=44100:duration=0.6",
      "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest", clipC,
    ]);
    await ffmpeg(["-f", "lavfi", "-i", "sine=frequency=500:duration=1", "-c:a", "aac", soundtrack]);
  }, 60_000);

  afterAll(async () => {
    if (directory) await rm(directory, { recursive: true, force: true });
  });

  it("keeps AAC 32 kHz audio, silent clip timing, mixed formats and repeat order", async () => {
    const output = await renderVideoOperation("edit.video.stitch", [
      { portId: "clips", file: clipA }, { portId: "clips", file: clipB }, { portId: "clips", file: clipC },
    ], { repeat: 2, stripAudio: false }, directory, new AbortController().signal);
    const metadata = await probe(output.path);
    expect(Number(metadata.format.duration)).toBeGreaterThan(3.3);
    expect(Number(metadata.format.duration)).toBeLessThan(3.9);
    expect(metadata.streams.find((stream) => stream.codec_type === "audio")?.sample_rate).toBe("48000");
    expect(metadata.streams.find((stream) => stream.codec_type === "video")).toMatchObject({ width: 320, height: 180 });
    expect(await maxVolume(output.path, 0.2)).toBeGreaterThan(-40);
    expect(await maxVolume(output.path, 0.8)).toBeLessThan(-60);
    expect(await maxVolume(output.path, 1.4)).toBeGreaterThan(-40);
    expect(await maxVolume(output.path, 2.6)).toBeLessThan(-60);
    expect(centerPixel(output.path, 0.3)[0]).toBeGreaterThan(150);
    expect(centerPixel(output.path, 0.9)[2]).toBeGreaterThan(100);
    expect(centerPixel(output.path, 1.5)[1]).toBeGreaterThan(50);
    expect(centerPixel(output.path, 2.1)[0]).toBeGreaterThan(150);
  }, 60_000);

  it("replaces embedded audio with soundtrack and strips all audio when requested", async () => {
    const inputs = [
      { portId: "clips", file: clipA }, { portId: "clips", file: clipB },
      { portId: "soundtrack", file: soundtrack },
    ];
    const withSoundtrack = await renderVideoOperation("edit.video.stitch", inputs,
      { repeat: 1, stripAudio: false }, directory, new AbortController().signal);
    expect((await probe(withSoundtrack.path)).streams.some((stream) => stream.codec_type === "audio")).toBe(true);
    expect(await maxVolume(withSoundtrack.path, 0.8)).toBeGreaterThan(-40);
    const stripped = await renderVideoOperation("edit.video.stitch", inputs,
      { repeat: 1, stripAudio: true }, directory, new AbortController().signal);
    expect((await probe(stripped.path)).streams.some((stream) => stream.codec_type === "audio")).toBe(false);
  }, 60_000);

  it("does not add an audio track when every clip is silent", async () => {
    const result = await renderVideoOperation("edit.video.stitch", [
      { portId: "clips", file: clipB }, { portId: "clips", file: clipB },
    ], { repeat: 1, stripAudio: false }, directory, new AbortController().signal);
    expect((await probe(result.path)).streams.some((stream) => stream.codec_type === "audio")).toBe(false);
  }, 60_000);

  it("trims the requested interval with sound and supports stripAudio", async () => {
    const inputs = [{ portId: "video", file: clipA }];
    const trimmed = await renderVideoOperation("edit.video.trim", inputs,
      { startMs: 100, endMs: 500, stripAudio: false }, directory, new AbortController().signal);
    expect(Number((await probe(trimmed.path)).format.duration)).toBeCloseTo(0.4, 1);
    expect(await maxVolume(trimmed.path, 0.1)).toBeGreaterThan(-40);
    const silent = await renderVideoOperation("edit.video.trim", inputs,
      { startMs: 100, endMs: 500, stripAudio: true }, directory, new AbortController().signal);
    expect((await probe(silent.path)).streams.some((stream) => stream.codec_type === "audio")).toBe(false);
    await expect(renderVideoOperation("edit.video.trim", inputs,
      { startMs: 500, endMs: 700, stripAudio: false }, directory, new AbortController().signal))
      .rejects.toMatchObject({ code: "VIDEO_INTERVAL_INVALID" });
  }, 60_000);
});
