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
  it("keeps preset binding while converting editable values and switching model defaults", () => {
    const promptPreset = { key: "multi-camera-nine-grid", revision: 5, builtinRevision: 1,
      requiredInputs: { referenceImageCount: 1 }, recommendedParameters: { imageCount: 1 } };
    const promptPresetState = { name: "멀티 카메라 9 그리드", appliedPrompt: "저장본" };
    const values = migrateImageAuthoringValues({ prompt: "편집한 문구" }, secondModel);
    const config = authoringValuesToImageConfig(values, secondModel, { promptPreset, promptPresetState });
    expect(config).toMatchObject({ prompt: "편집한 문구", modelKey: secondModel.key, promptPreset, promptPresetState });
    expect(imageConfigToAuthoringValues(config, [secondModel]).preservedConfig).toEqual(config);
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
