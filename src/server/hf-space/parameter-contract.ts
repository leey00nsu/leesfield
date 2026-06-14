import {
  normalizeRuntimeParameterOptions,
  type RuntimeParameterOption,
  type RuntimeParameterOptionInput,
} from "@/shared/model-catalog/parameter-options";

export type HfParameterValueType = "string" | "number" | "boolean" | "file";

export type HfParameterBinding = {
  source: "hf_space";
  parameterName: string;
  valueType: HfParameterValueType;
  canonicalKey?: string;
  order: number;
};

export type HfEndpointParameter = {
  parameter_name?: string;
  label?: string;
  component?: string;
  python_type?: { type?: string } | string;
  parameter_has_default?: boolean;
  parameter_default?: unknown;
  choices?: RuntimeParameterOptionInput[];
  hidden?: boolean;
};

export type HfParameterConfig = {
  ui: "input" | "textarea" | "select" | "toggle" | "upload";
  label?: string;
  required?: boolean;
  default?: string | number | boolean;
  options?: RuntimeParameterOption[];
  binding: HfParameterBinding;
};

const canonicalKeys = new Set([
  "prompt",
  "inputAudio",
  "referenceText",
  "language",
  "speed",
  "seed",
  "voice",
  "speaker",
  "modeChoice",
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

function normalizeLookup(parameter: HfEndpointParameter) {
  return `${parameter.parameter_name ?? ""} ${parameter.label ?? ""}`
    .toLowerCase()
    .replace(/[_-]+/g, " ");
}

function resolveCanonicalKey(parameter: HfEndpointParameter) {
  const target = normalizeLookup(parameter);
  const parameterName = parameter.parameter_name?.trim().toLowerCase() ?? "";
  if (
    target.includes("reference transcript") ||
    target.includes("reference text") ||
    target.includes("ref text")
  ) {
    return "referenceText";
  }
  if (
    target.includes("reference audio") ||
    target.includes("ref audio")
  ) {
    return "inputAudio";
  }
  if (target.includes("target text") || target.includes("prompt")) {
    return "prompt";
  }
  if (target.trim() === "text text" || target.startsWith("text ")) {
    return "prompt";
  }
  if (target.includes("language")) return "language";
  if (target.includes("stream mode") || target.includes("streaming")) {
    return "streamMode";
  }
  if (target.includes("reference preset")) return "referencePreset";
  if (target.includes("custom instruction")) return "customInstruction";
  if (target.includes("voice instruction")) return "voiceInstruction";
  if (parameterName === "xvec_only") return "xvecOnly";
  if (target.includes("chunk size")) return "chunkSize";
  if (target.includes("temperature")) return "temperature";
  if (target.includes("top k")) return "topK";
  if (target.includes("repetition penalty")) return "repetitionPenalty";
  if (target.includes("speaker")) return "speaker";
  if (target.trim() === "voice voice") return "voice";
  if (target.includes("speed")) return "speed";
  if (target.includes("generation mode")) return "modeChoice";
  if (target.includes("seed")) return "seed";
  return null;
}

function resolveValueType(parameter: HfEndpointParameter): HfParameterValueType {
  const component = parameter.component?.toLowerCase() ?? "";
  const pythonType =
    typeof parameter.python_type === "string"
      ? parameter.python_type.toLowerCase()
      : parameter.python_type?.type?.toLowerCase() ?? "";
  if (
    component.includes("audio") ||
    component.includes("file") ||
    component.includes("image") ||
    pythonType.includes("filepath") ||
    pythonType.includes("filedata")
  ) {
    return "file";
  }
  if (component.includes("checkbox") || pythonType.includes("bool")) {
    return "boolean";
  }
  if (
    component.includes("number") ||
    component.includes("slider") ||
    pythonType.includes("int") ||
    pythonType.includes("float")
  ) {
    return "number";
  }
  return "string";
}

function resolveUi(
  parameter: HfEndpointParameter,
  valueType: HfParameterValueType,
  options: RuntimeParameterOption[],
): HfParameterConfig["ui"] {
  const component = parameter.component?.toLowerCase() ?? "";
  if (valueType === "file") return "upload";
  if (valueType === "boolean") return "toggle";
  if (options.length || component.includes("dropdown") || component.includes("radio")) {
    return "select";
  }
  if (component.includes("textbox") && normalizeLookup(parameter).includes("text")) {
    return "textarea";
  }
  return "input";
}

function toDefault(value: unknown) {
  return typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
    ? value
    : undefined;
}

export function buildHfParameterDescriptors(
  parameters: HfEndpointParameter[],
) {
  const result: Record<string, HfParameterConfig> = {};
  const warnings: string[] = [];

  parameters.forEach((parameter, order) => {
    const parameterName = parameter.parameter_name?.trim() ?? "";
    const component = parameter.component?.trim().toLowerCase() ?? "";
    if (!parameterName || parameter.hidden === true || component === "state") {
      return;
    }

    const canonicalKey = resolveCanonicalKey(parameter);
    const catalogKey =
      canonicalKey && canonicalKeys.has(canonicalKey)
        ? canonicalKey
        : `hf:${parameterName}`;
    if (result[catalogKey]) {
      warnings.push(`PARAMETER_KEY_COLLISION:${catalogKey}`);
      return;
    }

    const options = normalizeRuntimeParameterOptions(parameter.choices) ?? [];
    const valueType = resolveValueType(parameter);
    const config: HfParameterConfig = {
      ui: resolveUi(parameter, valueType, options),
      label: parameter.label?.trim() || parameterName,
      required: parameter.parameter_has_default === false,
      binding: {
        source: "hf_space",
        parameterName,
        valueType,
        ...(canonicalKey ? { canonicalKey } : {}),
        order,
      },
    };
    const defaultValue = toDefault(parameter.parameter_default);
    if (defaultValue !== undefined) config.default = defaultValue;
    if (options.length) config.options = options;
    result[catalogKey] = config;
  });

  return { parameters: result, warnings };
}
