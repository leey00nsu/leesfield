import { findBuiltinPromptPreset } from "./builtin-prompt-presets";

const builtinNameKeys: Record<string, string> = {
  "character-sheet-creator": "builtinNames.characterSheet",
  "location-sheet": "builtinNames.locationSheet",
};

// Translate only the provided name. Owner renames and stored prompt snapshots stay intact.
export function promptPresetDisplayName(
  preset: { key: string; name: string; builtinKey?: string | null },
  translate: (key: string) => string,
): string {
  const builtin = findBuiltinPromptPreset(preset.builtinKey ?? preset.key);
  const key = builtin && builtinNameKeys[builtin.key];
  return builtin && key && preset.name === builtin.name ? translate(key) : preset.name;
}
