import { describe, expect, it } from "vitest";
import { createRuntimeAudioSchema } from "@/shared/model-catalog/runtime-schema";
import type { RuntimeAudioModel } from "@/shared/model-catalog/runtime-utils";

const model: RuntimeAudioModel = {
  type: "audio",
  key: "dynamic-audio",
  label: "Dynamic Audio",
  vendor: "HF Space",
  provider: "huggingface-space",
  parameters: {
    prompt: { ui: "textarea", required: true },
    "hf:temperature": {
      ui: "range",
      min: 0.1,
      max: 1,
      step: 0.1,
      binding: {
        source: "hf_space",
        parameterName: "temperature",
        valueType: "number",
        order: 1,
      },
    },
  },
  meta: {},
  isActive: true,
  isDefault: true,
};

describe("createRuntimeAudioSchema dynamicParams", () => {
  it("동적 number의 range와 step을 검증한다", () => {
    const schema = createRuntimeAudioSchema([model]);

    expect(
      schema.safeParse({
        prompt: "hello",
        model: model.key,
        dynamicParams: { "hf:temperature": 1.1 },
      }).success,
    ).toBe(false);
    expect(
      schema.safeParse({
        prompt: "hello",
        model: model.key,
        dynamicParams: { "hf:temperature": 0.15 },
      }).success,
    ).toBe(false);
  });
});
