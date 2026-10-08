import { promptPresetService } from "@/server/prompt-presets/prompt-preset-service";
import { PromptPresetError } from "@/server/prompt-presets/prompt-preset-errors";
import { promptPresetReference } from "@/shared/prompt-presets/prompt-preset-contract";
import type { GenerationMedia } from "@/shared/api/external-contract";

export async function resolveExternalPromptPreset(ownerEmail: string, type: GenerationMedia, reference: { key: string; revision: number }) {
  const preset = await promptPresetService.get(ownerEmail, reference.key);
  if (!preset.isActive) throw new PromptPresetError("PRESET_INACTIVE", 400);
  if (preset.revision !== reference.revision) throw new PromptPresetError("PRESET_CONFLICT", 409);
  if (preset.modality !== type) throw new PromptPresetError("PRESET_MODALITY_MISMATCH", 400);
  return promptPresetReference(preset);
}
