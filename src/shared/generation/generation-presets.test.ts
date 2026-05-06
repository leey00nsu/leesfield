import { describe, expect, it } from "vitest";
import {
  generationPresets,
  getGenerationPresets,
  generationModalities,
} from "@/shared/generation/generation-presets";

describe("generationPresets", () => {
  it("provides at least three starter presets for each generation modality", () => {
    expect(generationModalities).toEqual(["image", "video", "audio"]);

    for (const modality of generationModalities) {
      const presets = getGenerationPresets(modality);
      expect(presets).toHaveLength(3);
      expect(presets).toEqual(generationPresets[modality]);
      expect(new Set(presets.map((preset) => preset.id)).size).toBe(3);
      expect(
        presets.every(
          (preset) =>
            preset.labelKey.length > 0 &&
            preset.descriptionKey.length > 0 &&
            preset.promptKey.length > 0,
        ),
      ).toBe(true);
    }
  });
});
