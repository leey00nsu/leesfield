import { describe, expect, it } from "vitest";
import { createImageGenerationSchema } from "@/features/image-generation/model/image-generation-schema";
import { imageModels } from "@/features/image-generation/model/image-models";

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
});
