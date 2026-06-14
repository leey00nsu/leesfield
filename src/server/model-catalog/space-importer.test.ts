import { beforeEach, describe, expect, it, vi } from "vitest";

const mockConnect = vi.hoisted(() => vi.fn());

vi.mock("@gradio/client", () => ({
  Client: {
    connect: mockConnect,
  },
}));

describe("importModelDraftFromSpace", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("미지의 Qwen voice clone 파라미터를 원래 API binding과 함께 보존한다", async () => {
    mockConnect.mockResolvedValue({
      view_api: vi.fn().mockResolvedValue({
        named_endpoints: {
          "/generate_voice_clone": {
            parameters: [
              { parameter_name: "ref_audio", label: "Reference Audio", parameter_has_default: false },
              { parameter_name: "ref_text", label: "Reference Text", parameter_has_default: false },
              { parameter_name: "target_text", label: "Target Text", parameter_has_default: false },
              { parameter_name: "use_xvector_only", label: "Use x-vector only", parameter_default: false },
              { parameter_name: "model_size", label: "Model Size", parameter_default: "1.7B" },
            ],
          },
        },
      }),
      config: {
        space_id: "Qwen/Qwen3-TTS",
        title: "Qwen3 TTS",
        components: [
          { id: 1, type: "audio", props: { label: "Reference Audio" } },
          { id: 2, type: "textbox", props: { label: "Reference Text", lines: 2 } },
          { id: 3, type: "textbox", props: { label: "Target Text", lines: 4 } },
          { id: 4, type: "checkbox", props: { label: "Use x-vector only", value: false } },
          {
            id: 5,
            type: "dropdown",
            props: { label: "Model Size", choices: ["0.6B", "1.7B"], value: "1.7B" },
          },
          { id: 6, type: "audio", props: { label: "Generated Audio" } },
        ],
        dependencies: [
          {
            api_name: "/generate_voice_clone",
            inputs: [1, 2, 3, 4, 5],
            outputs: [6],
          },
        ],
      },
    });

    const { importModelDraftFromSpace } = await import(
      "@/server/model-catalog/space-importer"
    );
    const result = await importModelDraftFromSpace({
      spaceUrl: "https://huggingface.co/spaces/Qwen/Qwen3-TTS",
      apiName: "/generate_voice_clone",
    });

    expect(result.draft.parameters.inputAudio.binding).toMatchObject({
      parameterName: "ref_audio",
      canonicalKey: "inputAudio",
    });
    expect(result.draft.parameters.prompt.binding).toMatchObject({
      parameterName: "target_text",
      canonicalKey: "prompt",
    });
    expect(result.draft.parameters["hf:use_xvector_only"]).toMatchObject({
      ui: "toggle",
      default: false,
      binding: { parameterName: "use_xvector_only", valueType: "boolean" },
    });
    expect(result.draft.parameters["hf:model_size"]).toMatchObject({
      ui: "select",
      default: "1.7B",
      options: [
        { label: "0.6B", value: "0.6B" },
        { label: "1.7B", value: "1.7B" },
      ],
      binding: { parameterName: "model_size", valueType: "string" },
    });
  });

  it("오디오 생성 endpoint가 여러 개면 run_generation을 우선 선택하고 reference 입력 계약을 반영한다", async () => {
    mockConnect.mockResolvedValue({
      view_api: vi.fn().mockResolvedValue({
        named_endpoints: {
          "/toggle_mode": {
            parameters: [{ parameter_name: "mode", label: "Generation Mode" }],
          },
          "/run_generation": {
            parameters: [
              { parameter_name: "text", label: "Text" },
              { parameter_name: "ref_audio_path", label: "Reference Audio" },
              {
                parameter_name: "ref_text",
                label: "Reference Transcript (for advanced ICL mode)",
              },
            ],
          },
        },
      }),
      config: {
        space_id: "leey00nsu/qwen-3.5-tts-faster-gradio",
        title: "Faster Qwen3 TTS",
        components: [
          { id: 1, type: "textbox", props: { label: "Text", lines: 4 } },
          { id: 2, type: "audio", props: { label: "Reference Audio" } },
          {
            id: 3,
            type: "textbox",
            props: {
              label: "Reference Transcript (for advanced ICL mode)",
              lines: 4,
              required: true,
            },
          },
          { id: 4, type: "audio", props: { label: "Generated Audio" } },
        ],
        dependencies: [
          {
            api_name: "/toggle_mode",
            inputs: [1],
            outputs: [],
          },
          {
            api_name: "/run_generation",
            inputs: [1, 2, 3],
            outputs: [4],
          },
        ],
      },
    });

    const { importModelDraftFromSpace } = await import(
      "@/server/model-catalog/space-importer"
    );

    const result = await importModelDraftFromSpace({
      spaceUrl:
        "https://huggingface.co/spaces/leey00nsu/qwen-3.5-tts-faster-gradio",
    });

    expect(result.resolvedApiName).toBe("/run_generation");
    expect(result.draft.type).toBe("audio");
    expect(result.draft.providerConfig.api_name).toBe("/run_generation");
    expect(result.draft.meta.supports_input_audio).toBe(true);
    expect(result.draft.parameters.voice).toBeUndefined();
    expect(result.draft.parameters.inputAudio).toMatchObject({
      ui: "upload",
    });
    expect(result.draft.parameters.referenceText).toMatchObject({
      required: true,
    });
  });

  it("mode 기반 TTS 입력을 importer가 audio parameter로 보존한다", async () => {
    mockConnect.mockResolvedValue({
      view_api: vi.fn().mockResolvedValue({
        named_endpoints: {
          "/run_generation": {
            parameters: [
              { parameter_name: "text", label: "Text" },
              {
                parameter_name: "language",
                label: "Language",
                parameter_default: "English",
              },
              {
                parameter_name: "mode",
                label: "Generation Mode",
                parameter_default: "voice_clone",
              },
              {
                parameter_name: "stream_mode",
                label: "Streaming",
                parameter_default: true,
              },
              {
                parameter_name: "ref_audio_path",
                label: "Reference Audio",
              },
              {
                parameter_name: "ref_preset",
                label: "Reference Preset",
                parameter_default: "ref_audio_3",
              },
              {
                parameter_name: "ref_text",
                label: "Reference Transcript (for advanced ICL mode)",
              },
              {
                parameter_name: "speaker",
                label: "Speaker",
                parameter_default: "Vivian",
              },
              {
                parameter_name: "custom_instruct",
                label: "Custom Instruction",
              },
              {
                parameter_name: "voice_instruct",
                label: "Voice Instruction",
              },
              {
                parameter_name: "xvec_only",
                label: "xvec only",
                parameter_default: false,
              },
              {
                parameter_name: "chunk_size",
                label: "Chunk Size",
                parameter_default: 120,
              },
              {
                parameter_name: "temperature",
                label: "Temperature",
                parameter_default: 0.7,
              },
              {
                parameter_name: "top_k",
                label: "Top K",
                parameter_default: 20,
              },
              {
                parameter_name: "repetition_penalty",
                label: "Repetition Penalty",
                parameter_default: 1.1,
              },
            ],
          },
        },
      }),
      config: {
        space_id: "leey00nsu/qwen-3.5-tts-faster-gradio",
        title: "Faster Qwen3 TTS",
        components: [
          { id: 1, type: "textbox", props: { label: "Text", lines: 4 } },
          {
            id: 2,
            type: "dropdown",
            props: { label: "Language", choices: ["English", "Korean"], value: "English" },
          },
          {
            id: 3,
            type: "radio",
            props: {
              label: "Generation Mode",
              choices: ["voice_clone", "custom", "voice_design"],
              value: "voice_clone",
            },
          },
          {
            id: 4,
            type: "checkbox",
            props: { label: "Streaming", value: true },
          },
          { id: 5, type: "audio", props: { label: "Reference Audio" } },
          {
            id: 6,
            type: "dropdown",
            props: {
              label: "Reference Preset",
              choices: ["ref_audio_1", "ref_audio_3"],
              value: "ref_audio_3",
            },
          },
          {
            id: 7,
            type: "textbox",
            props: {
              label: "Reference Transcript (for advanced ICL mode)",
              lines: 4,
              required: true,
            },
          },
          {
            id: 8,
            type: "dropdown",
            props: {
              label: "Speaker",
              choices: ["Vivian", "Serena"],
              value: "Vivian",
            },
          },
          {
            id: 9,
            type: "textbox",
            props: { label: "Custom Instruction", lines: 4 },
          },
          {
            id: 10,
            type: "textbox",
            props: { label: "Voice Instruction", lines: 4 },
          },
          {
            id: 11,
            type: "checkbox",
            props: { label: "xvec only", value: false },
          },
          {
            id: 12,
            type: "slider",
            props: { label: "Chunk Size", minimum: 40, maximum: 200, step: 10, value: 120 },
          },
          {
            id: 13,
            type: "slider",
            props: { label: "Temperature", minimum: 0.1, maximum: 1.2, step: 0.1, value: 0.7 },
          },
          {
            id: 14,
            type: "slider",
            props: { label: "Top K", minimum: 1, maximum: 100, step: 1, value: 20 },
          },
          {
            id: 15,
            type: "slider",
            props: {
              label: "Repetition Penalty",
              minimum: 1,
              maximum: 2,
              step: 0.1,
              value: 1.1,
            },
          },
          { id: 16, type: "audio", props: { label: "Generated Audio" } },
        ],
        dependencies: [
          {
            api_name: "/run_generation",
            inputs: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15],
            outputs: [16],
          },
        ],
      },
    });

    const { importModelDraftFromSpace } = await import(
      "@/server/model-catalog/space-importer"
    );

    const result = await importModelDraftFromSpace({
      spaceUrl:
        "https://huggingface.co/spaces/leey00nsu/qwen-3.5-tts-faster-gradio",
    });

    expect(result.draft.parameters.modeChoice).toMatchObject({
      ui: "select",
      default: "voice_clone",
      options: [
        { label: "voice_clone", value: "voice_clone" },
        { label: "custom", value: "custom" },
        { label: "voice_design", value: "voice_design" },
      ],
    });
    expect(result.draft.parameters.language).toMatchObject({
      ui: "select",
      default: "English",
      options: [
        { label: "English", value: "English" },
        { label: "Korean", value: "Korean" },
      ],
    });
    expect(result.draft.parameters.speaker).toMatchObject({
      ui: "select",
      default: "Vivian",
      options: [
        { label: "Vivian", value: "Vivian" },
        { label: "Serena", value: "Serena" },
      ],
    });
    expect(result.draft.parameters.voice).toBeUndefined();
    expect(result.draft.parameters.streamMode).toMatchObject({
      ui: "toggle",
      default: true,
    });
    expect(result.draft.parameters.referencePreset).toMatchObject({
      ui: "select",
      default: "ref_audio_3",
    });
    expect(result.draft.parameters.customInstruction).toMatchObject({
      ui: "textarea",
    });
    expect(result.draft.parameters.voiceInstruction).toMatchObject({
      ui: "textarea",
    });
    expect(result.draft.parameters.xvecOnly).toMatchObject({
      ui: "toggle",
      default: false,
    });
    expect(result.draft.parameters.chunkSize).toMatchObject({
      ui: "range",
      default: 120,
    });
    expect(result.draft.parameters.temperature).toMatchObject({
      ui: "range",
      default: 0.7,
    });
    expect(result.draft.parameters.topK).toMatchObject({
      ui: "range",
      default: 20,
    });
    expect(result.draft.parameters.repetitionPenalty).toMatchObject({
      ui: "range",
      default: 1.1,
    });
  });

  it("명시한 apiName이 없으면 UNKNOWN_REQUESTED_API_NAME warning을 남기고 점수 기반 fallback을 사용한다", async () => {
    mockConnect.mockResolvedValue({
      view_api: vi.fn().mockResolvedValue({
        named_endpoints: {
          "/toggle_mode": {
            parameters: [{ parameter_name: "mode", label: "Generation Mode" }],
          },
          "/run_generation": {
            parameters: [
              { parameter_name: "text", label: "Text" },
              { parameter_name: "ref_audio_path", label: "Reference Audio" },
            ],
          },
        },
      }),
      config: {
        space_id: "leey00nsu/qwen-3.5-tts-faster-gradio",
        title: "Faster Qwen3 TTS",
        components: [
          { id: 1, type: "textbox", props: { label: "Text", lines: 4 } },
          { id: 2, type: "audio", props: { label: "Reference Audio" } },
          { id: 3, type: "audio", props: { label: "Generated Audio" } },
        ],
        dependencies: [
          {
            api_name: "/toggle_mode",
            inputs: [1],
            outputs: [],
          },
          {
            api_name: "/run_generation",
            inputs: [1, 2],
            outputs: [3],
          },
        ],
      },
    });

    const { importModelDraftFromSpace } = await import(
      "@/server/model-catalog/space-importer"
    );

    const result = await importModelDraftFromSpace({
      spaceUrl:
        "https://huggingface.co/spaces/leey00nsu/qwen-3.5-tts-faster-gradio",
      apiName: "/missing_endpoint",
    });

    expect(result.resolvedApiName).toBe("/run_generation");
    expect(result.warnings).toContain(
      "UNKNOWN_REQUESTED_API_NAME:/missing_endpoint",
    );
  });
});
