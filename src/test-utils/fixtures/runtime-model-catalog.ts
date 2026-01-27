import {
  defaultModelKey as defaultImageModelKey,
  imageModels,
} from "@/features/image-generation/model/image-models";
import {
  defaultVideoModelKey,
  videoModels,
} from "@/features/video-generation/model/video-models";
import type {
  RuntimeImageModel,
  RuntimeVideoModel,
} from "@/shared/model-catalog/runtime-utils";

export const runtimeImageModelsFixture: RuntimeImageModel[] = imageModels.map(
  (model) => ({
    type: "image",
    key: model.key,
    label: model.label,
    vendor: model.vendor,
    provider: model.provider,
    providerConfig: model.provider_config,
    parameters: model.parameters,
    meta: {
      pipeline: model.pipeline,
      model_id: model.model_id,
      default_width: model.default_width,
      default_height: model.default_height,
      default_steps: model.default_steps,
      concurrent_limit: model.concurrent_limit ?? null,
      max_input_images: model.max_input_images,
    },
    isActive: true,
    isDefault: model.key === defaultImageModelKey,
  }),
);

export const runtimeVideoModelsFixture: RuntimeVideoModel[] = videoModels.map(
  (model) => ({
    type: "video",
    key: model.key,
    label: model.label,
    vendor: model.vendor,
    provider: model.provider,
    providerConfig: model.provider_config,
    parameters: model.parameters,
    meta: {
      supports_init_image: model.supports_init_image,
      t2v_model_id: model.t2v_model_id,
      i2v_model_id: model.i2v_model_id ?? null,
      default_width: model.default_width,
      default_height: model.default_height,
      default_duration_sec: model.default_duration_sec,
      default_fps: model.default_fps,
      default_steps: model.default_steps,
      default_guidance_scale: model.default_guidance_scale,
      concurrent_limit: model.concurrent_limit ?? null,
    },
    isActive: true,
    isDefault: model.key === defaultVideoModelKey,
  }),
);

