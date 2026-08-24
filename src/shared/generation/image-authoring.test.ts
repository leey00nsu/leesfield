import { describe, expect, it } from "vitest";

import { runtimeImageModelsFixture } from "@/test-utils/fixtures/runtime-model-catalog";

import {
  applyImageSizePreset,
  applyImageModeChoice,
  authoringValuesToImageConfig,
  imageConfigToAuthoringValues,
  isImageAuthoringNumberValid,
  migrateImageAuthoringValues,
  resolveImageAuthoringDefaults,
  resolveImageSizePreset,
} from "./image-authoring";

describe("image authoring", () => {
  const firstModel = runtimeImageModelsFixture[0]!;
  const secondModel = runtimeImageModelsFixture[1] ?? firstModel;

  it("resolves catalog defaults and round-trips canonical parameters", () => {
    const values = resolveImageAuthoringDefaults(firstModel, "city at night");
    const config = authoringValuesToImageConfig(values, firstModel);
    const restored = imageConfigToAuthoringValues(
      config,
      runtimeImageModelsFixture,
    );

    expect(config.prompt).toBe("city at night");
    expect(config.modelKey).toBe(firstModel.key);
    expect(restored.values).toMatchObject(values);
    expect(restored.unavailableModelKey).toBeNull();
  });

  it("preserves a null or unavailable model config without guessing", () => {
    const nullModel = imageConfigToAuthoringValues(
      { prompt: "draft", modelKey: null, parameters: {} },
      runtimeImageModelsFixture,
    );
    const unavailable = imageConfigToAuthoringValues(
      {
        prompt: "legacy",
        modelKey: "retired/model",
        parameters: { width: 777, custom: "keep" },
      },
      runtimeImageModelsFixture,
    );

    expect(nullModel.values).toBeNull();
    expect(nullModel.unavailableModelKey).toBeNull();
    expect(unavailable.values).toBeNull();
    expect(unavailable.unavailableModelKey).toBe("retired/model");
    expect(unavailable.preservedConfig.parameters).toEqual({
      width: 777,
      custom: "keep",
    });
  });

  it("migrates to the next model defaults while retaining the prompt", () => {
    const migrated = migrateImageAuthoringValues(
      { prompt: "keep this prompt" },
      secondModel,
    );

    expect(migrated.prompt).toBe("keep this prompt");
    expect(migrated.model).toBe(secondModel.key);
    expect(migrated).toEqual(
      resolveImageAuthoringDefaults(secondModel, "keep this prompt"),
    );
  });

  it("drops canonical parameters that the target model does not support", () => {
    const modelWithoutSeed = {
      ...firstModel,
      parameters: { ...firstModel.parameters, seed: undefined },
    };
    const values = resolveImageAuthoringDefaults(firstModel, "prompt");
    values.seed = "42";

    const config = authoringValuesToImageConfig(values, modelWithoutSeed);

    expect(config.parameters).not.toHaveProperty("seed");
  });

  it("maps size presets to valid canonical width and height", () => {
    const size = applyImageSizePreset("16:9", firstModel);

    expect(isImageAuthoringNumberValid(firstModel, "width", size.width)).toBe(
      true,
    );
    expect(
      isImageAuthoringNumberValid(firstModel, "height", size.height),
    ).toBe(true);
    expect(resolveImageSizePreset(size.width, size.height)).toBe("16:9");
  });

  it("applies shared mode-dependent steps and guidance", () => {
    const values = resolveImageAuthoringDefaults(firstModel, "prompt");
    const adjusted = applyImageModeChoice(values, firstModel, "Base");

    expect(adjusted.modeChoice).toBe("Base");
    expect(isImageAuthoringNumberValid(firstModel, "steps", adjusted.steps)).toBe(true);
    expect(
      isImageAuthoringNumberValid(
        firstModel,
        "guidanceScale",
        adjusted.guidanceScale,
      ),
    ).toBe(true);
  });
});
