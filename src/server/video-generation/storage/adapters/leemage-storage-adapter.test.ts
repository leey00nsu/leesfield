// @vitest-environment node
import { readFileSync } from "node:fs";
import { videoGenerationDefaults } from "@/features/video-generation/model/video-generation-schema";
const video = (path: string) => "data:video/mp4;base64," + readFileSync(path).toString("base64");

const baseEnv = {
  LEEMAGE_API_KEY: process.env.LEEMAGE_API_KEY,
  LEEMAGE_PROJECT_ID: process.env.LEEMAGE_PROJECT_ID,
  LEEMAGE_BASE_URL: process.env.LEEMAGE_BASE_URL,
};

describe("leemageVideoStorageAdapter", () => {
  afterEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.unmock("leemage-sdk");
    Object.assign(process.env, baseEnv);
  });

  it("returns immutable storage identity for durable Graph completion", async () => {
    const upload = vi.fn().mockResolvedValue({
      id: "video-file-1",
      url: "https://cdn.example.com/video.mp4",
      mimeType: "video/mp4",
      size: 1024,
    });
    vi.resetModules();
    vi.doMock("leemage-sdk", () => ({
      LeemageClient: class { files = { upload }; },
    }));
    Object.assign(process.env, {
      LEEMAGE_API_KEY: "test-key",
      LEEMAGE_PROJECT_ID: "project-id",
    });
    const { leemageVideoStorageAdapter } = await import("./leemage-storage-adapter");
    const result = await leemageVideoStorageAdapter.uploadVideos(
      { ...videoGenerationDefaults, prompt: "hello", model: "video-a" },
      "node-banana-한글",
      [video("public/sample-video.mp4"), video("src/server/video-generation/storage/adapters/fixtures/64x48-2s.mp4")],
      { width: 1280, height: 720, duration_sec: 3,outputs:[{width:1280,height:720,duration_sec:3},{width:640,height:480,duration_sec:8}] },
    );

    expect(upload.mock.calls[0]?.[1].name).toMatch(/^leesfield-[a-f0-9]{64}\.mp4$/);
    expect(result.artifacts).toEqual([
      expect.objectContaining({
        type: "video",
        storageObjectId: "video-file-1",
        bytes: 1024,
        width: 640, height: 360, durationMs: 1000,
      }),
      expect.objectContaining({width:64,height:48,durationMs:2000}),
    ]);
    expect(result.result?.videos.map(v=>({width:v.width,height:v.height,durationSec:v.durationSec}))).toEqual([{width:640,height:360,durationSec:1},{width:64,height:48,durationSec:2}]);
    upload.mockRejectedValueOnce(new Error("storage unavailable"));
    const fallback = await leemageVideoStorageAdapter.uploadVideos(
      { ...videoGenerationDefaults, model: "video-a", prompt: "test", durationSec: 9 },
      "fallback", [video("src/server/video-generation/storage/adapters/fixtures/64x48-2s.mp4")],
    );
    expect(fallback.errorMessage).toBe("storage unavailable");
    expect(fallback.result?.videos[0]).toMatchObject({width:64,height:48,durationSec:2});
  });

  it("rejects invalid output before uploading or inventing metadata", async () => {
    const { leemageVideoStorageAdapter } = await import("./leemage-storage-adapter");
    await expect(leemageVideoStorageAdapter.uploadVideos(
      { ...videoGenerationDefaults, model: "video-a", prompt: "test" }, "invalid",
      ["data:video/mp4;base64,AAAA"], { width: 1280, height: 720, duration_sec: 5 },
    )).rejects.toThrow();
  });
});
