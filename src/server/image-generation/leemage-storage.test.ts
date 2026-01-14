import { imageGenerationDefaults } from "@/features/image-generation/model/image-generation-schema";

const baseEnv = {
  LEEMAGE_API_KEY: process.env.LEEMAGE_API_KEY,
  LEEMAGE_PROJECT_ID: process.env.LEEMAGE_PROJECT_ID,
  LEEMAGE_STORAGE_PROVIDER: process.env.LEEMAGE_STORAGE_PROVIDER,
  LEEMAGE_BASE_URL: process.env.LEEMAGE_BASE_URL,
};

describe("resolveGenerationResult", () => {
  afterEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.unmock("@/shared/lib/leemage-sdk");
    Object.assign(process.env, baseEnv);
  });

  it("LEEMAGE 설정이 없으면 호출 시 오류가 발생한다", async () => {
    Object.assign(process.env, {
      LEEMAGE_API_KEY: "",
      LEEMAGE_PROJECT_ID: "",
      LEEMAGE_STORAGE_PROVIDER: "",
    });

    vi.resetModules();

    const { resolveGenerationResult } = await import(
      "@/server/image-generation/storage/adapters/leemage-storage-adapter"
    );

    await expect(
      resolveGenerationResult(
        { ...imageGenerationDefaults, prompt: "test" },
        "request-id"
      )
    ).rejects.toThrow(/LEEMAGE 설정이 필요합니다/);
  });

  it("업로드 실패 시 fallback 결과와 에러 메시지를 반환한다", async () => {
    const mockUpload = vi.fn().mockRejectedValue(new Error("upload failed"));

    vi.resetModules();
    vi.doMock("@/shared/lib/leemage-sdk", () => ({
      LeemageClient: class {
        files = { upload: mockUpload };
      },
    }));

    Object.assign(process.env, {
      LEEMAGE_API_KEY: "test-key",
      LEEMAGE_PROJECT_ID: "project-id",
      LEEMAGE_STORAGE_PROVIDER: "provider",
    });

    const { resolveGenerationResult } = await import(
      "@/server/image-generation/storage/adapters/leemage-storage-adapter"
    );

    const result = await resolveGenerationResult(
      { ...imageGenerationDefaults, prompt: "test" },
      "request-id"
    );

    expect(mockUpload).toHaveBeenCalled();
    expect(result.status).toBe("completed");
    expect(result.result?.images[0]?.url).toMatch(/^data:image\//);
    expect(result.errorMessage).toBe("upload failed");
  });
});
