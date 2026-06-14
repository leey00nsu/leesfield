import { beforeEach, describe, expect, it, vi } from "vitest";

const mockGetModelCatalog = vi.hoisted(() => vi.fn());
vi.mock("@/server/model-catalog/catalog-service", () => ({
  getModelCatalog: mockGetModelCatalog,
}));

describe("validateAudioGenerationPayload dynamicParams", () => {
  beforeEach(() => {
    vi.resetModules();
    mockGetModelCatalog.mockResolvedValue([
      {
        id: "audio-1",
        type: "audio",
        key: "qwen-dynamic",
        label: "Qwen Dynamic",
        vendor: "HUGGINGFACE",
        provider: "hf_space",
        providerConfig: { space_id: "Qwen/Qwen3-TTS", api_name: "/generate_voice_clone" },
        parameters: {
          prompt: { ui: "textarea", required: true },
          "hf:model_size": {
            ui: "select",
            required: true,
            options: [
              { label: "0.6B", value: "0.6B" },
              { label: "1.7B", value: "1.7B" },
            ],
            binding: {
              source: "hf_space",
              parameterName: "model_size",
              valueType: "string",
              order: 5,
            },
          },
          "hf:temperature": {
            ui: "range",
            min: 0.1,
            max: 1,
            step: 0.1,
            binding: {
              source: "hf_space",
              parameterName: "temperature",
              valueType: "number",
              order: 6,
            },
          },
        },
        meta: { model_id: "Qwen/Qwen3-TTS", default_speed: 1 },
        isActive: true,
        isDefault: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);
  });

  it("allowlisted dynamic value를 허용한다", async () => {
    const { validateAudioGenerationPayload } = await import(
      "@/server/model-catalog/generation-validation"
    );
    const result = await validateAudioGenerationPayload({
      prompt: "hello",
      model: "qwen-dynamic",
      dynamicParams: { "hf:model_size": "1.7B" },
    });
    expect(result.success).toBe(true);
  });

  it("unknown key와 지원하지 않는 option을 거부한다", async () => {
    const { validateAudioGenerationPayload } = await import(
      "@/server/model-catalog/generation-validation"
    );
    const unknown = await validateAudioGenerationPayload({
      prompt: "hello",
      model: "qwen-dynamic",
      dynamicParams: { "hf:unknown": "value", "hf:model_size": "1.7B" },
    });
    const invalidOption = await validateAudioGenerationPayload({
      prompt: "hello",
      model: "qwen-dynamic",
      dynamicParams: { "hf:model_size": "9B" },
    });
    expect(unknown.success).toBe(false);
    expect(invalidOption.success).toBe(false);
  });

  it("동적 number의 range와 step을 검증한다", async () => {
    const { validateAudioGenerationPayload } = await import(
      "@/server/model-catalog/generation-validation"
    );
    const outOfRange = await validateAudioGenerationPayload({
      prompt: "hello",
      model: "qwen-dynamic",
      dynamicParams: {
        "hf:model_size": "1.7B",
        "hf:temperature": 1.1,
      },
    });
    const invalidStep = await validateAudioGenerationPayload({
      prompt: "hello",
      model: "qwen-dynamic",
      dynamicParams: {
        "hf:model_size": "1.7B",
        "hf:temperature": 0.15,
      },
    });

    expect(outOfRange.success).toBe(false);
    expect(invalidStep.success).toBe(false);
  });
});
