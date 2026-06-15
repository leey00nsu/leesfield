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
        label:
          "Use x-vector only (No reference text needed, but lower quality)",
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

  it("label 설명의 canonical 키워드가 component 타입과 모순되면 generic으로 유지한다", () => {
    const result = buildHfParameterDescriptors([
      {
        parameter_name: "enable_prompt_cleanup",
        label: "Disable prompt cleanup",
        component: "Checkbox",
        parameter_default: false,
      },
      {
        parameter_name: "audio_quality",
        label: "Reference audio quality",
        component: "Slider",
        parameter_default: 0.8,
      },
      {
        parameter_name: "language_notes",
        label: "Language-specific instructions",
        component: "Textbox",
        parameter_default: "",
      },
    ]);

    expect(result.parameters.prompt).toBeUndefined();
    expect(result.parameters.inputAudio).toBeUndefined();
    expect(result.parameters.language).toBeUndefined();
    expect(result.parameters["hf:enable_prompt_cleanup"].binding).toMatchObject({
      parameterName: "enable_prompt_cleanup",
      valueType: "boolean",
    });
    expect(result.parameters["hf:audio_quality"].binding).toMatchObject({
      parameterName: "audio_quality",
      valueType: "number",
    });
    expect(result.parameters["hf:language_notes"].binding).toMatchObject({
      parameterName: "language_notes",
      valueType: "string",
    });
  });

  it("모호한 parameter name은 호환 가능한 명확한 label로 canonical 매칭한다", () => {
    const result = buildHfParameterDescriptors([
      {
        parameter_name: "field_1",
        label: "Reference Text",
        component: "Textbox",
      },
    ]);

    expect(result.parameters.referenceText.binding).toMatchObject({
      parameterName: "field_1",
      canonicalKey: "referenceText",
      valueType: "string",
    });
  });

  it("canonical key가 충돌하면 후속 파라미터를 generic binding으로 보존한다", () => {
    const result = buildHfParameterDescriptors([
      {
        parameter_name: "ref_text",
        label: "Reference Text",
        component: "Textbox",
      },
      {
        parameter_name: "transcript_copy",
        label: "Reference Text",
        component: "Textbox",
        parameter_default: "fallback",
      },
    ]);

    expect(result.parameters.referenceText.binding.parameterName).toBe(
      "ref_text",
    );
    expect(result.parameters["hf:transcript_copy"]).toMatchObject({
      default: "fallback",
      binding: {
        parameterName: "transcript_copy",
        valueType: "string",
        order: 1,
      },
    });
    expect(
      result.parameters["hf:transcript_copy"].binding,
    ).not.toHaveProperty("canonicalKey");
    expect(result.warnings).toContain(
      "PARAMETER_CANONICAL_FALLBACK:referenceText:transcript_copy",
    );
  });

  it("generic key 자체가 충돌하면 기존 값을 덮어쓰지 않는다", () => {
    const result = buildHfParameterDescriptors([
      {
        parameter_name: "fidelity_profile",
        label: "First Profile",
        component: "Textbox",
        parameter_default: "first",
      },
      {
        parameter_name: "fidelity_profile",
        label: "Second Profile",
        component: "Textbox",
        parameter_default: "second",
      },
    ]);

    expect(result.parameters["hf:fidelity_profile"].default).toBe("first");
    expect(result.warnings).toContain(
      "PARAMETER_KEY_COLLISION:hf:fidelity_profile",
    );
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

  it("Text로 시작하는 비표준 필드를 prompt로 오인하지 않는다", () => {
    const result = buildHfParameterDescriptors([
      {
        parameter_name: "text_editor",
        label: "Text Editor",
        component: "Textbox",
      },
    ]);

    expect(result.parameters.prompt).toBeUndefined();
    expect(result.parameters["hf:text_editor"]).toMatchObject({
      label: "Text Editor",
      binding: {
        parameterName: "text_editor",
      },
    });
    expect(
      result.parameters["hf:text_editor"].binding,
    ).not.toHaveProperty("canonicalKey");
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
