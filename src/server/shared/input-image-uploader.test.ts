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
    vi.unmock("@/server/image-generation/storage/storage-selector");
    Object.assign(process.env, baseEnv);
  });

  it("사설망 HTTP 입력 이미지는 fetch 전에 거부한다", async () => {
    const upload = vi.fn();
    const fetchMock = vi.fn();

    vi.stubGlobal("fetch", fetchMock);
    vi.doMock("leemage-sdk", () => ({
      LeemageClient: class {
        files = { upload };
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
    expect(upload).not.toHaveBeenCalled();
  });
});
