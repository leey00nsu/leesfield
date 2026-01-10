import { describe, expect, it } from "vitest";
import {
  defaultModelKey as defaultImageModelKey,
  imageModels,
} from "@/features/image-generation/model/image-models";
import {
  defaultVideoModelKey,
  videoModels,
} from "@/features/video-generation/model/video-models";
import {
  imageModelCatalog,
  modelCatalog,
  videoModelCatalog,
} from "@/features/model-management/model/model-catalog";

describe("model-catalog", () => {
  it("이미지 모델 카탈로그를 매핑한다", () => {
    expect(imageModelCatalog).toHaveLength(imageModels.length);
    expect(imageModelCatalog.some((item) => item.isDefault)).toBe(true);

    imageModels.forEach((model) => {
      const mapped = imageModelCatalog.find((item) => item.key === model.key);
      expect(mapped).toBeDefined();
      if (!mapped) return;

      expect(mapped.type).toBe("image");
      expect(mapped.label).toBe(model.label);
      expect(mapped.vendor).toBe(model.vendor);
      expect(mapped.provider).toBe(model.provider);
      expect(mapped.isDefault).toBe(model.key === defaultImageModelKey);
      expect(mapped.meta).toEqual({
        pipeline: model.pipeline,
        modelId: model.model_id,
        defaultWidth: model.default_width,
        defaultHeight: model.default_height,
        defaultSteps: model.default_steps,
        maxInputImages: model.max_input_images,
      });
    });
  });

  it("비디오 모델 카탈로그를 매핑한다", () => {
    expect(videoModelCatalog).toHaveLength(videoModels.length);
    expect(videoModelCatalog.some((item) => item.isDefault)).toBe(true);

    videoModels.forEach((model) => {
      const mapped = videoModelCatalog.find((item) => item.key === model.key);
      expect(mapped).toBeDefined();
      if (!mapped) return;

      expect(mapped.type).toBe("video");
      expect(mapped.label).toBe(model.label);
      expect(mapped.vendor).toBe(model.vendor);
      expect(mapped.provider).toBe(model.provider);
      expect(mapped.isDefault).toBe(model.key === defaultVideoModelKey);
      expect(mapped.meta).toEqual({
        supportsInitImage: model.supports_init_image,
        t2vModelId: model.t2v_model_id,
        i2vModelId: model.i2v_model_id ?? null,
        defaultWidth: model.default_width,
        defaultHeight: model.default_height,
        defaultDurationSec: model.default_duration_sec,
        defaultFps: model.default_fps,
        defaultSteps: model.default_steps,
        defaultGuidanceScale: model.default_guidance_scale,
      });
    });
  });

  it("통합 카탈로그를 구성한다", () => {
    expect(modelCatalog).toHaveLength(
      imageModelCatalog.length + videoModelCatalog.length,
    );
  });
});
