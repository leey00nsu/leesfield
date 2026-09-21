// @vitest-environment node

const baseEnv = {
  LEEMAGE_API_KEY: process.env.LEEMAGE_API_KEY,
  LEEMAGE_PROJECT_ID: process.env.LEEMAGE_PROJECT_ID,
};

describe("uploadInputImages", () => {
  afterEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.unstubAllGlobals();
    vi.unmock("leemage-sdk");
    vi.unmock("@/server/http/safe-remote");
    vi.unmock("@/server/image-generation/storage/storage-selector");
    Object.assign(process.env, baseEnv);
  });

  it("uses a Leesfield ASCII storage name for custom request prefixes", async () => {
    const presign = vi.fn().mockResolvedValue({
      presignedUrl: "https://upload.example/signed",
      objectName: "project/file-1.png",
      objectUrl: "https://storage.example/file.png",
      fileId: "file-1",
    });
    const confirm = vi.fn().mockResolvedValue({
      file: { id: "file-1", url: "https://storage.example/file.png", mimeType: "image/png", size: 68, variants: [] },
    });
    vi.doMock("leemage-sdk", () => ({ LeemageClient: class { files = { presign, confirm }; } }));
    vi.doMock("@/server/http/safe-remote", async () => {
      const actual = await vi.importActual<typeof import("@/server/http/safe-remote")>(
        "@/server/http/safe-remote",
      );
      return {
        ...actual,
        requestRemote: vi.fn().mockResolvedValue({ status: 200, headers: {}, body: Buffer.alloc(0) }),
      };
    });
    vi.doMock("@/server/image-generation/storage/storage-selector", () => ({
      resolveImageStorageProvider: () => ({ provider: "leemage" }),
    }));
    Object.assign(process.env, { LEEMAGE_API_KEY: "test-key", LEEMAGE_PROJECT_ID: "project-id" });
    const { uploadInputImages } = await import("./input-image-uploader");
    await uploadInputImages("node-banana-한글", [
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=",
    ]);
    expect(presign.mock.calls[0]?.[1].fileName).toMatch(/^leesfield-[a-f0-9]{64}\.png$/);
  });

  it("사설망 HTTP 입력 이미지는 fetch 전에 거부한다", async () => {
    const presign = vi.fn();
    const fetchMock = vi.fn();

    vi.stubGlobal("fetch", fetchMock);
    vi.doMock("leemage-sdk", () => ({
      LeemageClient: class {
        files = { presign, confirm: vi.fn() };
      },
    }));
    vi.doMock("@/server/image-generation/storage/storage-selector", () => ({
      resolveImageStorageProvider: () => ({ provider: "leemage" }),
    }));
    Object.assign(process.env, {
      LEEMAGE_API_KEY: "test-key",
      LEEMAGE_PROJECT_ID: "project-id",
    });

    const { INPUT_IMAGE_INVALID, uploadInputImages } = await import(
      "@/server/shared/input-image-uploader"
    );

    await expect(
      uploadInputImages("request-id", ["http://127.0.0.1/private.png"]),
    ).rejects.toThrow(INPUT_IMAGE_INVALID);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(presign).not.toHaveBeenCalled();
  });
});
