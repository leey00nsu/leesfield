// @vitest-environment node

import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { vi } from "vitest";

const mock = vi.hoisted(() => ({ get: vi.fn(), requestRemote: vi.fn() }));
vi.mock("@/server/media-assets/media-asset-service", () => ({ mediaAssetService: { get: mock.get } }));
vi.mock("@/server/http/safe-remote", () => ({ requestRemote: mock.requestRemote }));

import { prepareAssistantVisuals } from "./assistant-visuals";

it("samples three bounded, timestamped frames from an owned video", async () => {
  const directory = await mkdtemp(join(tmpdir(), "assistant-test-"));
  try {
    const path = join(directory, "clip.mp4");
    await promisify(execFile)("ffmpeg", ["-v", "error", "-f", "lavfi", "-i", "testsrc=size=96x64:rate=10:duration=2",
      "-c:v", "libx264", "-pix_fmt", "yuv420p", "-y", path], { timeout: 15_000 });
    const body = await readFile(path);
    mock.get.mockResolvedValue({ type: "video", mimeType: "video/mp4", bytes: String(body.length), durationMs: 2_000, url: "https://storage.example/clip.mp4" });
    mock.requestRemote.mockResolvedValue({ status: 200, body });
    const visuals = await prepareAssistantVisuals("owner@example.com", {
      instruction: "describe", text: null,
      assets: [{ assetId: "owned-video", type: "video", portId: "videos", sortOrder: 0 }],
    }, new AbortController().signal);
    expect(mock.get).toHaveBeenCalledWith("owner@example.com", "owned-video");
    expect(visuals).toHaveLength(3);
    expect(visuals.map((frame) => frame.label)).toEqual([
      "Video frame at 0.0 seconds", "Video frame at 1.0 seconds", "Video frame at 1.8 seconds",
    ]);
    expect(visuals.every((frame) => frame.mimeType === "image/jpeg" && frame.data.length > 100)).toBe(true);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
