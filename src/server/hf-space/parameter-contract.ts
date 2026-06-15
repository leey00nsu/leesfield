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
  lines?: number;
  hidden?: boolean;
};

export type HfParameterConfig = {
  ui: "input" | "textarea" | "select" | "toggle" | "upload" | "range";
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

function normalizeSignal(value: string | undefined) {
  return (value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ");
}

function normalizePrimaryLabel(label: string | undefined) {
  return normalizeSignal(label?.replace(/\([^)]*\)/g, " "));
}

function matchCanonicalSignal(signal: string) {
  if (/^(ref|reference) (text|transcript)( path)?$/.test(signal)) {
    return "referenceText";
  }
  if (/^(ref|reference|input) audio( path)?$/.test(signal)) {
    return "inputAudio";
  }
  if (signal === "target text" || signal === "prompt" || signal === "text") {
    return "prompt";
  }
  if (signal === "language") return "language";
  if (signal === "stream mode" || signal === "streaming") return "streamMode";
  if (signal === "reference preset" || signal === "ref preset") {
    return "referencePreset";
  }
  if (signal === "custom instruction" || signal === "custom instruct") {
    return "customInstruction";
  }
  if (signal === "voice instruction" || signal === "voice instruct") {
    return "voiceInstruction";
  }
  if (signal === "xvec only") return "xvecOnly";
  if (signal === "chunk size") return "chunkSize";
  if (signal === "temperature") return "temperature";
  if (signal === "top k") return "topK";
  if (signal === "repetition penalty") return "repetitionPenalty";
  if (signal === "speaker") return "speaker";
  if (signal === "voice") return "voice";
  if (signal === "speed") return "speed";
  if (signal === "generation mode" || signal === "mode") return "modeChoice";
  if (signal === "seed") return "seed";
  return null;
}

function isCanonicalTypeCompatible(
  canonicalKey: string,
  valueType: HfParameterValueType,
  options: RuntimeParameterOption[],
) {
  if (canonicalKey === "inputAudio") return valueType === "file";
  if (
    canonicalKey === "prompt" ||
    canonicalKey === "referenceText" ||
    canonicalKey === "customInstruction" ||
    canonicalKey === "voiceInstruction"
  ) {
    return valueType === "string" && options.length === 0;
  }
  if (
    canonicalKey === "language" ||
    canonicalKey === "modeChoice" ||
    canonicalKey === "referencePreset" ||
    canonicalKey === "speaker"
  ) {
    return valueType === "string" && options.length > 0;
  }
  if (canonicalKey === "voice") return valueType === "string";
  if (canonicalKey === "seed") {
    return valueType === "string" || valueType === "number";
  }
  if (canonicalKey === "streamMode" || canonicalKey === "xvecOnly") {
    return valueType === "boolean";
  }
  if (
    canonicalKey === "speed" ||
    canonicalKey === "chunkSize" ||
    canonicalKey === "temperature" ||
    canonicalKey === "topK" ||
    canonicalKey === "repetitionPenalty"
  ) {
    return valueType === "number";
  }
  return true;
}

function resolveCanonicalKey(
  parameter: HfEndpointParameter,
  valueType: HfParameterValueType,
  options: RuntimeParameterOption[],
) {
  const nameMatch = matchCanonicalSignal(
    normalizeSignal(parameter.parameter_name),
  );
  if (nameMatch) {
    return isCanonicalTypeCompatible(nameMatch, valueType, options)
      ? nameMatch
      : null;
  }

  const labelMatch = matchCanonicalSignal(
    normalizePrimaryLabel(parameter.label),
  );
  if (
    labelMatch &&
    isCanonicalTypeCompatible(labelMatch, valueType, options)
  ) {
    return labelMatch;
  }
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
  if (component.includes("slider")) return "range";
  if (options.length || component.includes("dropdown") || component.includes("radio")) {
    return "select";
  }
  if (
    component.includes("textbox") &&
    (parameter.lines !== undefined && parameter.lines > 1 ||
      `${normalizeSignal(parameter.parameter_name)} ${normalizeSignal(parameter.label)}`.includes("text"))
  ) {
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

    const options = normalizeRuntimeParameterOptions(parameter.choices) ?? [];
    const valueType = resolveValueType(parameter);
    const matchedCanonicalKey = resolveCanonicalKey(
      parameter,
      valueType,
      options,
    );
    let canonicalKey =
      matchedCanonicalKey && canonicalKeys.has(matchedCanonicalKey)
        ? matchedCanonicalKey
        : null;
    let catalogKey = canonicalKey ?? `hf:${parameterName}`;
    if (canonicalKey && result[catalogKey]) {
      warnings.push(
        `PARAMETER_CANONICAL_FALLBACK:${canonicalKey}:${parameterName}`,
      );
      canonicalKey = null;
      catalogKey = `hf:${parameterName}`;
    }
    if (result[catalogKey]) {
      warnings.push(`PARAMETER_KEY_COLLISION:${catalogKey}`);
      return;
    }

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
