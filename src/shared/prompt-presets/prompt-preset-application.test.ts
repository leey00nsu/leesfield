import { describe, expect, it } from "vitest";
import { applyPromptPreset, emptyPromptPresetDraft, presetNeedsConfirmation, promptPresetInputIssue, promptPresetRecommendations } from "./prompt-preset-application";
import { promptPresetReference, type PromptPreset } from "./prompt-preset-contract";
import { builtinPromptPresets } from "./builtin-prompt-presets";

const character: PromptPreset = { ...builtinPromptPresets[0], prompt: "saved replacement", revision: 4, builtinKey: builtinPromptPresets[0].key, builtinRevision: 1, defaultPrompt: builtinPromptPresets[0].prompt, isActive: true, isModified: true };
describe("prompt preset application boundary", () => {
  it("rejects media in a text-only preset and rejects a model that requires an image for T2V", () => {
    const ref = { key: "personal", revision: 1, requiredInputs: { referenceImageCount: 0 }, recommendedParameters: {} };
    expect(promptPresetInputIssue({ type: "video" }, { initImage: "https://example.com/ref.png" }, ref)).toBe("inputUnexpected");
    expect(promptPresetInputIssue({ type: "video", parameters: { initImage: { required: true } } }, {}, ref)).toBe("inputModeUnsupported");
    expect(promptPresetInputIssue({ type: "audio" }, { fileInputs: { reference_audio: ["https://example.com/a.wav"] } }, ref)).toBe("inputUnexpected");
    expect(promptPresetInputIssue({ type: "image" }, {}, ref)).toBeNull();
    expect(promptPresetInputIssue({ type: "video" }, {}, ref)).toBeNull();
    expect(promptPresetInputIssue({ type: "audio" }, {}, ref)).toBeNull();
  });
  it("distinguishes saved text and original without writing to the catalog", () => {
    expect(applyPromptPreset(character).prompt).toBe("saved replacement");
    expect(applyPromptPreset(character, true).prompt).toBe(character.defaultPrompt);
    expect(character.prompt).toBe("saved replacement");
    expect(presetNeedsConfirmation(emptyPromptPresetDraft, "my original draft")).toBe(true);
    const applied = applyPromptPreset(character);
    expect(presetNeedsConfirmation(applied.draft, applied.prompt)).toBe(false);
    expect(presetNeedsConfirmation(applied.draft, "edited only here")).toBe(true);
  });
  it("uses trusted builtin image requirements even when request metadata is weakened", () => {
    const ref = { ...promptPresetReference(character), requiredInputs: { referenceImageCount: 0 } };
    expect(promptPresetInputIssue({ type: "image", meta: { max_input_images: 1 } }, {}, ref)).toBe("referenceRequired");
    expect(promptPresetInputIssue({ type: "image", meta: { max_input_images: 0 } }, { initImages: ["https://example.com/ref.png"] }, ref)).toBe("referenceUnsupported");
    expect(promptPresetInputIssue({ type: "image", meta: { max_input_images: 1 } }, { initImages: ["https://example.com/ref.png"] }, ref)).toBeNull();
  });
  it("ignores legacy ratio recommendations and only recommends supported image count", () => {
    const model = { type: "image" as const, parameters: { width: { min: 256, max: 2048, step: 64, default: 1024 }, height: { min: 256, max: 2048, step: 64, default: 1024 }, imageCount: { min: 1, max: 4 } } };
    const recommendation = promptPresetRecommendations(model, { width: 1024, height: 1024 }, promptPresetReference(character), () => false);
    expect(recommendation.updates).toEqual({ imageCount: 1 });
    expect(promptPresetRecommendations({ type: "image" }, {}, promptPresetReference(character), () => false)).toEqual({ updates: {} });
    expect(promptPresetRecommendations(model, { width: 640, height: 640 }, promptPresetReference(character), p => p === "width").updates).not.toHaveProperty("width");
    const grid: PromptPreset = { ...builtinPromptPresets[1], builtinKey: builtinPromptPresets[1].key, builtinRevision: 1, defaultPrompt: builtinPromptPresets[1].prompt, isActive: true, isModified: false };
    expect(promptPresetRecommendations(model, {}, promptPresetReference(grid), () => false).updates).toEqual({ imageCount: 1 });
  });
});
