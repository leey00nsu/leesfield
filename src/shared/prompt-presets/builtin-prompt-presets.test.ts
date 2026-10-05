// @vitest-environment node
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { builtinPromptPresets, findBuiltinPromptPreset } from "./builtin-prompt-presets";
import { promptPresetRefSchema, createPromptPresetSchema } from "./prompt-preset-contract";
import { promptPresetDisplayName } from "./prompt-preset-display-name";
import ko from "@/shared/i18n/messages/ko.json";
import en from "@/shared/i18n/messages/en.json";

describe("제공 프롬프트 원문 계약", () => {
  it("localizes only provided names and preserves owner names and original definitions", () => {
    for (const [messages, names] of [
      [ko, ["캐릭터 시트", "장면 시트"]],
      [en, ["Character Sheet", "Character Sheet"]],
    ] as const) {
      const translate = (key: string) => messages.promptPresets.builtinNames[key.split(".")[1] as keyof typeof messages.promptPresets.builtinNames];
      ["character-sheet-creator", "location-sheet"].forEach((key, index) => {
        const preset = findBuiltinPromptPreset(key)!;
        expect(promptPresetDisplayName(preset, translate)).toBe(names[index]);
        expect(promptPresetDisplayName({ ...preset, name: "My own sheet", builtinKey: key }, translate)).toBe("My own sheet");
      });
    }
    expect(findBuiltinPromptPreset("character-sheet-creator")?.name).toBe("Character Sheet Creator");
    expect(findBuiltinPromptPreset("location-sheet")?.name).toBe("Location Sheet");
  });
  it.each([
    ["character-sheet-creator", "48171d732a9f88b10c8d03c3fad4d2dde5d9823a1aebc53e244d100c09935637"],
    ["multi-camera-nine-grid", "f01ee7f427223469147261b71c8ff10bb64d258f632897611d86811c23b2e931"],
    ["location-sheet", "d51a9c6df2c17c4e0e47f2f21d65763677b9845922e23d2f201a0a932440cdb0"],
  ])("%s 원문을 변경하지 않는다", (key, hash) => {
    const preset = findBuiltinPromptPreset(key)!;
    expect(createHash("sha256").update(preset.prompt).digest("hex")).toBe(hash);
    expect(preset.requiredInputs.referenceImageCount).toBe(1);
    expect(preset.recommendedParameters.imageCount).toBe(1);
  });

  it("캐릭터 시트 권장 비율을 9 그리드에 전용하지 않는다", () => {
    expect(findBuiltinPromptPreset("character-sheet-creator")!.recommendedParameters.aspectRatio).toBe("16:9");
    expect(findBuiltinPromptPreset("multi-camera-nine-grid")!.recommendedParameters.aspectRatio).toBeUndefined();
    expect(findBuiltinPromptPreset("location-sheet")!.recommendedParameters.aspectRatio).toBeUndefined();
    expect(builtinPromptPresets.map((item) => item.key)).toHaveLength(3);
  });

  it("출처는 제한된 데이터이며 provider 파라미터를 허용하지 않는다", () => {
    expect(promptPresetRefSchema.safeParse({
      key: "multi-camera-nine-grid", revision: 1,
      requiredInputs: { referenceImageCount: 1 },
      recommendedParameters: { apiKey: "secret" },
    }).success).toBe(false);
    const custom = {
      key: "custom-sheet", name: "custom", description: "", modality: "image",
      requiredInputs: { referenceImageCount: 0 }, recommendedParameters: {},
    };
    expect(createPromptPresetSchema.safeParse({ ...custom, prompt: " " }).success).toBe(false);
    expect(createPromptPresetSchema.safeParse({ ...custom, prompt: "original custom" }).success).toBe(true);
  });
});
