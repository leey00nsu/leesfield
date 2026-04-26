import { describe, expect, it } from "vitest";
import { createImageGenerationSchema } from "@/features/image-generation/model/image-generation-schema";
import {
  imageModels,
  modelImageLimits,
} from "@/features/image-generation/model/image-models";

const t = (key: string, values?: Record<string, string | number | Date>) => {
  if (!values) return key;
  return `${key}:${JSON.stringify(values)}`;
};

describe("image-generation-schema", () => {
  it("FLUX 모델에서 모드/가이던스/업샘플링 검증을 수행한다", () => {
    const fluxModel = imageModels.find((model) => model.key === "flux2-klein-9b");
    expect(fluxModel).toBeDefined();
    if (!fluxModel) return;

    const schema = createImageGenerationSchema(t);
    const result = schema.safeParse({
      prompt: "test",
      width: 1024,
      height: 1024,
      initImages: [],
      model: "flux2-klein-9b",
      imageCount: 1,
      steps: 4,
      modeChoice: "Distilled (4 steps)",
      guidanceScale: 1,
      promptUpsampling: false,
      seed: "",
    });

    expect(result.success).toBe(true);
  });

  it("지원하지 않는 모드는 오류로 처리한다", () => {
    const schema = createImageGenerationSchema(t);
    const result = schema.safeParse({
      prompt: "test",
      width: 1024,
      height: 1024,
      initImages: [],
      model: "flux2-klein-9b",
      imageCount: 1,
      steps: 4,
      modeChoice: "Unsupported Mode",
      guidanceScale: 1,
      promptUpsampling: false,
      seed: "",
    });

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.flatten().fieldErrors.modeChoice?.length).toBeGreaterThan(0);
  });

  it("알 수 없는 모델 키는 유효성 오류로 처리한다", () => {
    const schema = createImageGenerationSchema(t);
    const result = schema.safeParse({
      prompt: "test",
      width: 1024,
      height: 1024,
      initImages: [],
      model: "unknown-model",
      imageCount: 1,
      steps: 4,
      modeChoice: "Distilled (4 steps)",
      guidanceScale: 1,
      promptUpsampling: false,
      seed: "",
    });

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.flatten().fieldErrors.model?.length).toBeGreaterThan(0);
  });

  it("GPT Image 2는 설정을 숨기고 단일 입력 이미지를 허용한다", () => {
    const gptImageModel = imageModels.find(
      (model) => model.key === "gpt-image-2-codex",
    );
    expect(gptImageModel).toBeDefined();
    if (!gptImageModel) return;

    expect(gptImageModel.parameters.width.ui).toBe("hidden");
    expect(gptImageModel.parameters.height.ui).toBe("hidden");
    expect(gptImageModel.parameters.steps.ui).toBe("hidden");
    expect(gptImageModel.parameters.seed?.ui).toBe("hidden");
    expect(modelImageLimits["gpt-image-2-codex"]?.maxInputImages).toBe(1);

    const schema = createImageGenerationSchema(t);
    const inputImage =
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=";
    const result = schema.safeParse({
      prompt: "test",
      width: 1024,
      height: 1024,
      initImages: [inputImage],
      model: "gpt-image-2-codex",
      imageCount: 1,
      steps: 1,
      seed: "",
    });
    const tooManyResult = schema.safeParse({
      prompt: "test",
      width: 1024,
      height: 1024,
      initImages: [inputImage, inputImage],
      model: "gpt-image-2-codex",
      imageCount: 1,
      steps: 1,
      seed: "",
    });

    expect(result.success).toBe(true);
    expect(tooManyResult.success).toBe(false);
    if (tooManyResult.success) return;
    expect(
      tooManyResult.error.flatten().fieldErrors.initImages?.length,
    ).toBeGreaterThan(0);
  });
});
