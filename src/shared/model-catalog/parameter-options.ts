export type RuntimeParameterOptionValue = string | number;

export type RuntimeParameterOption = {
  label: string;
  value: RuntimeParameterOptionValue;
};

export type RuntimeParameterOptionInput =
  | RuntimeParameterOptionValue
  | [string, RuntimeParameterOptionValue]
  | RuntimeParameterOption;

export function isRuntimeParameterOptionValue(
  value: unknown,
): value is RuntimeParameterOptionValue {
  return typeof value === "string" || typeof value === "number";
}

export function isRuntimeParameterOption(
  value: unknown,
): value is RuntimeParameterOption {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.label === "string" &&
    candidate.label.trim().length > 0 &&
    isRuntimeParameterOptionValue(candidate.value)
  );
}

export function normalizeRuntimeParameterOption(
  value: unknown,
): RuntimeParameterOption | null {
  if (isRuntimeParameterOption(value)) {
    return {
      label: value.label,
      value: value.value,
    };
  }

  if (Array.isArray(value) && value.length === 2) {
    const [label, optionValue] = value;
    if (typeof label === "string" && label.trim() && isRuntimeParameterOptionValue(optionValue)) {
      return {
        label,
        value: optionValue,
      };
    }
  }

  if (isRuntimeParameterOptionValue(value)) {
    return {
      label: String(value),
      value,
    };
  }

  return null;
}

export function normalizeRuntimeParameterOptions(
  options: unknown,
): RuntimeParameterOption[] | undefined {
  if (!Array.isArray(options)) {
    return undefined;
  }

  const normalized = options
    .map((option) => normalizeRuntimeParameterOption(option))
    .filter((option): option is RuntimeParameterOption => option !== null);

  return normalized.length > 0 ? normalized : undefined;
}

export function getRuntimeParameterOptionValue(option: unknown) {
  return normalizeRuntimeParameterOption(option)?.value;
}

export function getRuntimeParameterOptionLabel(option: unknown) {
  return normalizeRuntimeParameterOption(option)?.label ?? "";
}

export function hasRuntimeParameterOption(
  options: unknown,
  value: string | number,
) {
  const normalized = normalizeRuntimeParameterOptions(options);
  if (!normalized?.length) {
    return false;
  }

  return normalized.some((option) => option.value === value);
}
