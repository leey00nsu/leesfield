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

    const predict = vi.fn().mockResolvedValue({
      data: [
        {
          audio: {
            path: "/file=/tmp/generated.wav",
            duration_sec: 3.2,
          },
        },
      ],
    });

    const viewApi = vi.fn().mockResolvedValue({
      named_endpoints: {
        "/generate_audio": {
          parameters: [
            { parameter_name: "prompt", label: "Prompt" },
            { parameter_name: "voice", label: "Voice" },
            { parameter_name: "speed", label: "Speed" },
            { parameter_name: "seed", label: "Seed" },
            { parameter_name: "", label: "State" },
            {
              parameter_name: "internal_state",
              label: "Internal State",
              hidden: true,
              component: "state",
            },
          ],
        },
      },
    });

    mockConnect.mockResolvedValue({
      view_api: viewApi,
      predict,
      config: {
        components: [
          { id: 1, type: "textbox" },
          { id: 2, type: "audio" },
        ],
        dependencies: [
          { api_name: "/toggle_mode", outputs: [] },
          { api_name: "/voice_clone", outputs: [2] },
          { api_name: "/predict", outputs: [] },
        ],
      },
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

    const expectedToken =
      process.env.HF_TOKEN?.trim() ||
      process.env.HUGGINGFACEHUB_API_TOKEN?.trim() ||
      undefined;

    expect(mockConnect).toHaveBeenCalledWith(
      "leey00nsu/qwen-3.5-tts-faster-gradio",
      { token: expectedToken },
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
    expect(predict).toHaveBeenCalledWith("/generate_audio", {
      prompt: "hello",
      voice: "alloy",
      speed: 1.25,
      seed: 42,
    });
    expect(viewApi).toHaveBeenCalledTimes(1);
    expect(result).toEqual({
      audios: ["data:audio/wav;base64,UklGRg=="],
      meta: { duration_sec: 3.2 },
    });
  });

  it("generic binding을 원래 parameter_name과 Gradio file 값으로 복원한다", async () => {
    mockGetModelCatalog.mockResolvedValue([
      {
        id: "audio-dynamic-1",
        type: "audio",
        key: "qwen-dynamic-clone",
        label: "Qwen Dynamic Clone",
        vendor: "HUGGINGFACE",
        provider: "hf_space",
        providerConfig: {
          space_id: "Qwen/Qwen3-TTS-dynamic-test",
          api_name: "/generate_voice_clone",
          timeout_ms: 120000,
        },
        parameters: {
          prompt: { ui: "textarea", required: true },
          "hf:model_size": {
            ui: "select",
            binding: {
              source: "hf_space",
              parameterName: "model_size",
              valueType: "string",
              order: 1,
            },
          },
          "hf:reference_sample": {
            ui: "upload",
            required: true,
            binding: {
              source: "hf_space",
              parameterName: "reference_sample",
              valueType: "file",
              order: 2,
            },
          },
        },
        meta: {
          model_id: "Qwen/Qwen3-TTS-dynamic-test",
          default_speed: 1,
          concurrent_limit: 1,
          supports_input_audio: true,
        },
        isActive: true,
        isDefault: true,
      },
    ]);

    const predict = vi.fn().mockResolvedValue({
      data: [{ path: "/file=/tmp/generated.wav" }],
    });
    mockConnect.mockResolvedValue({
      view_api: vi.fn().mockResolvedValue({
        named_endpoints: {
          "/generate_voice_clone": {
            parameters: [
              { parameter_name: "target_text", label: "Target Text" },
              { parameter_name: "model_size", label: "Model Size" },
              {
                parameter_name: "reference_sample",
                label: "Reference Sample",
              },
            ],
          },
        },
      }),
      predict,
      config: {
        components: [{ id: 1, type: "audio" }],
        dependencies: [
          { api_name: "/generate_voice_clone", outputs: [1] },
        ],
      },
    });

    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ stage: "RUNNING" }),
        })
        .mockResolvedValueOnce({
          ok: true,
          headers: new Headers({ "content-type": "audio/wav" }),
          arrayBuffer: async () => Uint8Array.from([82, 73, 70, 70]).buffer,
        }),
    );

    const { hfSpaceAudioAdapter } = await import(
      "@/server/audio-generation/adapters/hf-space-adapter"
    );

    await hfSpaceAudioAdapter.generate({
      prompt: "hello dynamic",
      model: "qwen-dynamic-clone",
      speed: 1,
      dynamicParams: {
        "hf:model_size": "1.7B",
        "hf:reference_sample": "data:audio/wav;base64,UklGRg==",
      },
    });

    expect(predict).toHaveBeenCalledWith("/generate_voice_clone", {
      target_text: "hello dynamic",
      model_size: "1.7B",
      reference_sample: expect.objectContaining({ mockedFile: expect.any(Blob) }),
    });
  });

  it("저장된 generic binding이 endpoint에서 사라지면 parameter drift로 진단한다", async () => {
    mockGetModelCatalog.mockResolvedValue([
      {
        id: "audio-drift-1",
        type: "audio",
        key: "qwen-dynamic-drift",
        label: "Qwen Dynamic Drift",
        vendor: "HUGGINGFACE",
        provider: "hf_space",
        providerConfig: {
          space_id: "Qwen/Qwen3-TTS-drift-test",
          api_name: "/generate_voice_clone",
        },
        parameters: {
          "hf:model_size": {
            ui: "select",
            binding: {
              source: "hf_space",
              parameterName: "model_size",
              valueType: "string",
              order: 1,
            },
          },
        },
        meta: { default_speed: 1 },
        isActive: true,
        isDefault: true,
      },
    ]);
    const predict = vi.fn();
    mockConnect.mockResolvedValue({
      view_api: vi.fn().mockResolvedValue({
        named_endpoints: {
          "/generate_voice_clone": {
            parameters: [{ parameter_name: "target_text", label: "Text" }],
          },
        },
      }),
      predict,
      config: {
        components: [],
        dependencies: [{ api_name: "/generate_voice_clone", outputs: [] }],
      },
    });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ stage: "RUNNING" }),
      }),
    );

    const { hfSpaceAudioAdapter } = await import(
      "@/server/audio-generation/adapters/hf-space-adapter"
    );

    await expect(
      hfSpaceAudioAdapter.generate({
        prompt: "hello",
        model: "qwen-dynamic-drift",
        speed: 1,
        dynamicParams: { "hf:model_size": "1.7B" },
      }),
    ).rejects.toThrow("HF_SPACE_PARAMETER_INVALID");
    expect(predict).not.toHaveBeenCalled();
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

  it("동일 asset의 여러 file reference 중 하나만 성공해도 생성 성공으로 처리한다", async () => {
    mockGetModelCatalog.mockResolvedValue([
      {
        id: "audio-model-1",
        type: "audio",
        key: "qwen-tts-mixed-refs",
        label: "Qwen TTS Mixed Refs",
        vendor: "HUGGINGFACE",
        provider: "hf_space",
        providerConfig: {
          space_id: "leey00nsu/qwen-3.5-tts-faster-gradio",
          api_name: "/run_generation",
          timeout_ms: 120000,
        },
        parameters: {
          prompt: { ui: "textarea", required: true },
          speaker: {
            ui: "select",
            default: "Vivian",
            options: ["Vivian"],
          },
        },
        meta: {
          model_id: "leey00nsu/qwen-3.5-tts-faster-gradio",
          concurrent_limit: 1,
        },
        isActive: true,
        isDefault: true,
      },
    ]);

    mockConnect.mockResolvedValue({
      view_api: vi.fn().mockResolvedValue({
        named_endpoints: {
          "/run_generation": {
            parameters: [{ parameter_name: "text", label: "Text" }],
          },
        },
      }),
      predict: vi.fn().mockResolvedValue({
        data: [
          {
            audio: {
              url: "https://leey00nsu-qwen-3-5-tts-faster-gradio.hf.space/gradio_api/file=/tmp/gradio/job-1/audio.wav",
              path: "/tmp/gradio/job-1/audio.wav",
              name: "audio.wav",
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
        headers: new Headers({ "content-type": "application/octet-stream" }),
        arrayBuffer: async () => Uint8Array.from([82, 73, 70, 70]).buffer,
      });
    vi.stubGlobal("fetch", fetchMock);

    const { hfSpaceAudioAdapter } = await import(
      "@/server/audio-generation/adapters/hf-space-adapter"
    );

    const result = await hfSpaceAudioAdapter.generate({
      prompt: "hello",
      model: "qwen-tts-mixed-refs",
      speed: 1,
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock).toHaveBeenLastCalledWith(
      "https://leey00nsu-qwen-3-5-tts-faster-gradio.hf.space/gradio_api/file=/tmp/gradio/job-1/audio.wav",
      expect.objectContaining({}),
    );
    expect(result).toEqual({
      audios: ["data:audio/wav;base64,UklGRg=="],
      meta: { duration_sec: undefined },
    });
  });

  it("stale api_name을 retryable endpoint/parameter 오류를 거쳐 실제 생성 endpoint로 fallback한다", async () => {
    const predict = vi
      .fn()
      .mockRejectedValueOnce(new Error("api_name /toggle_mode not found"))
      .mockRejectedValueOnce(
        new Error("unexpected keyword argument 'ref_audio_path'"),
      )
      .mockResolvedValueOnce({
        data: [
          {
            audio: {
              path: "/file=/tmp/generated.wav",
              duration_sec: 4.1,
            },
          },
        ],
      });

    mockGetModelCatalog.mockResolvedValue([
      {
        id: "audio-model-1",
        type: "audio",
        key: "qwen-tts-stale",
        label: "Qwen TTS Stale",
        vendor: "HUGGINGFACE",
        provider: "hf_space",
        providerConfig: {
          space_id: "leey00nsu/qwen-3.5-tts-faster-gradio",
          api_name: "/toggle_mode",
          timeout_ms: 120000,
        },
        parameters: {
          prompt: { ui: "textarea", required: true },
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

    const viewApi = vi.fn().mockResolvedValue({
      named_endpoints: {
        "/toggle_mode": {
          parameters: [{ parameter_name: "mode", label: "Mode" }],
        },
        "/voice_clone": {
          parameters: [
            { parameter_name: "text", label: "Text" },
            { parameter_name: "ref_audio_path", label: "Reference Audio" },
          ],
        },
        "/predict": {
          parameters: [{ parameter_name: "prompt", label: "Prompt" }],
        },
      },
    });

    mockConnect.mockResolvedValue({
      view_api: viewApi,
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

    const result = await hfSpaceAudioAdapter.generate({
      prompt: "hello",
      model: "qwen-tts-stale",
      speed: 1,
    });

    expect(predict).toHaveBeenNthCalledWith(1, "/toggle_mode", expect.any(Object));
    expect(predict).toHaveBeenNthCalledWith(2, "/voice_clone", expect.any(Object));
    expect(predict).toHaveBeenNthCalledWith(3, "/predict", expect.any(Object));
    expect(viewApi).toHaveBeenCalledTimes(1);
    expect(result).toEqual({
      audios: ["data:audio/wav;base64,UklGRg=="],
      meta: { duration_sec: 4.1 },
    });
  });

  it("빈 dependency api_name은 output scoring에 반영하지 않고 명시된 audio endpoint를 우선 선택한다", async () => {
    const predict = vi.fn().mockResolvedValue({
      data: [
        {
          audio: {
            path: "/file=/tmp/generated.wav",
            duration_sec: 1.9,
          },
        },
      ],
    });

    mockGetModelCatalog.mockResolvedValue([
      {
        id: "audio-model-1",
        type: "audio",
        key: "qwen-tts-missing-dependency-api-name",
        label: "Qwen TTS Missing Dependency API Name",
        vendor: "HUGGINGFACE",
        provider: "hf_space",
        providerConfig: {
          space_id: "leey00nsu/qwen-3.5-tts-faster-gradio",
          api_name: "/stale_endpoint",
          timeout_ms: 120000,
        },
        parameters: {
          prompt: { ui: "textarea", required: true },
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

    const viewApi = vi.fn().mockResolvedValue({
      named_endpoints: {
        "/generate_audio": {
          parameters: [{ parameter_name: "text", label: "Text" }],
        },
        "/run_generation": {
          parameters: [{ parameter_name: "text", label: "Text" }],
        },
      },
    });

    mockConnect.mockResolvedValue({
      view_api: viewApi,
      predict,
      config: {
        components: [{ id: 1, type: "audio" }],
        dependencies: [
          { api_name: "", outputs: [1] },
          { api_name: "/run_generation", outputs: [1] },
        ],
      },
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

    const result = await hfSpaceAudioAdapter.generate({
      prompt: "hello",
      model: "qwen-tts-missing-dependency-api-name",
      speed: 1,
    });

    expect(predict).toHaveBeenCalledTimes(1);
    expect(predict).toHaveBeenNthCalledWith(1, "/run_generation", expect.any(Object));
    expect(result).toEqual({
      audios: ["data:audio/wav;base64,UklGRg=="],
      meta: { duration_sec: 1.9 },
    });
  });

  it("parameter_name이 비어 있어도 label이 있으면 payload key fallback으로 유지한다", async () => {
    const predict = vi.fn().mockResolvedValue({
      data: [
        {
          audio: {
            path: "/file=/tmp/generated.wav",
            duration_sec: 1.1,
          },
        },
      ],
    });

    mockGetModelCatalog.mockResolvedValue([
      {
        id: "audio-model-1",
        type: "audio",
        key: "qwen-tts-label-fallback",
        label: "Qwen TTS Label Fallback",
        vendor: "HUGGINGFACE",
        provider: "hf_space",
        providerConfig: {
          space_id: "leey00nsu/qwen-3.5-tts-faster-gradio",
          api_name: "/run_generation",
          timeout_ms: 120000,
        },
        parameters: {
          prompt: { ui: "textarea", required: true },
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
          "/run_generation": {
            parameters: [
              { parameter_name: "", label: "Text" },
              { parameter_name: "", label: "State", hidden: true, component: "state" },
            ],
          },
        },
      }),
      predict,
      config: {
        components: [{ id: 1, type: "audio" }],
        dependencies: [{ api_name: "/run_generation", outputs: [1] }],
      },
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
      prompt: "hello",
      model: "qwen-tts-label-fallback",
      speed: 1,
    });

    expect(predict).toHaveBeenCalledWith("/run_generation", { Text: "hello" });
  });

  it("Python positional argument TypeError도 retryable parameter 오류로 분류해 다음 endpoint로 fallback한다", async () => {
    const predict = vi
      .fn()
      .mockRejectedValueOnce(
        new Error("TypeError: predict() takes 2 positional arguments but 3 were given"),
      )
      .mockResolvedValueOnce({
        data: [
          {
            audio: {
              path: "/file=/tmp/generated.wav",
              duration_sec: 2.7,
            },
          },
        ],
      });

    mockGetModelCatalog.mockResolvedValue([
      {
        id: "audio-model-1",
        type: "audio",
        key: "qwen-tts-positional-error",
        label: "Qwen TTS Positional Error",
        vendor: "HUGGINGFACE",
        provider: "hf_space",
        providerConfig: {
          space_id: "leey00nsu/qwen-3.5-tts-faster-gradio",
          api_name: "/voice_clone",
          timeout_ms: 120000,
        },
        parameters: {
          prompt: { ui: "textarea", required: true },
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

    const viewApi = vi.fn().mockResolvedValue({
      named_endpoints: {
        "/voice_clone": {
          parameters: [
            { parameter_name: "text", label: "Text" },
            { parameter_name: "ref_audio_path", label: "Reference Audio" },
          ],
        },
        "/predict": {
          parameters: [{ parameter_name: "prompt", label: "Prompt" }],
        },
      },
    });

    mockConnect.mockResolvedValue({
      view_api: viewApi,
      predict,
      config: {
        components: [],
        dependencies: [{ api_name: "/predict", outputs: [1] }],
      },
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

    const result = await hfSpaceAudioAdapter.generate({
      prompt: "hello",
      model: "qwen-tts-positional-error",
      speed: 1,
    });

    expect(predict).toHaveBeenNthCalledWith(1, "/voice_clone", expect.any(Object));
    expect(predict).toHaveBeenNthCalledWith(2, "/predict", expect.any(Object));
    expect(viewApi).toHaveBeenCalledTimes(1);
    expect(result).toEqual({
      audios: ["data:audio/wav;base64,UklGRg=="],
      meta: { duration_sec: 2.7 },
    });
  });

  it("마지막 후보가 response invalid여도 더 구체적인 retryable 오류를 우선 보존한다", async () => {
    const predict = vi
      .fn()
      .mockRejectedValueOnce(new Error("unexpected keyword argument 'voice'"))
      .mockResolvedValueOnce({
        data: [{ text: "no audio here" }],
      });

    mockGetModelCatalog.mockResolvedValue([
      {
        id: "audio-model-1",
        type: "audio",
        key: "qwen-tts-error-specificity",
        label: "Qwen TTS Error Specificity",
        vendor: "HUGGINGFACE",
        provider: "hf_space",
        providerConfig: {
          space_id: "leey00nsu/qwen-3.5-tts-faster-gradio",
          api_name: "/voice_clone",
          timeout_ms: 120000,
        },
        parameters: {
          prompt: { ui: "textarea", required: true },
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
          "/voice_clone": {
            parameters: [{ parameter_name: "text", label: "Text" }],
          },
          "/predict": {
            parameters: [{ parameter_name: "prompt", label: "Prompt" }],
          },
        },
      }),
      predict,
      config: {
        components: [{ id: 1, type: "audio" }],
        dependencies: [{ api_name: "/predict", outputs: [1] }],
      },
    });

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ stage: "RUNNING" }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const { hfSpaceAudioAdapter } = await import(
      "@/server/audio-generation/adapters/hf-space-adapter"
    );

    await expect(
      hfSpaceAudioAdapter.generate({
        prompt: "hello",
        model: "qwen-tts-error-specificity",
        speed: 1,
      }),
    ).rejects.toThrow("HF_SPACE_PARAMETER_INVALID");
  });

  it("generic function 오류는 endpoint invalid로 오인하지 않고 원래 오류를 유지한다", async () => {
    const predict = vi
      .fn()
      .mockRejectedValueOnce(new Error("function execution failed during inference"))
      .mockResolvedValueOnce({
        data: [
          {
            audio: {
              path: "/file=/tmp/generated.wav",
              duration_sec: 2.2,
            },
          },
        ],
      });

    mockGetModelCatalog.mockResolvedValue([
      {
        id: "audio-model-1",
        type: "audio",
        key: "qwen-tts-generic-function-error",
        label: "Qwen TTS Generic Function Error",
        vendor: "HUGGINGFACE",
        provider: "hf_space",
        providerConfig: {
          space_id: "leey00nsu/qwen-3.5-tts-faster-gradio",
          api_name: "/voice_clone",
          timeout_ms: 120000,
        },
        parameters: {
          prompt: { ui: "textarea", required: true },
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
          "/voice_clone": {
            parameters: [{ parameter_name: "text", label: "Text" }],
          },
          "/predict": {
            parameters: [{ parameter_name: "prompt", label: "Prompt" }],
          },
        },
      }),
      predict,
      config: {
        components: [{ id: 1, type: "audio" }],
        dependencies: [{ api_name: "/predict", outputs: [1] }],
      },
    });

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ stage: "RUNNING" }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const { hfSpaceAudioAdapter } = await import(
      "@/server/audio-generation/adapters/hf-space-adapter"
    );

    await expect(
      hfSpaceAudioAdapter.generate({
        prompt: "hello",
        model: "qwen-tts-generic-function-error",
        speed: 1,
      }),
    ).rejects.toThrow("function execution failed during inference");

    expect(predict).toHaveBeenCalledTimes(1);
    expect(predict).toHaveBeenNthCalledWith(1, "/voice_clone", expect.any(Object));
  });

  it("view_api 조회가 실패해도 저장된 api_name으로 기존 payload fallback을 유지한다", async () => {
    const predict = vi.fn().mockResolvedValue({
      data: [
        {
          audio: {
            path: "/file=/tmp/generated.wav",
            duration_sec: 2.4,
          },
        },
      ],
    });

    mockGetModelCatalog.mockResolvedValue([
      {
        id: "audio-model-1",
        type: "audio",
        key: "qwen-tts-view-api-down",
        label: "Qwen TTS View API Down",
        vendor: "HUGGINGFACE",
        provider: "hf_space",
        providerConfig: {
          space_id: "leey00nsu/qwen-3.5-tts-faster-gradio",
          api_name: "/generate_audio",
          timeout_ms: 120000,
        },
        parameters: {
          prompt: { ui: "textarea", required: true },
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

    const viewApi = vi.fn().mockRejectedValue(new Error("view_api unavailable"));

    mockConnect.mockResolvedValue({
      view_api: viewApi,
      predict,
      config: {
        components: [],
        dependencies: [],
      },
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

    const result = await hfSpaceAudioAdapter.generate({
      prompt: "hello",
      model: "qwen-tts-view-api-down",
      voice: "alloy",
      speed: 1.25,
      seed: "42",
    });

    expect(viewApi).toHaveBeenCalledTimes(1);
    expect(predict).toHaveBeenCalledTimes(1);
    expect(predict).toHaveBeenCalledWith("/generate_audio", {
      prompt: "hello",
      voice: "alloy",
      speed: 1.25,
      seed: 42,
    });
    expect(result).toEqual({
      audios: ["data:audio/wav;base64,UklGRg=="],
      meta: { duration_sec: 2.4 },
    });
  });

  it("생성 응답에서 오디오를 찾지 못하면 HF_SPACE_RESPONSE_INVALID를 반환한다", async () => {
    mockGetModelCatalog.mockResolvedValue([
      {
        id: "audio-model-1",
        type: "audio",
        key: "qwen-tts-response-mismatch",
        label: "Qwen TTS Response Mismatch",
        vendor: "HUGGINGFACE",
        provider: "hf_space",
        providerConfig: {
          space_id: "leey00nsu/qwen-3.5-tts-faster-gradio",
          api_name: "/run_generation",
          timeout_ms: 120000,
        },
        parameters: {
          prompt: { ui: "textarea", required: true },
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
          "/run_generation": {
            parameters: [{ parameter_name: "text", label: "Text" }],
          },
        },
      }),
      predict: vi.fn().mockResolvedValue({
        data: [
          {
            message: "ok",
          },
        ],
      }),
    });

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ stage: "RUNNING" }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const { hfSpaceAudioAdapter } = await import(
      "@/server/audio-generation/adapters/hf-space-adapter"
    );

    await expect(
      hfSpaceAudioAdapter.generate({
        prompt: "hello",
        model: "qwen-tts-response-mismatch",
        speed: 1,
      }),
    ).rejects.toThrow("HF_SPACE_RESPONSE_INVALID");
  });
});
