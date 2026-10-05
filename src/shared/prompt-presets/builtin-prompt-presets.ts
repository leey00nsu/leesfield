import characterSheet from "./builtins/character-sheet-creator.json";
import cameraGrid from "./builtins/multi-camera-nine-grid.json";
import locationSheet from "./builtins/location-sheet.json";
import {
  builtinPromptPresetSchema,
  type BuiltinPromptPreset,
} from "./prompt-preset-contract";

export const builtinPromptPresets: readonly BuiltinPromptPreset[] = Object.freeze([
  builtinPromptPresetSchema.parse(characterSheet),
  builtinPromptPresetSchema.parse(cameraGrid),
  builtinPromptPresetSchema.parse(locationSheet),
].map((preset) => Object.freeze({
  ...preset,
  requiredInputs: Object.freeze(preset.requiredInputs),
  recommendedParameters: Object.freeze(preset.recommendedParameters),
})));

export function findBuiltinPromptPreset(key: string): BuiltinPromptPreset | undefined {
  return builtinPromptPresets.find((preset) => preset.key === key);
}
