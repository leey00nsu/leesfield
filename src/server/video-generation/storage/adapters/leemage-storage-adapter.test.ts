import { videoGenerationDefaults } from "@/features/video-generation/model/video-generation-schema";

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
      ["data:video/mp4;base64,AAAA"],
      { width: 1280, height: 720, duration_sec: 3 },
    );

    expect(upload.mock.calls[0]?.[1].name).toMatch(/^leesfield-[a-f0-9]{64}\.mp4$/);
    expect(result.artifacts).toEqual([
      expect.objectContaining({
        type: "video",
        storageObjectId: "video-file-1",
        bytes: 1024,
        durationMs: 3000,
      }),
    ]);
  });
});
