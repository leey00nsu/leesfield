import { imageGenerationDefaults } from "@/features/image-generation/model/image-generation-schema";

const baseEnv = {
  LEEMAGE_API_KEY: process.env.LEEMAGE_API_KEY,
  LEEMAGE_PROJECT_ID: process.env.LEEMAGE_PROJECT_ID,
  LEEMAGE_BASE_URL: process.env.LEEMAGE_BASE_URL,
};

describe("leemageStorageAdapter", () => {
  afterEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.unmock("leemage-sdk");
    Object.assign(process.env, baseEnv);
  });

  it("returns immutable storage identity for durable Graph completion", async () => {
    const upload = vi.fn().mockResolvedValue({
      id: "image-file-1",
      url: "https://cdn.example.com/original.png",
      mimeType: "image/png",
      size: 512,
      variants: [{
        url: "https://cdn.example.com/image.webp",
        format: "webp",
        size: 384,
        width: 1024,
        height: 768,
      }],
    });
    vi.resetModules();
    vi.doMock("leemage-sdk", () => ({
      LeemageClient: class { files = { upload }; },
    }));
    Object.assign(process.env, {
      LEEMAGE_API_KEY: "test-key",
      LEEMAGE_PROJECT_ID: "project-id",
    });
    const { leemageStorageAdapter, uploadMediaOperationImages, resolveGenerationResult } = await import("./leemage-storage-adapter");
    const result = await leemageStorageAdapter.uploadImages(
      { ...imageGenerationDefaults, prompt: "hello", width: 1024, height: 768, imageCount: 1 },
      "node-banana-한글",
      ["data:image/png;base64,AAAA"],
    );

    expect(upload.mock.calls[0]?.[1].name).toMatch(/^leesfield-[a-f0-9]{64}\.png$/);
    expect(result.artifacts).toEqual([
      expect.objectContaining({
        type: "image",
        storageObjectId: "image-file-1",
        storageUrl: "https://cdn.example.com/image.webp",
        mimeType: "image/webp",
        bytes: 384,
        width: 1024,
        height: 768,
      }),
    ]);
    await uploadMediaOperationImages("custom-한글", [
      { dataUrl: "data:image/png;base64,AAAA", width: 1, height: 1 },
    ]);
    await resolveGenerationResult(
      { ...imageGenerationDefaults, imageCount: 1 },
      "node-banana-placeholder-한글",
    );
    expect(upload).toHaveBeenCalledTimes(3);
    for (const [, file] of upload.mock.calls) {
      expect(file.name).toMatch(/^leesfield-[a-f0-9]{64}\.[a-z0-9]+$/);
    }
  });
});
