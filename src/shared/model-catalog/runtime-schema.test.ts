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
  it("HF-bound canonical step 오류에 provider label을 사용한다", () => {
    const providerModel: RuntimeAudioModel = {
      ...model,
      parameters: {
        ...model.parameters,
        speed: {
          ui: "range",
          label: "Playback Rate",
          min: 0.25,
          max: 4,
          step: 0.05,
          binding: {
            source: "hf_space",
            parameterName: "speed",
            valueType: "number",
            canonicalKey: "speed",
            order: 0,
          },
        },
      },
    };
    const t = (key: string, values?: Record<string, string | number | Date>) =>
      key === "step"
        ? `${values?.label} step ${values?.step}`
        : key;
    const result = createRuntimeAudioSchema([providerModel], t).safeParse({
      prompt: "hello",
      model: providerModel.key,
      speed: 1.025,
    });

    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe("Playback Rate step 0.05");
  });

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

  it("동적 file과 boolean 타입을 검증한다", () => {
    const schema = createRuntimeAudioSchema([
      {
        ...model,
        parameters: {
          ...model.parameters,
          "hf:reference_audio": {
            ui: "upload",
            binding: {
              source: "hf_space",
              parameterName: "reference_audio",
              valueType: "file",
              order: 2,
            },
          },
          "hf:use_xvector_only": {
            ui: "toggle",
            binding: {
              source: "hf_space",
              parameterName: "use_xvector_only",
              valueType: "boolean",
              order: 3,
            },
          },
        },
      },
    ]);

    expect(
      schema.safeParse({
        prompt: "hello",
        model: model.key,
        dynamicParams: {
          "hf:reference_audio": "data:audio/wav;base64,UklGRg==",
          "hf:use_xvector_only": true,
        },
      }).success,
    ).toBe(true);
    expect(
      schema.safeParse({
        prompt: "hello",
        model: model.key,
        dynamicParams: {
          "hf:reference_audio": true,
          "hf:use_xvector_only": "true",
        },
      }).success,
    ).toBe(false);
  });

  it("required 동적 파라미터 누락을 거부한다", () => {
    const schema = createRuntimeAudioSchema([
      {
        ...model,
        parameters: {
          ...model.parameters,
          "hf:reference_audio": {
            ui: "upload",
            required: true,
            binding: {
              source: "hf_space",
              parameterName: "reference_audio",
              valueType: "file",
              order: 2,
            },
          },
        },
      },
    ]);

    expect(
      schema.safeParse({
        prompt: "hello",
        model: model.key,
        dynamicParams: {},
      }).success,
    ).toBe(false);
  });

  it("동적 select options의 유효값만 허용한다", () => {
    const schema = createRuntimeAudioSchema([
      {
        ...model,
        parameters: {
          ...model.parameters,
          "hf:model_size": {
            ui: "select",
            options: [
              { label: "0.6B", value: "0.6B" },
              { label: "1.7B", value: "1.7B" },
            ],
            binding: {
              source: "hf_space",
              parameterName: "model_size",
              valueType: "string",
              order: 2,
            },
          },
        },
      },
    ]);

    expect(
      schema.safeParse({
        prompt: "hello",
        model: model.key,
        dynamicParams: { "hf:model_size": "1.7B" },
      }).success,
    ).toBe(true);
    expect(
      schema.safeParse({
        prompt: "hello",
        model: model.key,
        dynamicParams: { "hf:model_size": "9B" },
      }).success,
    ).toBe(false);
  });
});
