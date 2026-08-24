import type { RuntimeImageModel } from "@/shared/model-catalog/runtime-utils";
import {
  getRuntimeImageParamConfig,
  getRuntimeImageParamRange,
  resolveRuntimeImageDefaults,
} from "@/shared/model-catalog/runtime-utils";

export type ImageAuthoringParameterValue = string | number | boolean | null;

export type ImageAuthoringConfig = {
  prompt: string;
  modelKey: string | null;
  parameters: Record<string, unknown>;
};

export type ImageAuthoringValues = {
  prompt: string;
  model: string;
  width: number;
  height: number;
  imageCount: number;
  steps: number;
  modeChoice: string;
  guidanceScale: number;
  promptUpsampling: boolean;
  seed: string;
};

export type ImageSizePreset = "1:1" | "16:9" | "9:16" | "4:3" | "3:4";

const sizePresetRatios: Record<ImageSizePreset, readonly [number, number]> = {
  "1:1": [1, 1],
  "16:9": [16, 9],
  "9:16": [9, 16],
  "4:3": [4, 3],
  "3:4": [3, 4],
};

const canonicalParameterKeys = [
  "width",
  "height",
  "imageCount",
  "steps",
  "modeChoice",
  "guidanceScale",
  "promptUpsampling",
  "seed",
] as const;

