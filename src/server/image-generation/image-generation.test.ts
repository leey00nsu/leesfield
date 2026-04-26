import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockGetModelCatalog = vi.hoisted(() => vi.fn());
const mockHfGenerate = vi.hoisted(() => vi.fn());
const mockHfMapError = vi.hoisted(() => vi.fn(() => "HF mapped error"));
const mockCodexGenerate = vi.hoisted(() => vi.fn());
const mockCodexMapError = vi.hoisted(() => vi.fn(() => "Codex mapped error"));
const mockResolveImageStorageProvider = vi.hoisted(() => vi.fn());
const mockLeemageUploadImages = vi.hoisted(() => vi.fn());

vi.mock("@/server/model-catalog/catalog-service", () => ({
  getModelCatalog: mockGetModelCatalog,
}));

vi.mock("@/server/image-generation/adapters/hf-space-adapter", () => ({
  hfSpaceImageAdapter: {
    generate: mockHfGenerate,
    mapError: mockHfMapError,
  },
}));

vi.mock("@/server/image-generation/adapters/codex-cli-adapter", () => ({
  codexCliImageAdapter: {
    generate: mockCodexGenerate,
    mapError: mockCodexMapError,
  },
}));

vi.mock("@/server/image-generation/storage/storage-selector", () => ({
  resolveImageStorageProvider: mockResolveImageStorageProvider,
}));

vi.mock("@/server/image-generation/storage/adapters/leemage-storage-adapter", () => ({
  leemageStorageAdapter: {
    uploadImages: mockLeemageUploadImages,
  },
}));

function catalogModel(key: string, provider: "hf_space" | "codex_cli") {
  return {
    id: `image-${key}`,
    type: "image",
    key,
    label: key,
    vendor: provider === "codex_cli" ? "OPENAI" : "HF",
    provider,
    providerConfig:
      provider === "codex_cli"
        ? {
            command: "codex",
            model_id: "gpt-image-2",
            timeout_ms: 300000,
          }
        : {
            space_id: "demo/space",
            api_name: "/generate_image",
            timeout_ms: 300000,
          },
    parameters: {},
    meta: {},
    isActive: true,
    isDefault: false,
  };
}

function payload(model: string) {
  return {
    prompt: "a red house",
    model,
    width: 1024,
    height: 1024,
    imageCount: 1,
    steps: 1,
    seed: "",
    initImages: [],
  };
}

describe("resolveImageGenerationResult provider dispatch", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    mockResolveImageStorageProvider.mockReturnValue({
      provider: null,
      warningMessage: "no storage configured",
    });
    mockHfGenerate.mockResolvedValue({
      images: ["data:image/png;base64,aGY="],
    });
    mockCodexGenerate.mockResolvedValue({
      images: ["data:image/png;base64,Y29kZXg="],
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("hf_space 이미지 모델은 기존 HF Space adapter로 라우팅한다", async () => {
    mockGetModelCatalog.mockResolvedValue([catalogModel("z-image-turbo", "hf_space")]);

    const { resolveImageGenerationResult } = await import(
      "@/server/image-generation/image-generation"
    );
    const result = await resolveImageGenerationResult(
      payload("z-image-turbo"),
      "req-hf",
    );

    expect(mockHfGenerate).toHaveBeenCalledWith(
      expect.objectContaining({ model: "z-image-turbo" }),
    );
    expect(mockCodexGenerate).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      status: "completed",
      skipDbSave: true,
      result: {
        images: [
          {
            url: "data:image/png;base64,aGY=",
            width: 1024,
            height: 1024,
          },
        ],
      },
    });
  });

  it("codex_cli 이미지 모델은 Codex CLI adapter로 라우팅한다", async () => {
    mockGetModelCatalog.mockResolvedValue([
      catalogModel("gpt-image-2-codex", "codex_cli"),
    ]);

    const { resolveImageGenerationResult } = await import(
      "@/server/image-generation/image-generation"
    );
    const result = await resolveImageGenerationResult(
      payload("gpt-image-2-codex"),
      "req-codex",
    );

    expect(mockCodexGenerate).toHaveBeenCalledWith(
      expect.objectContaining({ model: "gpt-image-2-codex" }),
    );
    expect(mockHfGenerate).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      status: "completed",
      skipDbSave: true,
      result: {
        images: [
          {
            url: "data:image/png;base64,Y29kZXg=",
            width: 1024,
            height: 1024,
          },
        ],
      },
    });
  });

  it("catalog에 없는 이미지 모델은 adapter 호출 없이 실패한다", async () => {
    mockGetModelCatalog.mockResolvedValue([]);

    const { resolveImageGenerationResult } = await import(
      "@/server/image-generation/image-generation"
    );
    const result = await resolveImageGenerationResult(
      payload("missing-model"),
      "req-missing",
    );

    expect(mockHfGenerate).not.toHaveBeenCalled();
    expect(mockCodexGenerate).not.toHaveBeenCalled();
    expect(result).toEqual({
      status: "failed",
      errorMessage: "IMAGE_MODEL_NOT_FOUND:missing-model",
    });
  });
});
