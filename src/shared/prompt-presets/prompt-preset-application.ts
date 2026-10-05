import { generationPayload } from "@/shared/model-catalog/generation-payload";
import { getGradioContract, gradioInputValues } from "@/shared/model-catalog/gradio-contract";
import { hasRuntimeParameterOption } from "@/shared/model-catalog/parameter-options";
import { findBuiltinPromptPreset } from "./builtin-prompt-presets";
import { promptPresetReference, type PromptPreset, type PromptPresetRef } from "./prompt-preset-contract";
import { promptPresetReferenceImageCount } from "./prompt-preset-input-mode";

export type PromptPresetDraft = { preset: PromptPreset | null; appliedPrompt: string | null };
export const emptyPromptPresetDraft: PromptPresetDraft = { preset: null, appliedPrompt: null };

export function presetNeedsConfirmation(draft: PromptPresetDraft, prompt: string) {
  return prompt.trim().length > 0 && prompt !== draft.appliedPrompt;
}
export function applyPromptPreset(preset: PromptPreset, original = false) {
  const prompt = original ? preset.defaultPrompt : preset.prompt;
  if (prompt === null) throw new Error("PRESET_DEFAULT_UNAVAILABLE");
  return { prompt, draft: { preset, appliedPrompt: prompt }, reference: promptPresetReference(preset) };
}

type Model = { type: "image" | "video" | "audio"; parameters?: unknown; providerConfig?: unknown; meta?: unknown };
const record = (v: unknown): Record<string, unknown> => v && typeof v === "object" && !Array.isArray(v) ? v as Record<string, unknown> : {};
const sources = (v: unknown): string[] => typeof v === "string" ? v.trim() ? [v] : [] : Array.isArray(v) ? v.filter((s): s is string => typeof s === "string" && Boolean(s.trim())) : [];
export type PromptPresetInputIssue = "wrongModality" | "referenceUnsupported" | "referenceRequired" | "inputUnexpected" | "inputModeUnsupported";

/** Check the provider's actual file contract, never a catalog label or arbitrary URL parameter. */
export function promptPresetInputIssue(model: Model, payload: Record<string, unknown>, ref?: PromptPresetRef): PromptPresetInputIssue | null {
  if (!ref) return null;
  const builtin = findBuiltinPromptPreset(ref.key);
  if (builtin && builtin.modality !== model.type) return "wrongModality";
  const required = { referenceImageCount: promptPresetReferenceImageCount(ref) };
  const contract = getGradioContract(model);
  if (!required.referenceImageCount) {
    if ([payload.initImages, payload.initImage, payload.inputAudio, ...Object.values(record(payload.fileInputs))].some(value => sources(value).length)) return "inputUnexpected";
    const values = record(generationPayload(model, payload));
    const mediaFields = contract?.inputs.filter(field => field.media && ["file", "files", "gallery"].includes(field.kind)) ?? [];
    if (mediaFields.some(field => sources(record(values.dynamicParams)[field.name]).length)) return "inputUnexpected";
    if (mediaFields.some(field => field.required || sources(field.default).length)) return "inputModeUnsupported";
    if (!contract && model.type === "video" && record(record(model.parameters).initImage).required === true) return "inputModeUnsupported";
    return null;
  }
  if (contract) {
    const fields = contract.inputs.filter(f => f.media === "image" && ["file", "files", "gallery"].includes(f.kind));
    if (!fields.length) return "referenceUnsupported";
    const mapped = record(generationPayload(model, payload));
    // Other incomplete parameters must not hide the reference-specific error.
    const dynamic = record(mapped.dynamicParams);
    let inputs = dynamic;
    try { inputs = gradioInputValues(contract, mapped); } catch { /* Form validation reports other fields separately. */ }
    return fields.reduce((n, f) => n + sources(inputs[f.name]).length, 0) >= required.referenceImageCount ? null : "referenceRequired";
  }
  const meta = record(model.meta);
  const supported = model.type === "image" ? Number(meta.max_input_images ?? 0) >= required.referenceImageCount
    : model.type === "video" && meta.supports_init_image === true;
  if (!supported) return "referenceUnsupported";
  const count = sources(model.type === "image" ? payload.initImages : payload.initImage).length;
  return count >= required.referenceImageCount ? null : "referenceRequired";
}

export const promptPresetInputMessages: Record<PromptPresetInputIssue, string> = {
  wrongModality: "이 매체에서 사용할 수 없는 프리셋입니다.",
  referenceUnsupported: "이 프리셋은 참고 이미지를 받는 모델이 필요합니다.",
  referenceRequired: "이 프리셋을 사용하려면 참고 이미지 1개를 추가하세요.",
  inputUnexpected: "텍스트 입력 프리셋에서는 미디어 연결을 사용할 수 없습니다. 연결을 해제하거나 이미지 입력 프리셋을 선택하세요.",
  inputModeUnsupported: "이 모델은 미디어 입력이 필수입니다. 입력 유형에 맞는 프리셋이나 모델을 선택하세요.",
};

/** Returns only supported settings. User changes take precedence over recommendations. */
export function promptPresetRecommendations(model: Model, _values: Record<string, unknown>, ref: PromptPresetRef, isEdited: (path: string) => boolean) {
  const updates: Record<string, unknown> = {};
  const parameters = record(model.parameters);
  const contract = getGradioContract(model);
  const setting = (key: string) => {
    const binding = Object.values(parameters).map(p => record(record(p).binding)).find(b => b.canonicalKey === key);
    const field = contract?.inputs.find(f => f.name === key || (binding?.parameterName ?? record(record(parameters[key]).binding).parameterName) === f.name);
    const schema = record(field?.schema);
    const config = field ? { ...field, min: field.min ?? schema.minimum, max: field.max ?? schema.maximum, step: field.step ?? schema.multipleOf } : record(parameters[key]);
    return { config, path: field ? "dynamicParams." + field.name : key, exists: field !== undefined || Object.hasOwn(parameters, key) };
  };
  const put = (path: string, value: unknown) => { if (!isEdited(path)) updates[path] = value; };
  if (ref.recommendedParameters.imageCount !== undefined) {
    const count = setting("imageCount");
    if (count.exists && !isEdited(count.path)) {
      const c = record(count.config);
      const target = ref.recommendedParameters.imageCount;
      const choices = c.choices ?? c.options;
      const step = Number(c.step ?? 1), min = Number(c.min ?? 1);
      if (target >= min && target <= Number(c.max ?? 8) && step > 0
        && Math.abs((target - min) / step - Math.round((target - min) / step)) < 0.000001
        && (!Array.isArray(choices) || hasRuntimeParameterOption(choices, target))) put(count.path, target);
    }
  }
  return { updates };
}
