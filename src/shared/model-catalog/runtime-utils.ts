export type RuntimeModelType = "image" | "video";

export type RuntimeParameterValue = string | number | boolean;
export type RuntimeParameterOption = string | number;

export type RuntimeParameterConfig = {
  ui?: string;
  label?: string;
  required?: boolean;
  min?: number;
  max?: number;
  step?: number;
  default?: RuntimeParameterValue;
  options?: RuntimeParameterOption[];
  [key: string]: unknown;
};

export type RuntimeImageParameterKey =
  | "prompt"
  | "width"
  | "height"
  | "steps"
  | "modeChoice"
  | "guidanceScale"
  | "promptUpsampling"
  | "seed"
  | "imageCount";

export type RuntimeVideoParameterKey =
  | "prompt"
  | "initImage"
  | "durationSec"
  | "steps"
  | "guidanceScale"
  | "seed"
  | "aspectRatio"
  | "resolution"
  | "fps";

export type RuntimeImageParameters = Partial<
  Record<RuntimeImageParameterKey, RuntimeParameterConfig>
> &
  Record<string, unknown>;

export type RuntimeVideoParameters = Partial<
  Record<RuntimeVideoParameterKey, RuntimeParameterConfig>
> &
  Record<string, unknown>;

export type RuntimeImageMeta = {
  pipeline?: string;
  model_id?: string;
  default_width?: number;
  default_height?: number;
  default_steps?: number;
  concurrent_limit?: number | null;
  max_input_images?: number;
  [key: string]: unknown;
};

export type RuntimeVideoMeta = {
  supports_init_image?: boolean;
  t2v_model_id?: string;
  i2v_model_id?: string | null;
  default_width?: number;
  default_height?: number;
  default_duration_sec?: number;
  default_fps?: number;
  default_steps?: number;
  default_guidance_scale?: number;
  concurrent_limit?: number | null;
  [key: string]: unknown;
};

export type RuntimeModelBase = {
  id?: string;
  type: RuntimeModelType;
  key: string;
  label: string;
  vendor: string;
  provider: string;
  providerConfig?: Record<string, unknown>;
  parameters: Record<string, unknown>;
  meta: Record<string, unknown>;
  isActive: boolean;
  isDefault: boolean;
};

export type RuntimeImageModel = Omit<RuntimeModelBase, "type" | "parameters" | "meta"> & {
  type: "image";
  parameters: RuntimeImageParameters;
  meta: RuntimeImageMeta;
};

export type RuntimeVideoModel = Omit<RuntimeModelBase, "type" | "parameters" | "meta"> & {
  type: "video";
  parameters: RuntimeVideoParameters;
  meta: RuntimeVideoMeta;
};

export type NumericRange = {
  min: number;
  max: number;
  step: number;
};

const imageFallbackRanges: Record<
  "size" | "steps" | "count" | "guidance",
  NumericRange
> = {
  size: { min: 1, max: 4096, step: 1 },
  steps: { min: 1, max: 50, step: 1 },
  count: { min: 1, max: 1, step: 1 },
  guidance: { min: 0, max: 10, step: 0.5 },
};

const videoFallbackRanges: Record<
  "duration" | "steps" | "guidance" | "fps",
  NumericRange
> = {
  duration: { min: 0.5, max: 10, step: 0.5 },
  steps: { min: 1, max: 50, step: 1 },
  guidance: { min: 0, max: 20, step: 0.5 },
  fps: { min: 1, max: 60, step: 1 },
};

const DEFAULT_IMAGE_MODE_CHOICE = "Distilled (4 steps)";
const DEFAULT_IMAGE_GUIDANCE_SCALE = 1;
const DEFAULT_IMAGE_PROMPT_UPSAMPLING = false;
const DEFAULT_VIDEO_ASPECT_RATIO = "16:9";
const DEFAULT_VIDEO_RESOLUTION = 720;

