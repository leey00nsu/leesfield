import { z } from "zod";
import rawCatalog from "@/../configs/image-models.json";

const pipelineOptions = ["diffusion", "sd", "sdxl"] as const;
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

const providerConfigSchema = z.record(z.string(), z.unknown());

const imageParametersSchema = z
  .object({
    prompt: parameterSchema,
    width: parameterSchema,
    height: parameterSchema,
    steps: parameterSchema,
    modeChoice: parameterSchema.optional(),
    guidanceScale: parameterSchema.optional(),
    promptUpsampling: parameterSchema.optional(),
    seed: parameterSchema.optional(),
    imageCount: parameterSchema,
  });

const imageModelSchema = z.object({
  key: z.string().min(1),
  label: z.string().min(1),
  vendor: z.string().min(1),
  provider: z.string().min(1),
  pipeline: z.enum(pipelineOptions),
  model_id: z.string().min(1),
  provider_config: providerConfigSchema,
  parameters: imageParametersSchema,
  default_width: z.number().int().positive(),
  default_height: z.number().int().positive(),
  default_steps: z.number().int().positive(),
  concurrent_limit: z.number().int().positive().optional(),
  max_input_images: z.number().int().nonnegative(),
});

const imageModelCatalogSchema = z.object({
  version: z.number().optional(),
  default_model: z.string().optional(),
  models: z.array(imageModelSchema).min(1),
});

const catalog = imageModelCatalogSchema.parse(rawCatalog);

export type ImageModel = z.infer<typeof imageModelSchema>;

export const imageModels: ImageModel[] = catalog.models;

const modelKeys = imageModels.map((model) => model.key);

function ensureNonEmpty<T>(items: T[]): [T, ...T[]] {
  if (items.length === 0) {
    throw new Error("IMAGE_MODELS_EMPTY");
  }
  return items as [T, ...T[]];
}

export const modelOptions = ensureNonEmpty(modelKeys);

export type ImageGenerationModel = string;

export type ImageModelParameters = ImageModel["parameters"];
export type ImageParameterKey = keyof ImageModelParameters;
export type ImageParameterConfig = ImageModelParameters[ImageParameterKey];

interface NumericRange {
  min: number;
  max: number;
  step: number;
}

const fallbackRanges: Record<
  "size" | "steps" | "count" | "guidance",
  NumericRange
> = {
  size: { min: 1, max: 4096, step: 1 },
  steps: { min: 1, max: 50, step: 1 },
  count: { min: 1, max: 1, step: 1 },
  guidance: { min: 0, max: 10, step: 0.5 },
};

const DEFAULT_MODE_CHOICE = "Distilled (4 steps)";
const DEFAULT_GUIDANCE_SCALE = 1;
const DEFAULT_PROMPT_UPSAMPLING = false;

function resolveNumber(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function resolveRange(
  param: ImageParameterConfig | undefined,
  fallback: NumericRange,
): NumericRange {
  return {
    min: resolveNumber(param?.min, fallback.min),
    max: resolveNumber(param?.max, fallback.max),
    step: resolveNumber(param?.step, fallback.step),
  };
}

export function getImageModelConfig(model: ImageGenerationModel): ImageModel {
  const resolved = imageModels.find((entry) => entry.key === model);
  if (!resolved) {
    throw new Error(`IMAGE_MODEL_NOT_FOUND:${model}`);
  }
  return resolved;
}

export function getImageModelConcurrentLimit(model: ImageGenerationModel) {
  const limit = getImageModelConfig(model).concurrent_limit;
  return typeof limit === "number" && Number.isFinite(limit) && limit > 0
    ? limit
    : 1;
}

export function getImageParamConfig(
  model: ImageGenerationModel,
  key: ImageParameterKey,
) {
  return getImageModelConfig(model).parameters[key];
}

export function getImageParamRange(
  model: ImageGenerationModel,
  key: ImageParameterKey,
): NumericRange {
  const fallback =
    key === "steps"
      ? fallbackRanges.steps
      : key === "imageCount"
        ? fallbackRanges.count
        : key === "guidanceScale"
          ? fallbackRanges.guidance
        : fallbackRanges.size;
  return resolveRange(getImageParamConfig(model, key), fallback);
}

function getNumericDefault(
  model: ImageGenerationModel,
  key: ImageParameterKey,
  fallback: number,
) {
  const param = getImageParamConfig(model, key);
  const value = param?.default;
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function getStringDefault(
  model: ImageGenerationModel,
  key: ImageParameterKey,
  fallback: string,
) {
  const param = getImageParamConfig(model, key);
  const value = param?.default;
  return typeof value === "string" && value.trim() ? value : fallback;
}

function getBooleanDefault(
  model: ImageGenerationModel,
  key: ImageParameterKey,
  fallback: boolean,
) {
  const param = getImageParamConfig(model, key);
  const value = param?.default;
  return typeof value === "boolean" ? value : fallback;
}

export const modelDefaults: Record<
  string,
  {
    steps: number;
    width: number;
    height: number;
    guidanceScale: number;
    modeChoice: string;
    promptUpsampling: boolean;
  }
> = Object.fromEntries(
  imageModels.map((model) => [
    model.key,
    {
      steps: getNumericDefault(
        model.key as ImageGenerationModel,
        "steps",
        model.default_steps,
      ),
      width: getNumericDefault(
        model.key as ImageGenerationModel,
        "width",
        model.default_width,
      ),
      height: getNumericDefault(
        model.key as ImageGenerationModel,
        "height",
        model.default_height,
      ),
      guidanceScale: getNumericDefault(
        model.key as ImageGenerationModel,
        "guidanceScale",
        DEFAULT_GUIDANCE_SCALE,
      ),
      modeChoice: getStringDefault(
        model.key as ImageGenerationModel,
        "modeChoice",
        DEFAULT_MODE_CHOICE,
      ),
      promptUpsampling: getBooleanDefault(
        model.key as ImageGenerationModel,
        "promptUpsampling",
        DEFAULT_PROMPT_UPSAMPLING,
      ),
    },
  ])
);

export const modelImageLimits: Record<
  string,
  { maxInputImages: number }
> = Object.fromEntries(
  imageModels.map((model) => [
    model.key,
    { maxInputImages: model.max_input_images },
  ])
);

export const defaultModelKey: ImageGenerationModel =
  (catalog.default_model &&
    modelKeys.includes(catalog.default_model) &&
    (catalog.default_model as ImageGenerationModel)) ||
  modelOptions[0];
