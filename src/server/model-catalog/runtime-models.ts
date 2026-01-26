import { getModelCatalog } from "@/server/model-catalog/catalog-service";
import type {
  ImageModelCatalogItem,
  VideoModelCatalogItem,
} from "@/server/model-catalog/catalog-schema";

type ParameterConfig = {
  default?: unknown;
};

type ModelDefaults = {
  width?: number;
  height?: number;
  steps?: number;
  guidanceScale?: number;
  modeChoice?: string;
  promptUpsampling?: boolean;
  durationSec?: number;
  fps?: number;
  aspectRatio?: string;
  resolution?: number;
};

export type RuntimeImageModel = {
  key: string;
  isActive: boolean;
  isDefault: boolean;
  defaults: Required<
    Pick<
      ModelDefaults,
      "width" | "height" | "steps" | "guidanceScale" | "modeChoice" | "promptUpsampling"
    >
  >;
  concurrentLimit: number;
  maxInputImages: number;
};

export type RuntimeVideoModel = {
  key: string;
  isActive: boolean;
  isDefault: boolean;
  defaults: Required<
    Pick<
      ModelDefaults,
      "steps" | "guidanceScale" | "durationSec" | "fps" | "aspectRatio" | "resolution"
    >
  >;
  concurrentLimit: number;
  supportsInitImage: boolean;
};

const DEFAULT_IMAGE_MODE_CHOICE = "Distilled (4 steps)";
const DEFAULT_IMAGE_GUIDANCE_SCALE = 1;
const DEFAULT_IMAGE_PROMPT_UPSAMPLING = false;

const DEFAULT_VIDEO_ASPECT_RATIO = "16:9";
const DEFAULT_VIDEO_RESOLUTION = 720;

function getParamConfig(
  parameters: Record<string, unknown>,
  key: string,
): ParameterConfig | undefined {
  const param = parameters[key];
  return param && typeof param === "object" ? (param as ParameterConfig) : undefined;
}

function getNumberDefault(param: ParameterConfig | undefined, fallback: number) {
  const value = param?.default;
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function getStringDefault(param: ParameterConfig | undefined, fallback: string) {
  const value = param?.default;
  return typeof value === "string" && value.trim() ? value : fallback;
}

function getBooleanDefault(param: ParameterConfig | undefined, fallback: boolean) {
  const value = param?.default;
  return typeof value === "boolean" ? value : fallback;
}

function resolveConcurrentLimit(limit: number | null | undefined) {
  return typeof limit === "number" && Number.isFinite(limit) && limit > 0 ? limit : 1;
}

function toImageRuntimeModel(model: ImageModelCatalogItem): RuntimeImageModel {
  const parameters = model.parameters as Record<string, unknown>;
  return {
    key: model.key,
    isActive: model.isActive,
    isDefault: model.isDefault,
    defaults: {
      steps: getNumberDefault(
        getParamConfig(parameters, "steps"),
        model.meta.default_steps,
      ),
      width: getNumberDefault(
        getParamConfig(parameters, "width"),
        model.meta.default_width,
      ),
      height: getNumberDefault(
        getParamConfig(parameters, "height"),
        model.meta.default_height,
      ),
      guidanceScale: getNumberDefault(
        getParamConfig(parameters, "guidanceScale"),
        DEFAULT_IMAGE_GUIDANCE_SCALE,
      ),
      modeChoice: getStringDefault(
        getParamConfig(parameters, "modeChoice"),
        DEFAULT_IMAGE_MODE_CHOICE,
      ),
      promptUpsampling: getBooleanDefault(
        getParamConfig(parameters, "promptUpsampling"),
        DEFAULT_IMAGE_PROMPT_UPSAMPLING,
      ),
    },
    concurrentLimit: resolveConcurrentLimit(model.meta.concurrent_limit),
    maxInputImages: model.meta.max_input_images,
  };
}

function toVideoRuntimeModel(model: VideoModelCatalogItem): RuntimeVideoModel {
  const parameters = model.parameters as Record<string, unknown>;
  return {
    key: model.key,
    isActive: model.isActive,
    isDefault: model.isDefault,
    defaults: {
      steps: getNumberDefault(
        getParamConfig(parameters, "steps"),
        model.meta.default_steps,
      ),
      guidanceScale: getNumberDefault(
        getParamConfig(parameters, "guidanceScale"),
        model.meta.default_guidance_scale,
      ),
      durationSec: getNumberDefault(
        getParamConfig(parameters, "durationSec"),
        model.meta.default_duration_sec,
      ),
      fps: getNumberDefault(
        getParamConfig(parameters, "fps"),
        model.meta.default_fps,
      ),
      aspectRatio: getStringDefault(
        getParamConfig(parameters, "aspectRatio"),
        DEFAULT_VIDEO_ASPECT_RATIO,
      ),
      resolution: getNumberDefault(
        getParamConfig(parameters, "resolution"),
        DEFAULT_VIDEO_RESOLUTION,
      ),
    },
    concurrentLimit: resolveConcurrentLimit(model.meta.concurrent_limit),
    supportsInitImage: model.meta.supports_init_image,
  };
}

export function resolveDefaultModelKey<T extends { key: string; isDefault: boolean; isActive: boolean }>(
  models: T[],
) {
  const activeDefault = models.find((model) => model.isDefault && model.isActive);
  if (activeDefault) return activeDefault.key;
  const anyDefault = models.find((model) => model.isDefault);
  if (anyDefault) return anyDefault.key;
  const firstActive = models.find((model) => model.isActive);
  if (firstActive) return firstActive.key;
  return models[0]?.key ?? null;
}

export async function getRuntimeCatalog(params: { includeInactive?: boolean } = {}) {
  const catalog = await getModelCatalog({
    includeInactive: params.includeInactive ?? false,
  });
  const imageModels = catalog
    .filter((item): item is ImageModelCatalogItem => item.type === "image")
    .map((model) => toImageRuntimeModel(model));
  const videoModels = catalog
    .filter((item): item is VideoModelCatalogItem => item.type === "video")
    .map((model) => toVideoRuntimeModel(model));

  return { imageModels, videoModels };
}
