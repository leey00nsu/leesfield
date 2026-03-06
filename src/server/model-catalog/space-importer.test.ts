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
    expect(result.draft.parameters.inputAudio).toMatchObject({
      ui: "upload",
    });
    expect(result.draft.parameters.referenceText).toMatchObject({
      required: true,
    });
  });
});
