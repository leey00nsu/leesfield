import { getGradioContract, gradioInputValues } from "@/shared/model-catalog/gradio-contract";
import { generationPayload } from "@/shared/model-catalog/generation-payload";
import { mappedGenerationBodySchema } from "@/shared/api/generation-input";
import { parameterKind, numericParameterValue } from "@/shared/model-catalog/parameter-contract";
import { normalizeRuntimeParameterOptions } from "@/shared/model-catalog/parameter-options";
import { createRuntimeAudioSchema, createRuntimeImageSchema, createRuntimeVideoSchema } from "@/shared/model-catalog/runtime-schema";
import type {
  RuntimeAudioModel,
  RuntimeImageModel,
  RuntimeParameterConfig,
  RuntimeVideoModel,
} from "@/shared/model-catalog/runtime-utils";

type GenerationRuntimeModel = RuntimeAudioModel | RuntimeImageModel | RuntimeVideoModel;

const excludedKeys = new Set(["prompt", "model", "initImage", "inputAudio"]);
const audioCanonicalKeys = new Set([
  "voice",
  "speaker",
  "speed",
  "seed",
  "referenceText",
  "modeChoice",
  "language",
  "streamMode",
  "referencePreset",
  "customInstruction",
  "voiceInstruction",
  "xvecOnly",
  "chunkSize",
  "temperature",
  "topK",
  "repetitionPenalty",
]);

function parameterConfig(value: unknown): RuntimeParameterConfig | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as RuntimeParameterConfig
    : null;
}

function isDynamicAudioParameter(model: GenerationRuntimeModel, key: string) {
  return model.type === "audio" && !audioCanonicalKeys.has(key);
}

function isEmpty(value: unknown) {
  return value === undefined || value === null || (typeof value === "string" && !value.trim());
}

export function areGenerationNodeParametersValid(
  model: GenerationRuntimeModel,
  values: Record<string, unknown>,
) {
  const contract = getGradioContract(model);
  const payload = generationPayload(model, { ...values, model: model.key, prompt: "ready" }) as Record<string, unknown>;
  if (contract) {
    try {
      const parsed = mappedGenerationBodySchema(model.type).safeParse(payload);
      if (!parsed.success) return false;
      const dynamicParams = { ...parsed.data.dynamicParams };
      const isMedia = (kind: string) => ["file", "files", "gallery"].includes(kind);
      for (const field of contract.inputs) if (isMedia(field.kind)||field.canonical) delete dynamicParams[field.name];
      gradioInputValues({ ...contract, inputGroups: undefined, inputs: contract.inputs.filter(field => !isMedia(field.kind)&&!field.canonical) }, { dynamicParams });
      return true;
    } catch {return false;}
  }
  // The catalog can omit generic submission fields (for example Wan's fps).
  // Validate persisted values with the submission contract as well as UI fields.
  // Prompt and asset readiness are resolved separately from graph connections.
  const schema = model.type === "image" ? createRuntimeImageSchema([model])
    : model.type === "video" ? createRuntimeVideoSchema([model])
      : createRuntimeAudioSchema([model]);
  const parsed = schema.safeParse(payload);
  if (!parsed.success && parsed.error.issues.some((issue) =>
    !["prompt", "model", "initImage", "initImages", "inputAudio"].includes(String(issue.path[0])),
  )) return false;

  const dynamicValues = values.dynamicParams && typeof values.dynamicParams === "object" && !Array.isArray(values.dynamicParams)
    ? values.dynamicParams as Record<string, unknown>
    : {};

  return Object.entries(model.parameters).every(([key, rawConfig]) => {
    const config = parameterConfig(rawConfig);
    if (
      !config ||
      excludedKeys.has(key) ||
      config.ui === "hidden" ||
      config.ui === "upload" ||
      config.binding?.valueType === "file"
    ) return true;

    const stored = isDynamicAudioParameter(model, key) ? dynamicValues[key] : values[key];
    const value = stored ?? config.default;
    if (isEmpty(value)) return !config.required;

    const options = normalizeRuntimeParameterOptions(config.options);
    if (options?.length && !options.some((option) => String(option.value) === String(value))) {
      return false;
    }

    const expectsNumber =
      config.ui === "range" ||
      config.binding?.valueType === "number" ||
      typeof config.default === "number";
    if (expectsNumber) {
      const numericValue = parameterKind(key, config as Record<string, unknown>) === "number" ? numericParameterValue(value) : value;
      if (typeof numericValue !== "number" || !Number.isFinite(numericValue)) return false;
      if (typeof config.min === "number" && numericValue < config.min) return false;
      if (typeof config.max === "number" && numericValue > config.max) return false;
    }

    if (config.ui === "toggle" || config.binding?.valueType === "boolean") {
      return typeof value === "boolean";
    }
    if (config.binding?.valueType === "string") return typeof value === "string";
    return true;
  });
}
