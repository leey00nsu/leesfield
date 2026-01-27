import type { ImageModel } from "@/features/image-generation/model/image-models";
import {
  defaultModelKey as defaultImageModelKey,
  imageModels,
} from "@/features/image-generation/model/image-models";
import type { VideoModel } from "@/features/video-generation/model/video-models";
import {
  defaultVideoModelKey,
  videoModels,
} from "@/features/video-generation/model/video-models";

export type ModelCatalogType = "image" | "video";
export type ModelCatalogFilterType = "all" | ModelCatalogType;

interface BaseModelCatalogItem {
  type: ModelCatalogType;
  key: string;
  label: string;
  vendor: string;
  provider: string;
  isActive: boolean;
  isDefault: boolean;
}

export interface ImageModelMeta {
  pipeline: ImageModel["pipeline"];
  modelId: ImageModel["model_id"];
  defaultWidth: ImageModel["default_width"];
  defaultHeight: ImageModel["default_height"];
  defaultSteps: ImageModel["default_steps"];
  maxInputImages: ImageModel["max_input_images"];
}

export interface VideoModelMeta {
  supportsInitImage: VideoModel["supports_init_image"];
  t2vModelId: VideoModel["t2v_model_id"];
  i2vModelId: VideoModel["i2v_model_id"] | null;
  defaultWidth: VideoModel["default_width"];
  defaultHeight: VideoModel["default_height"];
  defaultDurationSec: VideoModel["default_duration_sec"];
  defaultFps: VideoModel["default_fps"];
  defaultSteps: VideoModel["default_steps"];
  defaultGuidanceScale: VideoModel["default_guidance_scale"];
}

export interface ImageModelCatalogItem extends BaseModelCatalogItem {
  type: "image";
  meta: ImageModelMeta;
}

export interface VideoModelCatalogItem extends BaseModelCatalogItem {
  type: "video";
  meta: VideoModelMeta;
}

export type ModelCatalogItem = ImageModelCatalogItem | VideoModelCatalogItem;

export const imageModelCatalog: ImageModelCatalogItem[] = imageModels.map(
  (model) => ({
    type: "image",
    key: model.key,
    label: model.label,
    vendor: model.vendor,
    provider: model.provider,
    isActive: true,
    isDefault: model.key === defaultImageModelKey,
    meta: {
      pipeline: model.pipeline,
      modelId: model.model_id,
      defaultWidth: model.default_width,
      defaultHeight: model.default_height,
      defaultSteps: model.default_steps,
      maxInputImages: model.max_input_images,
    },
  }),
);

export const videoModelCatalog: VideoModelCatalogItem[] = videoModels.map(
  (model) => ({
    type: "video",
    key: model.key,
    label: model.label,
    vendor: model.vendor,
    provider: model.provider,
    isActive: true,
    isDefault: model.key === defaultVideoModelKey,
    meta: {
      supportsInitImage: model.supports_init_image,
      t2vModelId: model.t2v_model_id,
      i2vModelId: model.i2v_model_id ?? null,
      defaultWidth: model.default_width,
      defaultHeight: model.default_height,
      defaultDurationSec: model.default_duration_sec,
      defaultFps: model.default_fps,
      defaultSteps: model.default_steps,
      defaultGuidanceScale: model.default_guidance_scale,
    },
  }),
);

export const modelCatalog: ModelCatalogItem[] = [
  ...imageModelCatalog,
  ...videoModelCatalog,
];

export function getModelCatalogByType(type: ModelCatalogType) {
  return type === "image" ? imageModelCatalog : videoModelCatalog;
}

export interface ModelCatalogFilterOptions {
  type: ModelCatalogFilterType;
  query: string;
}

export function filterModelCatalog(
  items: ModelCatalogItem[],
  { type, query }: ModelCatalogFilterOptions,
) {
  const normalized = query.trim().toLowerCase();
  return items.filter((item) => {
    if (type !== "all" && item.type !== type) {
      return false;
    }
    if (!normalized) {
      return true;
    }
    const target = `${item.label} ${item.key}`.toLowerCase();
    return target.includes(normalized);
  });
}
