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
    const file = {
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
    };
    const presign = vi.fn().mockResolvedValue({
      presignedUrl: "https://upload.example/signed",
      objectName: "project/image-file-1.png",
      objectUrl: file.url,
      fileId: file.id,
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    });
    const confirm = vi.fn().mockResolvedValue({ file });
    vi.resetModules();
    vi.doMock("leemage-sdk", () => ({
      LeemageClient: class { files = { presign, confirm }; },
    }));
    vi.doMock("@/server/http/safe-remote", () => ({
      requestRemote: vi.fn().mockResolvedValue({ status: 200, headers: {}, body: Buffer.alloc(0) }),
    }));
    vi.doMock("@/server/media-assets/media-cleanup-repository", () => ({
      cleanupUploadRetryAt: () => new Date(),
      createStorageCleanupIntent: vi.fn().mockResolvedValue({ id: "cleanup" }),
      queueStorageCleanup: vi.fn().mockResolvedValue({ id: "cleanup" }),
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

    expect(presign.mock.calls[0]?.[1].fileName).toMatch(/^leesfield-[a-f0-9]{64}\.png$/);
    expect(result.artifacts).toEqual([
      expect.objectContaining({
        type: "image",
        storageObjectId: "image-file-1",
        storageUrl: "https://cdn.example.com/original.png",
        mimeType: "image/png",
        bytes: 512,
        imageVariants: expect.objectContaining({display: expect.objectContaining({url: "https://cdn.example.com/image.webp", bytes: 384})}),
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
    expect(presign).toHaveBeenCalledTimes(3);
    for (const [, request] of presign.mock.calls) {
      expect(request.fileName).toMatch(/^leesfield-[a-f0-9]{64}\.[a-z0-9]+$/);
    }
    for (const [, request] of confirm.mock.calls) {
      expect(request.variants).toEqual([{sizeLabel: "source", format: "webp"}]);
    }
  });
});
