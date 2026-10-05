import type { PromptPreset, PromptPresetRef } from "./prompt-preset-contract";
import { findBuiltinPromptPreset } from "./builtin-prompt-presets";

/** Builtin requirements cannot be weakened by saved/request metadata. */
export function promptPresetReferenceImageCount(ref: PromptPresetRef): number {
  return (findBuiltinPromptPreset(ref.key)?.requiredInputs ?? ref.requiredInputs).referenceImageCount;
}

export type PromptPresetInputMode = "T2I" | "I2I" | "T2V" | "I2V" | "T2A";

export function promptPresetInputMode(
  preset: Pick<PromptPreset, "modality" | "requiredInputs">,
): PromptPresetInputMode {
  if (preset.modality === "audio") return "T2A";
  const reference = preset.requiredInputs.referenceImageCount === 1;
  return preset.modality === "video"
    ? (reference ? "I2V" : "T2V")
    : (reference ? "I2I" : "T2I");
}
