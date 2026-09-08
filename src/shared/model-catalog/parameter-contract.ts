import { normalizeRuntimeParameterOptions } from "./parameter-options";
type Config = Record<string, unknown>;
const numericFields = new Set([
  "width",
  "height",
  "steps",
  "seed",
  "imageCount",
  "durationSec",
  "fps",
  "guidanceScale",
  "speed",
  "chunkSize",
  "temperature",
  "topK",
  "repetitionPenalty",
]);
const booleanFields = new Set(["promptUpsampling", "xvecOnly"]);
export function parameterKind(
  name: string,
  config: Config,
): string | undefined {
  const binding = (config.binding ?? {}) as Config;
  if (typeof binding.kind === "string") return binding.kind;
  if (typeof binding.valueType === "string") return binding.valueType;
  if (config.ui === "hidden" && config.default === "" && !config.binding)
    return "string";
  if (numericFields.has(name) || config.ui === "range") return "number";
  if (booleanFields.has(name) || config.ui === "toggle") return "boolean";
  const options = normalizeRuntimeParameterOptions(config.options);
  if (options?.length) return typeof options[0].value;
  if (
    config.default !== undefined &&
    config.default !== null &&
    ["number", "boolean", "string"].includes(typeof config.default)
  )
    return typeof config.default;
}
export function parameterValueIssue(
  name: string,
  config: Config,
  value: unknown,
): string | undefined {
  if (value === undefined) return;
  const binding = (config.binding ?? {}) as Config;
  if (value === null) return binding.nullable === true ? undefined : "null";
  const kind = parameterKind(name, config);
  if (
    kind &&
    ["number", "boolean", "string", "file"].includes(kind) &&
    typeof value !== (kind === "file" ? "string" : kind)
  )
    return "type";
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return "type";
    if (
      (typeof config.min === "number" && value < config.min) ||
      (typeof config.max === "number" && value > config.max)
    )
      return "range";
    if (typeof config.step === "number" && config.step > 0) {
      const q =
        (value - (typeof config.min === "number" ? config.min : 0)) /
        config.step;
      if (Math.abs(q - Math.round(q)) > 1e-6) return "step";
    }
  }
  const options = normalizeRuntimeParameterOptions(config.options);
  if (options?.length && !options.some((option) => option.value === value))
    return "option";
}
export function parameterConfigurationIssues(parameters: unknown) {
  if (
    !parameters ||
    typeof parameters !== "object" ||
    Array.isArray(parameters)
  )
    return [];
  return Object.entries(parameters).flatMap(([name, raw]) => {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return [];
    const config = raw as Config;
    const reason =
      typeof config.min === "number" &&
      typeof config.max === "number" &&
      config.min > config.max
        ? "range"
        : typeof config.step === "number" && config.step <= 0
          ? "step"
          : parameterValueIssue(name, config, config.default);
    return reason ? [{ name, reason }] : [];
  });
}

export function formParameterIssues(
  parameters: unknown,
  values: Record<string, unknown>,
) {
  if (!parameters || typeof parameters !== "object") return [];
  return Object.entries(parameters).flatMap(([name, raw]) => {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return [];
    const config = raw as Config;
    let value = values[name];
    if (value === undefined || value === "") return [];
    // Numeric form strings need validation before the legacy adapter converts them.
    // Other fields already have labeled validation in the runtime schema.
    if (typeof value !== "string" || parameterKind(name, config) !== "number")
      return [];
    if (parameterKind(name, config) === "number" && typeof value === "string")
      value = value.trim() ? Number(value) : NaN;
    const reason = parameterValueIssue(name, config, value);
    return reason ? [{ name, reason }] : [];
  });
}
