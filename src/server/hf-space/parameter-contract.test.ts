import { describe, expect, it } from "vitest";
import { buildHfParameterDescriptors } from "@/server/hf-space/parameter-contract";

describe("buildHfParameterDescriptors", () => {
  it("Qwen voice clone parameters를 canonical 또는 generic binding으로 보존한다", () => {
    const result = buildHfParameterDescriptors([
      {
        parameter_name: "ref_audio",
        label: "Reference Audio (Upload a voice sample to clone)",
        component: "Audio",
        parameter_has_default: false,
      },
      {
        parameter_name: "ref_text",
        label: "Reference Text (Transcript of the reference audio)",
        component: "Textbox",
        parameter_has_default: false,
      },
      {
        parameter_name: "target_text",
        label: "Target Text (Text to synthesize with cloned voice)",
        component: "Textbox",
        parameter_has_default: false,
      },
      {
        parameter_name: "language",
        label: "Language",
        component: "Dropdown",
        parameter_has_default: true,
        parameter_default: "Auto",
        choices: ["Auto", "Korean"],
      },
      {
        parameter_name: "use_xvector_only",
        label: "Use x-vector only",
        component: "Checkbox",
        parameter_has_default: true,
        parameter_default: false,
      },
      {
        parameter_name: "model_size",
        label: "Model Size",
        component: "Dropdown",
        parameter_has_default: true,
        parameter_default: "1.7B",
        choices: ["0.6B", "1.7B"],
      },
    ]);

    expect(result.warnings).toEqual([]);
    expect(result.parameters.inputAudio.binding).toMatchObject({
      parameterName: "ref_audio",
      valueType: "file",
      canonicalKey: "inputAudio",
      order: 0,
    });
    expect(result.parameters.referenceText.binding).toMatchObject({
      parameterName: "ref_text",
      canonicalKey: "referenceText",
    });
    expect(result.parameters.prompt.binding).toMatchObject({
      parameterName: "target_text",
      canonicalKey: "prompt",
    });
    expect(result.parameters.language.binding).toMatchObject({
      parameterName: "language",
      canonicalKey: "language",
    });
    expect(result.parameters["hf:use_xvector_only"]).toMatchObject({
      ui: "toggle",
      default: false,
      binding: {
        parameterName: "use_xvector_only",
        valueType: "boolean",
        order: 4,
      },
    });
    expect(result.parameters["hf:model_size"]).toMatchObject({
      ui: "select",
      default: "1.7B",
      options: [
        { label: "0.6B", value: "0.6B" },
        { label: "1.7B", value: "1.7B" },
      ],
      binding: {
        parameterName: "model_size",
        valueType: "string",
        order: 5,
      },
    });
  });

  it("이름 의미가 불명확한 공개 파라미터를 generic key로 유지한다", () => {
    const result = buildHfParameterDescriptors([
      {
        parameter_name: "fidelity_profile",
        label: "Render Profile",
        component: "Radio",
        parameter_has_default: true,
        parameter_default: "studio",
        choices: ["draft", "studio"],
      },
    ]);

    expect(result.parameters["hf:fidelity_profile"]).toMatchObject({
      ui: "select",
      label: "Render Profile",
      default: "studio",
      binding: {
        source: "hf_space",
        parameterName: "fidelity_profile",
        valueType: "string",
      },
    });
  });

  it("hidden/state 파라미터는 노출하지 않는다", () => {
    const result = buildHfParameterDescriptors([
      {
        parameter_name: "session_state",
        label: "Session",
        component: "State",
      },
      {
        parameter_name: "internal_token",
        label: "Internal",
        component: "Textbox",
        hidden: true,
      },
    ]);

    expect(result.parameters).toEqual({});
  });
});