function resolveNumber(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function resolveString(value: unknown, fallback: string) {
  return typeof value === "string" && value.trim() ? value : fallback;
}

function resolveBoolean(value: unknown, fallback: boolean) {
  return typeof value === "boolean" ? value : fallback;
}

function resolveParamConfig(
  parameters: Record<string, unknown> | undefined,
  key: string,
) {
  const param = parameters?.[key];
  return param && typeof param === "object" ? (param as RuntimeParameterConfig) : undefined;
}

function resolveRange(
  param: RuntimeParameterConfig | undefined,
  fallback: NumericRange,
): NumericRange {
  return {
    min: resolveNumber(param?.min, fallback.min),
    max: resolveNumber(param?.max, fallback.max),
    step: resolveNumber(param?.step, fallback.step),
  };
}

export function isRuntimeImageModel(item: RuntimeModelBase): item is RuntimeImageModel {
  return item.type === "image";
}

export function isRuntimeVideoModel(item: RuntimeModelBase): item is RuntimeVideoModel {
  return item.type === "video";
}

export function resolveRuntimeDefaultModelKey<T extends { key: string; isDefault: boolean; isActive: boolean }>(
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

export function getRuntimeImageParamConfig(
  model: RuntimeImageModel | undefined,
  key: RuntimeImageParameterKey,
) {
  return resolveParamConfig(model?.parameters, key);
}

export function getRuntimeImageParamRange(
  model: RuntimeImageModel | undefined,
  key: RuntimeImageParameterKey,
): NumericRange {
  const fallback =
    key === "steps"
      ? imageFallbackRanges.steps
      : key === "imageCount"
        ? imageFallbackRanges.count
        : key === "guidanceScale"
          ? imageFallbackRanges.guidance
          : imageFallbackRanges.size;
  return resolveRange(getRuntimeImageParamConfig(model, key), fallback);
}

export function getRuntimeVideoParamConfig(
  model: RuntimeVideoModel | undefined,
  key: RuntimeVideoParameterKey,
) {
  return resolveParamConfig(model?.parameters, key);
}

export function getRuntimeVideoParamRange(
  model: RuntimeVideoModel | undefined,
  key: RuntimeVideoParameterKey,
): NumericRange {
  const fallback =
    key === "durationSec"
      ? videoFallbackRanges.duration
      : key === "steps"
        ? videoFallbackRanges.steps
        : key === "guidanceScale"
          ? videoFallbackRanges.guidance
          : key === "fps"
            ? videoFallbackRanges.fps
            : videoFallbackRanges.steps;
  return resolveRange(getRuntimeVideoParamConfig(model, key), fallback);
}

export function resolveRuntimeImageDefaults(model: RuntimeImageModel) {
  const defaults = model.meta ?? {};
  return {
    steps: resolveNumber(
      getRuntimeImageParamConfig(model, "steps")?.default,
      resolveNumber(defaults.default_steps, 10),
    ),
    width: resolveNumber(
      getRuntimeImageParamConfig(model, "width")?.default,
      resolveNumber(defaults.default_width, 1024),
    ),
    height: resolveNumber(
      getRuntimeImageParamConfig(model, "height")?.default,
      resolveNumber(defaults.default_height, 1024),
    ),
    guidanceScale: resolveNumber(
      getRuntimeImageParamConfig(model, "guidanceScale")?.default,
      DEFAULT_IMAGE_GUIDANCE_SCALE,
    ),
    modeChoice: resolveString(
      getRuntimeImageParamConfig(model, "modeChoice")?.default,
      DEFAULT_IMAGE_MODE_CHOICE,
    ),
    promptUpsampling: resolveBoolean(
      getRuntimeImageParamConfig(model, "promptUpsampling")?.default,
      DEFAULT_IMAGE_PROMPT_UPSAMPLING,
    ),
  };
}

export function resolveRuntimeVideoDefaults(model: RuntimeVideoModel) {
  const defaults = model.meta ?? {};
  return {
    steps: resolveNumber(
      getRuntimeVideoParamConfig(model, "steps")?.default,
      resolveNumber(defaults.default_steps, 6),
    ),
    guidanceScale: resolveNumber(
      getRuntimeVideoParamConfig(model, "guidanceScale")?.default,
      resolveNumber(defaults.default_guidance_scale, 1),
    ),
    durationSec: resolveNumber(
      getRuntimeVideoParamConfig(model, "durationSec")?.default,
      resolveNumber(defaults.default_duration_sec, 3.5),
    ),
    fps: resolveNumber(
      getRuntimeVideoParamConfig(model, "fps")?.default,
      resolveNumber(defaults.default_fps, 16),
    ),
    aspectRatio: resolveString(
      getRuntimeVideoParamConfig(model, "aspectRatio")?.default,
      DEFAULT_VIDEO_ASPECT_RATIO,
    ),
    resolution: resolveNumber(
      getRuntimeVideoParamConfig(model, "resolution")?.default,
      DEFAULT_VIDEO_RESOLUTION,
    ),
  };
}

export function resolveRuntimeImageMaxInputImages(
  model: RuntimeImageModel | undefined,
) {
  return resolveNumber(model?.meta?.max_input_images, 0);
}

export function resolveRuntimeVideoSupportsInitImage(
  model: RuntimeVideoModel | undefined,
) {
  return resolveBoolean(model?.meta?.supports_init_image, false);
}
