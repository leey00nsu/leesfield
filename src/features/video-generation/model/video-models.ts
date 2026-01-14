import { z } from "zod";
import rawCatalog from "@/../configs/video-models.json";

const parameterUiOptions = [
  "range",
  "input",
  "textarea",
  "select",
  "toggle",
  "hidden",
  "card",
  "upload",
] as const;

const parameterSchema = z.object({
  ui: z.enum(parameterUiOptions),
  label: z.string().optional(),
  required: z.boolean().optional(),
  min: z.number().optional(),
  max: z.number().optional(),
  step: z.number().optional(),
  default: z.union([z.string(), z.number(), z.boolean()]).optional(),
  options: z.array(z.union([z.string(), z.number()])).optional(),
});

const apiSchema = z.object({
  space_id: z.string().min(1),
  api_name: z.string().min(1),
  timeout_ms: z.number().int().positive().optional(),
  space_url: z.string().min(1).optional(),
});

const videoParametersSchema = z
  .object({
    prompt: parameterSchema,
    initImage: parameterSchema.optional(),
    durationSec: parameterSchema,
    steps: parameterSchema,
    guidanceScale: parameterSchema,
    seed: parameterSchema.optional(),
    aspectRatio: parameterSchema.optional(),
    resolution: parameterSchema.optional(),
    fps: parameterSchema.optional(),
  });

const videoModelSchema = z.object({
  key: z.string().min(1),
  label: z.string().min(1),
  vendor: z.string().min(1),
  provider: z.string().min(1),
  supports_init_image: z.boolean(),
  t2v_model_id: z.string().min(1),
  i2v_model_id: z.string().nullable().optional(),
  api: apiSchema,
  parameters: videoParametersSchema,
  default_width: z.number().int().positive(),
  default_height: z.number().int().positive(),
  default_duration_sec: z.number().positive(),
  default_fps: z.number().int().positive(),
  default_steps: z.number().int().positive(),
  default_guidance_scale: z.number().nonnegative(),
});

const videoModelCatalogSchema = z.object({
  version: z.number().optional(),
  default_model: z.string().optional(),
  models: z.array(videoModelSchema).min(1),
});

const catalog = videoModelCatalogSchema.parse(rawCatalog);

export type VideoModel = z.infer<typeof videoModelSchema>;

export const videoModels: VideoModel[] = catalog.models;

const modelKeys = videoModels.map((model) => model.key);

function ensureNonEmpty<T>(items: T[]): [T, ...T[]] {
  if (items.length === 0) {
    throw new Error("VIDEO_MODELS_EMPTY");
  }
  return items as [T, ...T[]];
}

export const videoModelOptions = ensureNonEmpty(modelKeys);

export type VideoGenerationModel = (typeof videoModelOptions)[number];

export type VideoModelParameters = VideoModel["parameters"];
export type VideoParameterKey = keyof VideoModelParameters;
export type VideoParameterConfig = VideoModelParameters[VideoParameterKey];

interface NumericRange {
  min: number;
  max: number;
  step: number;
}

const fallbackRanges: Record<"duration" | "steps" | "guidance" | "fps", NumericRange> = {
  duration: { min: 0.5, max: 10, step: 0.5 },
  steps: { min: 1, max: 50, step: 1 },
  guidance: { min: 0, max: 20, step: 0.5 },
  fps: { min: 1, max: 60, step: 1 },
};

function resolveNumber(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function resolveRange(
  param: VideoParameterConfig | undefined,
  fallback: NumericRange,
): NumericRange {
  return {
    min: resolveNumber(param?.min, fallback.min),
    max: resolveNumber(param?.max, fallback.max),
    step: resolveNumber(param?.step, fallback.step),
  };
}

export function getVideoModelConfig(model: VideoGenerationModel): VideoModel {
  const resolved = videoModels.find((entry) => entry.key === model);
  if (!resolved) {
    throw new Error(`VIDEO_MODEL_NOT_FOUND:${model}`);
  }
  return resolved;
}

export function getVideoParamConfig(
  model: VideoGenerationModel,
  key: VideoParameterKey,
) {
  return getVideoModelConfig(model).parameters[key];
}

export function getVideoParamRange(
  model: VideoGenerationModel,
  key: VideoParameterKey,
): NumericRange {
  const fallback =
    key === "durationSec"
      ? fallbackRanges.duration
      : key === "steps"
        ? fallbackRanges.steps
        : key === "guidanceScale"
          ? fallbackRanges.guidance
          : key === "fps"
            ? fallbackRanges.fps
            : fallbackRanges.steps;
  return resolveRange(getVideoParamConfig(model, key), fallback);
}

function getNumericDefault(
  model: VideoGenerationModel,
  key: VideoParameterKey,
  fallback: number,
) {
  const param = getVideoParamConfig(model, key);
  const value = param?.default;
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function getStringDefault(
  model: VideoGenerationModel,
  key: VideoParameterKey,
  fallback: string,
) {
  const param = getVideoParamConfig(model, key);
  const value = param?.default;
  return typeof value === "string" && value.trim() ? value : fallback;
}

export const videoModelMeta: Record<
  VideoGenerationModel,
  { label: string; supportsInitImage: boolean }
> = Object.fromEntries(
  videoModels.map((model) => [
    model.key,
    {
      label: model.label,
      supportsInitImage: model.supports_init_image,
    },
  ])
) as Record<VideoGenerationModel, { label: string; supportsInitImage: boolean }>;

export const videoModelDefaults: Record<
  VideoGenerationModel,
  {
    steps: number;
    guidanceScale: number;
    durationSec: number;
    fps: number;
    aspectRatio: string;
    resolution: number;
  }
> = Object.fromEntries(
  videoModels.map((model) => [
    model.key,
    {
      steps: getNumericDefault(
        model.key as VideoGenerationModel,
        "steps",
        model.default_steps,
      ),
      guidanceScale: getNumericDefault(
        model.key as VideoGenerationModel,
        "guidanceScale",
        model.default_guidance_scale,
      ),
      durationSec: getNumericDefault(
        model.key as VideoGenerationModel,
        "durationSec",
        model.default_duration_sec,
      ),
      fps: getNumericDefault(
        model.key as VideoGenerationModel,
        "fps",
        model.default_fps,
      ),
      aspectRatio: getStringDefault(
        model.key as VideoGenerationModel,
        "aspectRatio",
        "16:9",
      ),
      resolution: getNumericDefault(
        model.key as VideoGenerationModel,
        "resolution",
        720,
      ),
    },
  ])
) as Record<
  VideoGenerationModel,
  {
    steps: number;
    guidanceScale: number;
    durationSec: number;
    fps: number;
    aspectRatio: string;
    resolution: number;
  }
>;

export const defaultVideoModelKey: VideoGenerationModel =
  (catalog.default_model &&
    modelKeys.includes(catalog.default_model) &&
    (catalog.default_model as VideoGenerationModel)) ||
  videoModelOptions[0];
