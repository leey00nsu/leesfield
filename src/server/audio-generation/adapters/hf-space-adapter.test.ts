import { beforeEach, describe, expect, it, vi } from "vitest";

const mockConnect = vi.hoisted(() => vi.fn());
const mockGetModelCatalog = vi.hoisted(() => vi.fn());
const mockHandleFile = vi.hoisted(() => vi.fn((value) => ({ mockedFile: value })));

vi.mock("@gradio/client", () => ({
  Client: {
    connect: mockConnect,
  },
  handle_file: mockHandleFile,
}));

vi.mock("@/server/model-catalog/catalog-service", () => ({
  getModelCatalog: mockGetModelCatalog,
}));

describe("hfSpaceAudioAdapter", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("HF Space 응답의 파일 경로를 data URL 결과로 정규화한다", async () => {
    mockGetModelCatalog.mockResolvedValue([
      {
        id: "audio-model-1",
        type: "audio",
        key: "qwen-tts",
        label: "Qwen TTS",
        vendor: "HUGGINGFACE",
        provider: "hf_space",
        providerConfig: {
          space_id: "leey00nsu/qwen-3.5-tts-faster-gradio",
          api_name: "/generate_audio",
          timeout_ms: 120000,
        },
        parameters: {
          prompt: { ui: "textarea", required: true },
          voice: { ui: "input", default: "default" },
          speed: { ui: "range", min: 0.25, max: 4, step: 0.05, default: 1 },
        },
        meta: {
          model_id: "leey00nsu/qwen-3.5-tts-faster-gradio",
          default_speed: 1,
          concurrent_limit: 1,
          supports_input_audio: false,
        },
        isActive: true,
        isDefault: true,
      },
    ]);

    mockConnect.mockResolvedValue({
      view_api: vi.fn().mockResolvedValue({
        named_endpoints: {
          "/generate_audio": {
            parameters: [
              { parameter_name: "prompt", label: "Prompt" },
              { parameter_name: "voice", label: "Voice" },
              { parameter_name: "speed", label: "Speed" },
              { parameter_name: "seed", label: "Seed" },
            ],
          },
        },
      }),
      predict: vi.fn().mockResolvedValue({
        data: [
          {
            audio: {
              path: "/file=/tmp/generated.wav",
              duration_sec: 3.2,
            },
          },
        ],
      }),
    });

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ stage: "RUNNING" }),
      })
      .mockResolvedValueOnce({
        ok: true,
        headers: new Headers({ "content-type": "audio/wav" }),
        arrayBuffer: async () =>
          Uint8Array.from([82, 73, 70, 70]).buffer,
      });
    vi.stubGlobal("fetch", fetchMock);

    const { hfSpaceAudioAdapter } = await import(
      "@/server/audio-generation/adapters/hf-space-adapter"
    );

    const result = await hfSpaceAudioAdapter.generate({
      prompt: "hello",
      model: "qwen-tts",
      voice: "alloy",
      speed: 1.25,
      seed: "42",
    });

    expect(mockConnect).toHaveBeenCalledWith(
      "leey00nsu/qwen-3.5-tts-faster-gradio",
      { token: undefined },
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "https://huggingface.co/api/spaces/leey00nsu/qwen-3.5-tts-faster-gradio",
      expect.objectContaining({})
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "https://leey00nsu-qwen-3.5-tts-faster-gradio.hf.space/gradio_api/file=/tmp/generated.wav",
      expect.objectContaining({})
    );
    expect(result).toEqual({
      audios: ["data:audio/wav;base64,UklGRg=="],
      meta: { duration_sec: 3.2 },
    });
  });

  it("quota/sleep 오류를 사용자 친화적으로 매핑한다", async () => {
    const { hfSpaceAudioAdapter } = await import(
      "@/server/audio-generation/adapters/hf-space-adapter"
    );

    expect(hfSpaceAudioAdapter.mapError?.(new Error("ZeroGPU quota exceeded"))).toBe(
      "ZeroGPU 일일 쿼터를 초과했습니다. 내일 다시 시도하거나 다른 제공자를 사용해주세요."
    );
    expect(hfSpaceAudioAdapter.mapError?.(new Error("Space is sleeping"))).toBe(
      "HF Space가 준비 중입니다. 잠시 후 다시 시도해주세요."
    );
    expect(hfSpaceAudioAdapter.mapError?.(new Error("HF_SPACE_RESPONSE_INVALID"))).toBe(
      "HF Space 응답에서 오디오 결과를 찾지 못했습니다."
    );
    expect(
      hfSpaceAudioAdapter.mapError?.({
        title: "ZeroGPU quota exceeded",
        message:
          "You have exceeded your GPU quota (120s requested vs. 100s left).",
      }),
    ).toBe(
      "ZeroGPU 일일 쿼터를 초과했습니다. 내일 다시 시도하거나 다른 제공자를 사용해주세요."
    );
    expect(hfSpaceAudioAdapter.mapError?.(new TypeError("fetch failed"))).toBe(
      "HF Space 통신 중 네트워크 오류가 발생했습니다. 잠시 후 다시 시도해주세요."
    );
  });

  it("reference audio와 reference text를 run_generation payload로 전달한다", async () => {
    const predict = vi.fn().mockResolvedValue({
      data: [
        "ok",
        {
          path: "/file=/tmp/generated.wav",
        },
      ],
    });

    mockGetModelCatalog.mockResolvedValue([
      {
        id: "audio-model-1",
        type: "audio",
        key: "qwen-tts-clone",
        label: "Qwen TTS Clone",
        vendor: "HUGGINGFACE",
        provider: "hf_space",
        providerConfig: {
          space_id: "leey00nsu/qwen-3.5-tts-faster-gradio",
          api_name: "/run_generation",
          timeout_ms: 120000,
        },
        parameters: {
          prompt: { ui: "textarea", required: true },
          inputAudio: { ui: "upload", required: true },
          referenceText: { ui: "textarea", required: true },
          voice: { ui: "input", default: "Vivian" },
          speed: { ui: "range", min: 0.25, max: 4, step: 0.05, default: 1 },
        },
        meta: {
          model_id: "leey00nsu/qwen-3.5-tts-faster-gradio",
          default_speed: 1,
          concurrent_limit: 1,
          supports_input_audio: true,
        },
        isActive: true,
        isDefault: true,
      },
    ]);

    mockConnect.mockResolvedValue({
      view_api: vi.fn().mockResolvedValue({
        named_endpoints: {
          "/run_generation": {
            parameters: [
              { parameter_name: "model_id", label: "Model", parameter_default: "Qwen/Qwen3-TTS-12Hz-1.7B-Base" },
              { parameter_name: "text", label: "Text" },
              { parameter_name: "language", label: "Language", parameter_default: "English" },
              { parameter_name: "mode", label: "Generation Mode", parameter_default: "voice_clone" },
              { parameter_name: "stream_mode", label: "Streaming", parameter_default: true },
              { parameter_name: "ref_audio_path", label: "Reference Audio" },
              { parameter_name: "ref_preset", label: "Reference Preset", parameter_default: "ref_audio_3" },
              { parameter_name: "ref_text", label: "Reference Transcript (for advanced ICL mode)" },
            ],
          },
        },
      }),
      predict,
    });

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ stage: "RUNNING" }),
      })
      .mockResolvedValueOnce({
        ok: true,
        headers: new Headers({ "content-type": "audio/wav" }),
        arrayBuffer: async () => Uint8Array.from([82, 73, 70, 70]).buffer,
      });
    vi.stubGlobal("fetch", fetchMock);

    const { hfSpaceAudioAdapter } = await import(
      "@/server/audio-generation/adapters/hf-space-adapter"
    );

    await hfSpaceAudioAdapter.generate({
      prompt: "hello clone",
      model: "qwen-tts-clone",
      voice: "Vivian",
      speed: 1,
      seed: "",
      inputAudio: "data:audio/wav;base64,UklGRg==",
      referenceText: "reference words",
    });

    expect(predict).toHaveBeenCalledWith(
      "/run_generation",
      expect.objectContaining({
        text: "hello clone",
        ref_text: "reference words",
        ref_audio_path: expect.anything(),
      }),
    );
    expect(mockHandleFile).toHaveBeenCalledTimes(1);
  });

  it("mode 기반 TTS 파라미터를 run_generation payload로 전달하고 speaker 기본값을 사용한다", async () => {
    const predict = vi.fn().mockResolvedValue({
      data: [
        "ok",
        {
          path: "/file=/tmp/generated.wav",
        },
      ],
    });

    mockGetModelCatalog.mockResolvedValue([
      {
        id: "audio-model-1",
        type: "audio",
        key: "qwen-tts-mode",
        label: "Qwen TTS Mode",
        vendor: "HUGGINGFACE",
        provider: "hf_space",
        providerConfig: {
          space_id: "leey00nsu/qwen-3.5-tts-faster-gradio",
          api_name: "/run_generation",
          timeout_ms: 120000,
        },
        parameters: {
          prompt: { ui: "textarea", required: true },
          modeChoice: {
            ui: "select",
            default: "voice_clone",
            options: ["voice_clone", "custom", "voice_design"],
          },
          language: {
            ui: "select",
            default: "English",
            options: ["English", "Korean"],
          },
          speaker: {
            ui: "select",
            default: "Vivian",
            options: ["Vivian", "Serena"],
          },
          streamMode: { ui: "toggle", default: true },
          inputAudio: { ui: "upload" },
          referenceText: { ui: "textarea" },
          referencePreset: {
            ui: "select",
            default: "ref_audio_3",
            options: ["ref_audio_1", "ref_audio_3"],
          },
          xvecOnly: { ui: "toggle", default: false },
          chunkSize: { ui: "range", default: 120, min: 40, max: 200, step: 10 },
          temperature: { ui: "range", default: 0.7, min: 0.1, max: 1.2, step: 0.1 },
          topK: { ui: "range", default: 20, min: 1, max: 100, step: 1 },
          repetitionPenalty: {
            ui: "range",
            default: 1.1,
            min: 1,
            max: 2,
            step: 0.1,
          },
          voiceInstruction: { ui: "textarea" },
          customInstruction: { ui: "textarea" },
          seed: { ui: "input" },
        },
        meta: {
          model_id: "leey00nsu/qwen-3.5-tts-faster-gradio",
          default_speed: 1,
          concurrent_limit: 1,
          supports_input_audio: true,
        },
        isActive: true,
        isDefault: true,
      },
    ]);

    mockConnect.mockResolvedValue({
      view_api: vi.fn().mockResolvedValue({
        named_endpoints: {
          "/run_generation": {
            parameters: [
              { parameter_name: "text", label: "Text" },
              { parameter_name: "language", label: "Language", parameter_default: "English" },
              { parameter_name: "mode", label: "Generation Mode", parameter_default: "voice_clone" },
              { parameter_name: "stream_mode", label: "Streaming", parameter_default: true },
              { parameter_name: "ref_audio_path", label: "Reference Audio" },
              { parameter_name: "ref_text", label: "Reference Transcript (for advanced ICL mode)" },
              { parameter_name: "speaker", label: "Speaker", parameter_default: "Vivian" },
              { parameter_name: "ref_preset", label: "Reference Preset", parameter_default: "ref_audio_3" },
              { parameter_name: "xvec_only", label: "xvec only", parameter_default: false },
              { parameter_name: "chunk_size", label: "Chunk Size", parameter_default: 120 },
              { parameter_name: "temperature", label: "Temperature", parameter_default: 0.7 },
              { parameter_name: "top_k", label: "Top K", parameter_default: 20 },
              { parameter_name: "repetition_penalty", label: "Repetition Penalty", parameter_default: 1.1 },
            ],
          },
        },
      }),
      predict,
    });

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ stage: "RUNNING" }),
      })
      .mockResolvedValueOnce({
        ok: true,
        headers: new Headers({ "content-type": "audio/wav" }),
        arrayBuffer: async () => Uint8Array.from([82, 73, 70, 70]).buffer,
      });
    vi.stubGlobal("fetch", fetchMock);

    const { hfSpaceAudioAdapter } = await import(
      "@/server/audio-generation/adapters/hf-space-adapter"
    );

    const payload = {
      prompt: "hello clone",
      model: "qwen-tts-mode",
      voice: "",
      speed: 1,
      seed: "11",
      inputAudio: "data:audio/wav;base64,UklGRg==",
      referenceText: "reference words",
      modeChoice: "voice_clone",
      language: "English",
      speaker: "",
      streamMode: true,
      referencePreset: "ref_audio_3",
      xvecOnly: false,
      chunkSize: 120,
      temperature: 0.7,
      topK: 20,
      repetitionPenalty: 1.1,
    };

    await hfSpaceAudioAdapter.generate(payload);

    expect(predict).toHaveBeenCalledWith(
      "/run_generation",
      expect.objectContaining({
        text: "hello clone",
        language: "English",
        mode: "voice_clone",
        stream_mode: true,
        ref_audio_path: expect.anything(),
        ref_text: "reference words",
        speaker: "Vivian",
        ref_preset: "ref_audio_3",
        xvec_only: false,
        chunk_size: 120,
        temperature: 0.7,
        top_k: 20,
        repetition_penalty: 1.1,
      }),
    );
  });
});
