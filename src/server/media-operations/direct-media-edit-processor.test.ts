// @vitest-environment node
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { hasFfmpegVideoProcessor } from "./ffmpeg-video-processor";
import { renderDirectMediaEdit } from "./direct-media-edit-processor";
import type { DirectEdit, DirectEditSnapshot } from "@/shared/media-assets/direct-media-edit";
const run = promisify(execFile);
const available = await hasFfmpegVideoProcessor();
const signal = () => new AbortController().signal;
describe.runIf(available)("direct crop/trim decoded file contract", () => {
  let directory: string, image: string, video: string;
  const s = (edit: DirectEdit, durationMs: number | null): DirectEditSnapshot => ({ requestId: "f6fffe08-71d9-42d3-9f46-a797c8942cc9",
    sourceNodeId: "source", sourceAssetId: "asset", sourceVersion: 1, resultNodeId: "result", resultEdgeId: "edge", width: 200, height: 100, durationMs, edit });
  const ffmpeg = (args: string[]) => run("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", ...args], { timeout: 30000 });
  beforeAll(async () => {
    directory = await mkdtemp(join(tmpdir(), "direct-render-test-")); image = join(directory, "source.png"); video = join(directory, "source.mp4");
    await ffmpeg(["-f", "lavfi", "-i", "color=red:s=200x100,drawbox=x=100:y=0:w=100:h=100:color=blue:t=fill", "-frames:v", "1", image]);
    await ffmpeg(["-f", "lavfi", "-i", "color=red:s=200x100:r=25:d=2", "-f", "lavfi", "-i", "color=blue:s=200x100:r=25:d=2",
      "-f", "lavfi", "-i", "sine=frequency=440:duration=2", "-f", "lavfi", "-i", "sine=frequency=880:duration=2",
      "-filter_complex", "[0:v][1:v]concat=n=2:v=1:a=0[v];[2:a][3:a]concat=n=2:v=0:a=1[a]", "-map", "[v]", "-map", "[a]",
      "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", video]);
  }, 60000);
  afterAll(async () => { if (directory) await rm(directory, { recursive: true, force: true }); });
  it("extracts the requested off-centre pixels and exact image size", async () => {
    const out = await renderDirectMediaEdit(image, s({ kind: "image.crop", rect: { x: 140, y: 20, width: 30, height: 40 } }, null), directory, signal());
    expect(out).toMatchObject({ width: 30, height: 40, durationMs: null });
    const file = join(directory, "sample.png"); await writeFile(file, out.buffer);
    const pixel = await run("ffmpeg", ["-v", "error", "-i", file, "-frames:v", "1", "-vf", "scale=1:1", "-f", "rawvideo", "-pix_fmt", "rgb24", "-"], { encoding: "buffer" });
    expect(pixel.stdout[2]).toBeGreaterThan(200); expect(pixel.stdout[0]).toBeLessThan(30);
  });
  it("selects the later blue scene and its 880Hz sound, preserving a one-second interval", async () => {
    const out = await renderDirectMediaEdit(video, s({ kind: "video.trim", startMs: 2500, endMs: 3500 }, 4000), directory, signal());
    expect(out.durationMs).toBeCloseTo(1000, -2);
    const file = join(directory, "trim-check.mp4"); await writeFile(file, out.buffer);
    const pixel = await run("ffmpeg", ["-v", "error", "-i", file, "-frames:v", "1", "-vf", "scale=1:1", "-f", "rawvideo", "-pix_fmt", "rgb24", "-"], { encoding: "buffer" });
    expect(pixel.stdout[2]).toBeGreaterThan(180);
    const audio = await run("ffmpeg", ["-v", "error", "-i", file, "-vn", "-t", "0.5", "-ac", "1", "-ar", "8000", "-f", "s16le", "-"], { encoding: "buffer" });
    let crossings = 0, previous = 0;
    for (let i = 0; i + 1 < audio.stdout.length; i += 2) { const sample = audio.stdout.readInt16LE(i); if (sample > 0 && previous <= 0) crossings++; previous = sample; }
    expect(crossings / 0.5).toBeGreaterThan(830); expect(crossings / 0.5).toBeLessThan(930);
  });
  it("crops video spatially while keeping its whole duration and sound", async () => {
    const out = await renderDirectMediaEdit(video, s({ kind: "video.crop", rect: { x: 20, y: 10, width: 120, height: 70 } }, 4000), directory, signal());
    expect(out).toMatchObject({ width: 120, height: 70 }); expect(out.durationMs).toBeCloseTo(4000, -2);
    const file = join(directory, "crop-check.mp4"); await writeFile(file, out.buffer);
    const metadata = await run("ffprobe", ["-v", "error", "-select_streams", "a", "-show_entries", "stream=codec_type", "-of", "json", file]);
    expect(JSON.parse(metadata.stdout).streams).toHaveLength(1);
  });
  it("rejects bounds and abort before decoding", async () => {
    await expect(renderDirectMediaEdit(video, s({ kind: "video.trim", startMs: 0, endMs: 1 }, 4000), directory, signal())).rejects.toMatchObject({ code: "EDIT_RANGE_INVALID" });
    await expect(renderDirectMediaEdit(video, s({ kind: "video.crop", rect: { x: 190, y: 0, width: 100, height: 20 } }, 4000), directory, signal())).rejects.toMatchObject({ code: "EDIT_RANGE_INVALID" });
    await expect(renderDirectMediaEdit(video, s({ kind: "video.trim", startMs: 0, endMs: 1000 }, 4000), directory, AbortSignal.abort())).rejects.toMatchObject({ code: "MEDIA_OPERATION_CANCELLED" });
  });
});