function finiteNumber(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function stringValue(value: unknown, fallback: string) {
  return typeof value === "string" ? value : fallback;
}

function booleanValue(value: unknown, fallback: boolean) {
  return typeof value === "boolean" ? value : fallback;
}

function resolveImageCountDefault(model: RuntimeImageModel) {
  const config = getRuntimeImageParamConfig(model, "imageCount");
  const range = getRuntimeImageParamRange(model, "imageCount");
  return finiteNumber(config?.default, range.min);
}

function resolveSeedDefault(model: RuntimeImageModel) {
  const value = getRuntimeImageParamConfig(model, "seed")?.default;
  return typeof value === "string" || typeof value === "number"
    ? String(value)
    : "";
}

export function resolveImageAuthoringDefaults(
  model: RuntimeImageModel,
  prompt = "",
): ImageAuthoringValues {
  const defaults = resolveRuntimeImageDefaults(model);
  return {
    prompt,
    model: model.key,
    width: defaults.width,
    height: defaults.height,
    imageCount: resolveImageCountDefault(model),
    steps: defaults.steps,
    modeChoice: defaults.modeChoice,
    guidanceScale: defaults.guidanceScale,
    promptUpsampling: defaults.promptUpsampling,
    seed: resolveSeedDefault(model),
  };
}

export function imageConfigToAuthoringValues(
  config: ImageAuthoringConfig,
  models: readonly RuntimeImageModel[],
) {
  const model = models.find((item) => item.key === config.modelKey) ?? null;
  if (!model) {
    return {
      values: null,
      model: null,
      unavailableModelKey: config.modelKey,
      preservedConfig: config,
    } as const;
  }

  const defaults = resolveImageAuthoringDefaults(model, config.prompt);
  const parameters = config.parameters;
  return {
    values: {
      ...defaults,
      width: finiteNumber(parameters.width, defaults.width),
      height: finiteNumber(parameters.height, defaults.height),
      imageCount: finiteNumber(parameters.imageCount, defaults.imageCount),
      steps: finiteNumber(parameters.steps, defaults.steps),
      modeChoice: stringValue(parameters.modeChoice, defaults.modeChoice),
      guidanceScale: finiteNumber(
        parameters.guidanceScale,
        defaults.guidanceScale,
      ),
      promptUpsampling: booleanValue(
        parameters.promptUpsampling,
        defaults.promptUpsampling,
      ),
      seed: stringValue(parameters.seed, defaults.seed),
    },
    model,
    unavailableModelKey: null,
    preservedConfig: config,
  } as const;
}

function supportsParameter(model: RuntimeImageModel, key: string) {
  const config = model.parameters[key];
  return Boolean(config && typeof config === "object" && !Array.isArray(config));
}

export function authoringValuesToImageConfig(
  values: ImageAuthoringValues,
  model: RuntimeImageModel,
): ImageAuthoringConfig & {
  parameters: Record<string, ImageAuthoringParameterValue>;
} {
  const parameters: Record<string, ImageAuthoringParameterValue> = {};
  for (const key of canonicalParameterKeys) {
    if (!supportsParameter(model, key)) continue;
    parameters[key] = values[key];
  }
  return { prompt: values.prompt, modelKey: model.key, parameters };
}

export function migrateImageAuthoringValues(
  previous: Pick<ImageAuthoringValues, "prompt">,
  nextModel: RuntimeImageModel,
) {
  return resolveImageAuthoringDefaults(nextModel, previous.prompt);
}

export function applyImageModeChoice(
  values: ImageAuthoringValues,
  model: RuntimeImageModel,
  modeChoice: string,
) {
  const baseMode = modeChoice.trim().toLowerCase().includes("base");
  const stepsRange = getRuntimeImageParamRange(model, "steps");
  const guidanceRange = getRuntimeImageParamRange(model, "guidanceScale");
  return {
    ...values,
    modeChoice,
    steps: clampAndSnap(
      baseMode ? 50 : 4,
      stepsRange.min,
      stepsRange.max,
      stepsRange.step,
    ),
    guidanceScale: clampAndSnap(
      1,
      guidanceRange.min,
      guidanceRange.max,
      guidanceRange.step,
    ),
  };
}

function clampAndSnap(value: number, min: number, max: number, step: number) {
  const clamped = Math.min(max, Math.max(min, value));
  if (step <= 0) return clamped;
  const snapped = min + Math.round((clamped - min) / step) * step;
  return Math.min(max, Math.max(min, snapped));
}

export function applyImageSizePreset(
  preset: ImageSizePreset,
  model: RuntimeImageModel,
) {
  const defaults = resolveRuntimeImageDefaults(model);
  const [ratioWidth, ratioHeight] = sizePresetRatios[preset];
  const area = Math.max(1, defaults.width * defaults.height);
  const widthRange = getRuntimeImageParamRange(model, "width");
  const heightRange = getRuntimeImageParamRange(model, "height");
  const rawWidth = Math.sqrt((area * ratioWidth) / ratioHeight);
  const rawHeight = rawWidth * (ratioHeight / ratioWidth);
  return {
    width: clampAndSnap(
      rawWidth,
      widthRange.min,
      widthRange.max,
      widthRange.step,
    ),
    height: clampAndSnap(
      rawHeight,
      heightRange.min,
      heightRange.max,
      heightRange.step,
    ),
  };
}

export function resolveImageSizePreset(width: number, height: number) {
  if (width <= 0 || height <= 0) return null;
  const ratio = width / height;
  let closest: ImageSizePreset | null = null;
  let distance = Number.POSITIVE_INFINITY;
  for (const [preset, [ratioWidth, ratioHeight]] of Object.entries(
    sizePresetRatios,
  ) as Array<[ImageSizePreset, readonly [number, number]]>) {
    const nextDistance = Math.abs(ratio - ratioWidth / ratioHeight);
    if (nextDistance < distance) {
      closest = preset;
      distance = nextDistance;
    }
  }
  return distance <= 0.03 ? closest : null;
}

export function isImageAuthoringNumberValid(
  model: RuntimeImageModel,
  key: "width" | "height" | "imageCount" | "steps" | "guidanceScale",
  value: number,
) {
  if (!Number.isFinite(value)) return false;
  const range = getRuntimeImageParamRange(model, key);
  if (value < range.min || value > range.max) return false;
  if (range.step <= 0) return true;
  const quotient = (value - range.min) / range.step;
  return Math.abs(quotient - Math.round(quotient)) <= 1e-6;
}
