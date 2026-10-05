import { findBuiltinPromptPreset } from "@/shared/prompt-presets/builtin-prompt-presets";
import { promptPresetReference, promptPresetRefSchema, promptPresetWorkStateSchema, type PromptPreset, type PromptPresetModality } from "@/shared/prompt-presets/prompt-preset-contract";
import { promptPresetReferenceImageCount } from "@/shared/prompt-presets/prompt-preset-input-mode";
import { contractInputPorts } from "@/shared/model-catalog/file-input-ports";
import { promptPresetRecommendations } from "@/shared/prompt-presets/prompt-preset-application";
import type { RuntimeImageModel, RuntimeVideoModel, RuntimeAudioModel } from "@/shared/model-catalog/runtime-utils";
import { generationPayload } from "@/shared/model-catalog/generation-payload";

export function presetCanonicalKind(kind: string) {
  return kind.startsWith("preset.") && findBuiltinPromptPreset(kind.slice(7)) ? "generate.image" : kind;
}

export function applyNodePromptPreset(config: Record<string, unknown>, preset: PromptPreset,
  model?: RuntimeImageModel | RuntimeVideoModel | RuntimeAudioModel, original = false, isEdited: (path: string) => boolean = () => false) {
  const prompt = original ? preset.defaultPrompt : preset.prompt;
  if (prompt === null) throw new Error("PRESET_DEFAULT_UNAVAILABLE");
  const promptPreset = promptPresetReference(preset);
  const parameters = { ...record(config.parameters) };
  const recommendation = model ? promptPresetRecommendations(model, record(generationPayload(model, parameters)), promptPreset, isEdited) : null;
  for (const [path, value] of Object.entries(recommendation?.updates ?? {})) {
    if (path.startsWith("dynamicParams.")) parameters.dynamicParams = {
      ...record(parameters.dynamicParams), [path.slice(14)]: value,
    };
    else parameters[path] = value;
  }
  return { config: { ...config, prompt, parameters, promptPreset,
    promptPresetState: { name: preset.name, appliedPrompt: prompt } } };
}

export function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

export function composeNodePresetPrompt(text: string, body: string, offset: number) {
  const position = Math.min(Math.max(offset, 0), text.length);
  const before = text.slice(0, position), after = text.slice(position);
  return (before ? before + "\n\n" : "") + body + (after ? "\n\n" + after : "");
}

/** Restore only an exact, verifiable token snapshot; never remove a guessed substring. */
export function hydrateNodePromptPreset(config: Record<string, unknown>, modality: PromptPresetModality) {
  const prompt = typeof config.prompt === "string" ? config.prompt : "";
  const ref = promptPresetRefSchema.safeParse(config.promptPreset);
  const state = promptPresetWorkStateSchema.safeParse(config.promptPresetState);
  if (!ref.success || !state.success) return { preset: null, text: prompt, body: "", offset: 0 };
  const body = state.data.appliedPrompt;
  let text: string, offset: number;
  if (state.data.userText !== undefined && state.data.tokenOffset !== undefined &&
      composeNodePresetPrompt(state.data.userText, body, state.data.tokenOffset) === prompt) {
    text = state.data.userText; offset = Math.min(state.data.tokenOffset, text.length);
  } else if (prompt === body) { text = ""; offset = 0; }
  else if (prompt.startsWith(body + "\n\n")) { text = prompt.slice(body.length + 2); offset = 0; }
  else return { preset: null, text: prompt, body: "", offset: 0 };
  const builtin = findBuiltinPromptPreset(ref.data.key);
  const preset: PromptPreset = { ...ref.data, modality, name: state.data.name, description: "",
    prompt: body, builtinKey: builtin?.key ?? null, builtinRevision: ref.data.builtinRevision ?? null,
    defaultPrompt: builtin?.prompt ?? null, isActive: true, isModified: false };
  return { preset, text, body, offset };
}

export function writeNodePromptPreset(config: Record<string, unknown>, text: string,
  preset: PromptPreset | null, body = preset?.prompt ?? "", offset = 0) {
  const next = { ...config };
  if (!preset) {
    delete next.promptPreset; delete next.promptPresetState;
    return { ...next, prompt: text };
  }
  const tokenOffset = Math.min(Math.max(offset, 0), text.length);
  return { ...next, prompt: composeNodePresetPrompt(text, body, tokenOffset),
    promptPreset: promptPresetReference(preset),
    promptPresetState: { name: preset.name, appliedPrompt: body, userText: text, tokenOffset } };
}

export function projectNodePromptPresetInputs(config: Record<string, unknown>, kind: string,
  model?: RuntimeImageModel | RuntimeVideoModel | RuntimeAudioModel) {
  const preset = promptPresetRefSchema.safeParse(config.promptPreset);
  if (!preset.success) return {};
  const supportsImageInput = promptPresetReferenceImageCount(preset.data) > 0;
  const fields = model ? contractInputPorts(model)?.filter(port => port.type === "image") ?? [] : [];
  const providerInputSchema = !supportsImageInput ? [] : fields.length
    ? fields.map(port => ({ ...port, name: fields.length === 1 ? "image" : port.name }))
    : [{ name: "image", type: "image" as const, label: "참고 이미지", required: true, multiple: kind === "generate.image", maxItems: undefined }];
  return { supportsImageInput, providerInputSchema };
}
