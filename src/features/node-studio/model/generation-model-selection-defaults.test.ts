import { describe, expect, it } from "vitest";
import type { RuntimeAudioModel, RuntimeVideoModel } from "@/shared/model-catalog/runtime-utils";
import { projectGenerationModelSelectionDefaults } from "./generation-model-selection-defaults";
import { areGenerationNodeParametersValid } from "./generation-node-parameter-validation";

const video: RuntimeVideoModel = {
  type: "video", key: "wan2-2-hf", label: "Wan", provider: "hf_space", vendor: "Wan",
  isActive: true, isDefault: true, meta: { supports_init_image: true },
  parameters: {
    steps: { default: 6, ui: "range" },
    durationSec: { default: 3.5, ui: "range" },
    guidanceScale: { default: 1, ui: "range" },
  },
};

describe("generation model selection defaults", () => {
  it("persists generic video submission fields absent from the visible catalog", () => {
    const config = projectGenerationModelSelectionDefaults({}, {
      modelKey: video.key, prompt: "orbit", parameters: { steps: 8 },
    }, [video]);
    expect(config.parameters).toMatchObject({ steps: 8, aspectRatio: expect.any(String), resolution: expect.any(Number), fps: expect.any(Number) });
    expect(areGenerationNodeParametersValid(video, config.parameters as Record<string, unknown>)).toBe(true);
  });

  it.each(["aspectRatio", "resolution", "fps", "steps", "durationSec", "guidanceScale"])(
    "blocks Run when persisted video %s is missing", (key) => {
      const config = projectGenerationModelSelectionDefaults({}, { modelKey: video.key }, [video]);
      const parameters = { ...config.parameters as Record<string, unknown> };
      delete parameters[key];
      expect(areGenerationNodeParametersValid(video, parameters)).toBe(false);
    },
  );

  it("preserves audio canonical and provider-specific authored values", () => {
    const audio: RuntimeAudioModel = {
      ...video, type: "audio", key: "audio", parameters: {
        speed: { default: 1, ui: "range" },
        detail: { default: 4, ui: "range", binding: { source: "hf_space", parameterName: "detail", valueType: "number", order: 1 } },
      },
    };
    const config = projectGenerationModelSelectionDefaults({}, {
      modelKey: audio.key, parameters: { speed: 1.5, dynamicParams: { detail: 7 } },
    }, [audio]);
    expect(config.parameters).toMatchObject({ speed: 1.5, dynamicParams: { detail: 7 } });
    expect(projectGenerationModelSelectionDefaults(config, config, [audio])).toEqual(config);
  });

  it("repairs same-model missing fields while retaining existing custom and newly edited values", () => {
    const current = { modelKey: video.key, parameters: { steps: 8, custom: "keep" } };
    const config = projectGenerationModelSelectionDefaults(current, {
      modelKey: video.key, parameters: { durationSec: 4 },
    }, [video]);
    expect(config.parameters).toMatchObject({ steps: 8, custom: "keep", durationSec: 4, fps: 16, aspectRatio: expect.any(String), resolution: expect.any(Number) });
    expect(areGenerationNodeParametersValid(video, config.parameters as Record<string, unknown>)).toBe(true);
    const reselected = projectGenerationModelSelectionDefaults(current, current, [video]);
    expect(areGenerationNodeParametersValid(video, reselected.parameters as Record<string, unknown>)).toBe(true);
  });

  it("preserves parameters when omitted and restores defaults on an explicit empty reset", () => {
    const current = { modelKey: video.key, parameters: { steps: 8, custom: "keep" } };
    const omitted = projectGenerationModelSelectionDefaults(current, { modelKey: video.key }, [video]);
    expect(omitted.parameters).toMatchObject({ steps: 8, custom: "keep" });
    const reset = projectGenerationModelSelectionDefaults(current, { modelKey: video.key, parameters: {} }, [video]);
    expect(reset.parameters).toMatchObject({ steps: 6, fps: 16 });
    expect(reset.parameters).not.toHaveProperty("custom");
  });

  it.each([null, "", "invalid", -1])("preserves an explicitly invalid fps %s for Run validation", (fps) => {
    const current = projectGenerationModelSelectionDefaults({}, { modelKey: video.key }, [video]);
    const changed = projectGenerationModelSelectionDefaults(current, { modelKey: video.key, parameters: { fps } }, [video]);
    expect(changed.parameters).toHaveProperty("fps", fps);
    expect(areGenerationNodeParametersValid(video, changed.parameters as Record<string, unknown>)).toBe(false);
  });
});
