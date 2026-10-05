import { useState } from "react";
import { act, renderHook } from "@testing-library/react";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { createIntlWrapper } from "@/test-utils/intl";
import { useGenerationPromptPreset } from "./use-generation-prompt-preset";
import type { PromptPreset } from "@/shared/prompt-presets/prompt-preset-contract";

const preset: PromptPreset = { key: "personal-demo", revision: 3, name: "Demo", description: "", modality: "image", prompt: "saved draft", requiredInputs: { referenceImageCount: 0 }, recommendedParameters: {}, builtinKey: null, builtinRevision: null, defaultPrompt: null, isActive: true, isModified: false };
function composer(initial = "") {
  const applied = vi.fn();
  const hook = renderHook(() => {
    const [prompt, setPrompt] = useState(initial);
    return useGenerationPromptPreset({ modality: "image", enabled: true, prompt, getValues: () => ({}), isEdited: () => false,
      onApply: (value, updates) => { applied(value, updates); setPrompt(value); } });
  }, { wrapper: createIntlWrapper() });
  return { ...hook, applied };
}
describe("generation prompt preset chip", () => {
  beforeEach(() => vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ items: [preset] }), { status: 200 }))));
  afterEach(() => vi.unstubAllGlobals());
  it("preserves additional text on selection, edits and removal and never changes the saved preset", async () => {
    const { result, applied } = composer("my original draft");
    act(() => result.current.requestApply(preset));
    expect(applied).toHaveBeenLastCalledWith("saved draft\n\nmy original draft", {});
    expect(result.current.text).toBe("my original draft");
    act(() => result.current.editText("한국어 추가 문장\nsecond line"));
    expect(applied).toHaveBeenLastCalledWith("saved draft\n\n한국어 추가 문장\nsecond line", {});
    act(() => result.current.editPreset("edited only here"));
    expect(applied).toHaveBeenLastCalledWith("edited only here\n\n한국어 추가 문장\nsecond line", {});
    expect(result.current.modified).toBe(true);
    expect(preset.prompt).toBe("saved draft");
    await act(async () => { await result.current.catalog.refetch(); });
    expect(result.current.presetText).toBe("edited only here");
    act(() => result.current.requestApply({ ...preset, key: "other", prompt: "other body" }));
    expect(result.current.pending).not.toBeNull();
    act(() => result.current.cancel());
    expect(result.current.presetText).toBe("edited only here");
    expect(result.current.reference?.key).toBe("personal-demo");
    act(() => result.current.clear());
    expect(applied).toHaveBeenLastCalledWith("한국어 추가 문장\nsecond line", {});
    expect(result.current.text).toBe("한국어 추가 문장\nsecond line");
    expect(result.current.reference).toBeUndefined();
  });
  it("supports preset-only composition and confirmed replacement without duplicating bodies", () => {
    const { result, applied } = composer();
    act(() => result.current.requestApply(preset));
    expect(result.current.text).toBe("");
    expect(applied).toHaveBeenLastCalledWith("saved draft", {});
    act(() => result.current.editPreset("working body"));
    act(() => result.current.editText("extra"));
    act(() => result.current.requestApply({ ...preset, key: "next", revision: 4, prompt: "next body" }));
    act(() => result.current.confirm());
    expect(applied).toHaveBeenLastCalledWith("next body\n\nextra", {});
    expect(result.current.reference).toEqual(expect.objectContaining({ key: "next", revision: 4 }));
    expect(result.current.text).toBe("extra");
    act(() => result.current.requestApply({ ...preset, key: "next", revision: 4, prompt: "next body" }));
    expect(applied).toHaveBeenLastCalledWith("next body\n\nextra", {});
  });
  it("clears chip provenance when an external history prompt replaces the entire form", () => {
    const { result, rerender } = renderHook(({ prompt }) => useGenerationPromptPreset({
      modality: "image", enabled: true, prompt, getValues: () => ({}), isEdited: () => false, onApply: vi.fn(),
    }), { wrapper: createIntlWrapper(), initialProps: { prompt: "saved draft" } });
    act(() => result.current.requestApply(preset));
    rerender({ prompt: "history prompt" });
    expect(result.current.reference).toBeUndefined();
    expect(result.current.text).toBe("history prompt");
  });
  it("expands the token in its text position and removes provenance on range deletion", () => {
    const { result, applied } = composer();
    act(() => result.current.requestApply(preset));
    act(() => result.current.editText("before after", true, 7));
    expect(applied).toHaveBeenLastCalledWith("before \n\nsaved draft\n\nafter", {});
    expect(result.current.text).toBe("before after");
    act(() => result.current.editPreset("edited body"));
    expect(applied).toHaveBeenLastCalledWith("before \n\nedited body\n\nafter", {});
    act(() => result.current.editText("remains", false));
    expect(applied).toHaveBeenLastCalledWith("remains", {});
    expect(result.current.reference).toBeUndefined();
  });
});
