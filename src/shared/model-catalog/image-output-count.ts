import { getGradioContract, gradioInputValues, type GradioField } from "./gradio-contract";
import { getRuntimeImageParamConfig, getRuntimeImageParamRange, type RuntimeImageModel } from "./runtime-utils";

export type ImageOutputCount = {
  fieldName?: string;
  min: number;
  max: number;
  step: number;
  choices?: number[];
  defaultValue: number;
  fixed: boolean;
  accepts: (value: number) => boolean;
};

const countNames = new Set(["imageCount", "batch_size", "num_images", "image_count", "number_of_images", "num_outputs"]);
const single: ImageOutputCount = { min: 1, max: 1, step: 1, defaultValue: 1, fixed: true, accepts: value => value === 1 };

/** Bind only an unambiguous provider output count, never an attachment limit. */
export function resolveImageOutputCount(model?: RuntimeImageModel): ImageOutputCount {
  if (!model) return single;
  const contract = getGradioContract(model);
  let field: GradioField | undefined;
  if (contract) {
    const candidates = contract.inputs.filter(candidate => candidate.kind === "number" && (
      countNames.has(candidate.name.replace(/^advanced__/, "")) ||
      Object.values(model.parameters).some(parameter => {
        if (!parameter || typeof parameter !== "object" || !("binding" in parameter)) return false;
        const binding = parameter.binding;
        return !!binding && typeof binding === "object" && "parameterName" in binding && binding.parameterName === candidate.name
          && "canonicalKey" in binding && binding.canonicalKey === "imageCount";
      })
    ));
    if (candidates.length !== 1) return single;
    field = candidates[0];
  }
  const config = getRuntimeImageParamConfig(model, "imageCount");
  if (!contract && !config) return single;
  const range = field ? {
    min: Math.max(1, field.min ?? 1, typeof field.schema.minimum === "number" ? field.schema.minimum : 1),
    max: Math.min(field.max ?? Number.MAX_SAFE_INTEGER, typeof field.schema.maximum === "number" ? field.schema.maximum : Number.MAX_SAFE_INTEGER),
    step: field.step ?? (typeof field.schema.multipleOf === "number" ? field.schema.multipleOf : 1),
  } : getRuntimeImageParamRange(model, "imageCount");
  const schemaChoices = field && (typeof field.schema.const === "number" ? [field.schema.const]
    : Array.isArray(field.schema.enum) ? field.schema.enum.filter((value): value is number => typeof value === "number") : undefined);
  const choices = field?.choices?.filter((value): value is number => typeof value === "number") ?? schemaChoices
    ?? config?.options?.map(option => typeof option === "object" ? Array.isArray(option) ? option[1] : option.value : option).filter((value): value is number => typeof value === "number");
  const hidden = field ? field.hidden : config?.ui === "hidden";
  const sourceDefault = field ? field.default : config?.default;
  const acceptsValue = (value: number) => {
    if (!Number.isSafeInteger(value) || value < 1 || value < range.min || value > range.max) return false;
    if (choices?.length && !choices.includes(value)) return false;
    if (field && contract) {
      try {
        gradioInputValues({ ...contract, inputGroups: undefined, inputs: [field] }, { dynamicParams: { [field.name]: value } });
        return true;
      } catch { return false; }
    }
    return Math.abs((value - range.min) / range.step - Math.round((value - range.min) / range.step)) < 1e-6;
  };
  const legalChoices = choices?.filter(acceptsValue);
  const defaultValue = hidden && typeof sourceDefault === "number" && acceptsValue(sourceDefault) ? sourceDefault
    : acceptsValue(1) ? 1
    : typeof sourceDefault === "number" && acceptsValue(sourceDefault) ? sourceDefault
    : legalChoices?.[0] ?? range.min;
  // Leave an unsupported/complex field in the original options renderer.
  if (!acceptsValue(defaultValue)) return single;
  const fixed = !!hidden || range.min === range.max || legalChoices?.length === 1;
  return {
    ...(field ? { fieldName: field.name } : {}), ...range, choices: legalChoices, defaultValue, fixed,
    accepts: value => acceptsValue(value) && (!fixed || value === defaultValue),
  };
}
