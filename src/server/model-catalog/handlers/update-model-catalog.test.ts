import { beforeEach, describe, expect, it, vi } from "vitest";

const mockGetModelCatalogRecordByKey = vi.hoisted(() => vi.fn());
const mockInvalidateModelCatalogCache = vi.hoisted(() => vi.fn());
const mockUpdateMany = vi.hoisted(() => vi.fn());
const mockUpdate = vi.hoisted(() => vi.fn());
const mockTransaction = vi.hoisted(() => vi.fn());

vi.mock("@/server/model-catalog/catalog-repository", () => ({
  getModelCatalogRecordByKey: mockGetModelCatalogRecordByKey,
}));

vi.mock("@/server/model-catalog/catalog-service", () => ({
  invalidateModelCatalogCache: mockInvalidateModelCatalogCache,
}));

vi.mock("@/server/db/prisma", () => ({
  prisma: {
    $transaction: mockTransaction,
  },
}));

const imageParameters = {
  prompt: { ui: "textarea", required: true },
  width: { ui: "hidden", min: 1024, max: 1024, step: 1, default: 1024 },
  height: { ui: "hidden", min: 1024, max: 1024, step: 1, default: 1024 },
  steps: { ui: "hidden", min: 1, max: 1, step: 1, default: 1 },
  imageCount: { ui: "hidden", min: 1, max: 1, default: 1 },
};

const imageMeta = {
  pipeline: "image_generation",
  model_id: "gpt-image-2",
  default_width: 1024,
  default_height: 1024,
  default_steps: 1,
  concurrent_limit: 1,
  max_input_images: 1,
};

const videoParameters = {
  prompt: { ui: "textarea", required: true },
  durationSec: { ui: "hidden", min: 5, max: 5, default: 5 },
  steps: { ui: "hidden", min: 1, max: 1, default: 1 },
  guidanceScale: { ui: "hidden", min: 1, max: 1, default: 1 },
};

const videoMeta = {
  supports_init_image: false,
  t2v_model_id: "video-model",
  default_width: 1280,
  default_height: 720,
  default_duration_sec: 5,
  default_fps: 24,
  default_steps: 1,
  default_guidance_scale: 1,
  concurrent_limit: 1,
};

function imageRecord() {
  return {
    type: "image",
    key: "gpt-image-2-codex",
    label: "GPT Image 2",
    vendor: "OPENAI",
    provider: "hf_space",
    providerConfig: {
      space_id: "demo/space",
      api_name: "/generate_image",
    },
    parameters: imageParameters,
    meta: imageMeta,
    isActive: true,
    isDefault: false,
  };
}

function videoRecord() {
  return {
    type: "video",
    key: "video-model",
    label: "Video Model",
    vendor: "HF",
    provider: "hf_space",
    providerConfig: {
      space_id: "demo/video",
      api_name: "/generate_video",
    },
    parameters: videoParameters,
    meta: videoMeta,
    isActive: true,
    isDefault: false,
  };
}

describe("updateModelCatalogHandler provider validation", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mockTransaction.mockImplementation(async (callback) =>
      callback({
        modelCatalog: {
          updateMany: mockUpdateMany,
          update: mockUpdate,
        },
      }),
    );
    mockUpdate.mockResolvedValue({ key: "gpt-image-2-codex" });
  });

  it("image 모델은 codex_cli provider 업데이트를 허용한다", async () => {
    mockGetModelCatalogRecordByKey.mockResolvedValue(imageRecord());
    const { updateModelCatalogHandler } = await import(
      "@/server/model-catalog/handlers/update-model-catalog"
    );

    await expect(
      updateModelCatalogHandler({
        key: "gpt-image-2-codex",
        payload: {
          provider: "codex_cli",
          providerConfig: {
            command: "codex",
            model_id: "gpt-image-2",
            agent_model: "gpt-5.5",
            timeout_ms: 300000,
          },
        },
      }),
    ).resolves.toEqual({ key: "gpt-image-2-codex" });

    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          provider: "codex_cli",
          providerConfig: expect.objectContaining({
            command: "codex",
            model_id: "gpt-image-2",
            agent_model: "gpt-5.5",
          }),
        }),
      }),
    );
    expect(mockInvalidateModelCatalogCache).toHaveBeenCalled();
  });

  it("video 모델은 codex_cli provider 업데이트를 거부한다", async () => {
    mockGetModelCatalogRecordByKey.mockResolvedValue(videoRecord());
    const { updateModelCatalogHandler } = await import(
      "@/server/model-catalog/handlers/update-model-catalog"
    );

    await expect(
      updateModelCatalogHandler({
        key: "video-model",
        payload: {
          provider: "codex_cli",
          providerConfig: {
            command: "codex",
            model_id: "gpt-image-2",
            agent_model: "gpt-5.5",
          },
        },
      }),
    ).rejects.toThrow("INVALID_PAYLOAD");
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("image 모델도 provider만 codex_cli로 바꾸고 HF config를 남기면 거부한다", async () => {
    mockGetModelCatalogRecordByKey.mockResolvedValue(imageRecord());
    const { updateModelCatalogHandler } = await import(
      "@/server/model-catalog/handlers/update-model-catalog"
    );

    await expect(
      updateModelCatalogHandler({
        key: "gpt-image-2-codex",
        payload: {
          provider: "codex_cli",
        },
      }),
    ).rejects.toThrow("INVALID_PAYLOAD");
    expect(mockUpdate).not.toHaveBeenCalled();
  });
});
