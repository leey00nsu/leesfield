import { describe, expect, it } from "vitest";
import { modelCatalogInputSchema, modelCatalogSchema } from "@/server/model-catalog/catalog-schema";

describe("model-catalog option normalization", () => {
  it("image 모델은 codex_cli provider config를 허용한다", () => {
    const parsed = modelCatalogInputSchema.safeParse({
      type: "image",
      key: "gpt-image-2-codex",
      label: "GPT Image 2",
      vendor: "OPENAI",
      provider: "codex_cli",
      providerConfig: {
        command: "codex",
        model_id: "gpt-image-2",
        timeout_ms: 300000,
      },
      parameters: {
        prompt: { ui: "textarea", required: true },
        width: { ui: "hidden", min: 1024, max: 1024, step: 1, default: 1024 },
        height: { ui: "hidden", min: 1024, max: 1024, step: 1, default: 1024 },
        steps: { ui: "hidden", min: 1, max: 1, step: 1, default: 1 },
        imageCount: { ui: "hidden", min: 1, max: 1, step: 1, default: 1 },
      },
      meta: {
        pipeline: "image_generation",
        model_id: "gpt-image-2",
        default_width: 1024,
        default_height: 1024,
        default_steps: 1,
        concurrent_limit: 1,
        max_input_images: 0,
      },
      isActive: true,
      isDefault: false,
    });

    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(parsed.data.provider).toBe("codex_cli");
    expect(parsed.data.providerConfig.model_id).toBe("gpt-image-2");
  });

  it("image 모델은 provider와 providerConfig가 일치해야 한다", () => {
    const base = {
      type: "image",
      key: "gpt-image-2-codex",
      label: "GPT Image 2",
      vendor: "OPENAI",
      parameters: {
        prompt: { ui: "textarea", required: true },
        width: { ui: "hidden", min: 1024, max: 1024, step: 1, default: 1024 },
        height: { ui: "hidden", min: 1024, max: 1024, step: 1, default: 1024 },
        steps: { ui: "hidden", min: 1, max: 1, step: 1, default: 1 },
        imageCount: { ui: "hidden", min: 1, max: 1, step: 1, default: 1 },
      },
      meta: {
        pipeline: "image_generation",
        model_id: "gpt-image-2",
        default_width: 1024,
        default_height: 1024,
        default_steps: 1,
        concurrent_limit: 1,
        max_input_images: 0,
      },
      isActive: true,
      isDefault: false,
    };

    const codexWithHfConfig = modelCatalogInputSchema.safeParse({
      ...base,
      provider: "codex_cli",
      providerConfig: {
        space_id: "demo/space",
        api_name: "/generate_image",
      },
    });
    const hfWithCodexConfig = modelCatalogInputSchema.safeParse({
      ...base,
      provider: "hf_space",
      providerConfig: {
        command: "codex",
        model_id: "gpt-image-2",
      },
    });

    expect(codexWithHfConfig.success).toBe(false);
    expect(hfWithCodexConfig.success).toBe(false);
  });

  it("video와 audio 모델은 codex_cli provider를 거부한다", () => {
    const videoParsed = modelCatalogInputSchema.safeParse({
      type: "video",
      key: "video-codex",
      label: "Video Codex",
      vendor: "OPENAI",
      provider: "codex_cli",
      providerConfig: {
        command: "codex",
        model_id: "gpt-image-2",
      },
      parameters: {
        prompt: { ui: "textarea", required: true },
        durationSec: { ui: "range", min: 1, max: 5, step: 1, default: 3 },
        steps: { ui: "range", min: 1, max: 10, step: 1, default: 5 },
        guidanceScale: { ui: "range", min: 0, max: 10, step: 1, default: 1 },
      },
      meta: {
        supports_init_image: false,
        t2v_model_id: "video-codex",
        default_width: 1280,
        default_height: 720,
        default_duration_sec: 3,
        default_fps: 24,
        default_steps: 5,
        default_guidance_scale: 1,
      },
    });
    const audioParsed = modelCatalogInputSchema.safeParse({
      type: "audio",
      key: "audio-codex",
      label: "Audio Codex",
      vendor: "OPENAI",
      provider: "codex_cli",
      providerConfig: {
        command: "codex",
        model_id: "gpt-image-2",
      },
      parameters: {
        prompt: { ui: "textarea", required: true },
      },
      meta: {
        model_id: "audio-codex",
        default_speed: 1,
      },
    });

    expect(videoParsed.success).toBe(false);
    expect(audioParsed.success).toBe(false);
  });

  it("등록 payload의 flat/tuple options를 canonical option object로 정규화한다", () => {
    const parsed = modelCatalogInputSchema.safeParse({
      type: "audio",
      key: "qwen-tts",
      label: "Qwen TTS",
      vendor: "HUGGINGFACE",
      provider: "hf_space",
      providerConfig: {
        space_id: "leey00nsu/qwen-3.5-tts-faster-gradio",
        api_name: "/run_generation",
      },
      parameters: {
        prompt: { ui: "textarea", required: true },
        modeChoice: {
          ui: "select",
          label: "Generation Mode",
          options: [
            ["Voice Clone", "voice_clone"],
            ["Custom Speaker", "custom"],
          ],
          default: "voice_clone",
        },
        speaker: {
          ui: "select",
          label: "Speaker",
          options: ["Vivian", "Serena"],
          default: "Vivian",
        },
      },
      meta: {
        model_id: "leey00nsu/qwen-3.5-tts-faster-gradio",
        default_speed: 1,
      },
      isActive: true,
      isDefault: false,
    });

    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    if (parsed.data.type !== "audio") {
      throw new Error("expected audio model");
    }

    expect(parsed.data.parameters.modeChoice?.options).toEqual([
      { label: "Voice Clone", value: "voice_clone" },
      { label: "Custom Speaker", value: "custom" },
    ]);
    expect(parsed.data.parameters.speaker?.options).toEqual([
      { label: "Vivian", value: "Vivian" },
      { label: "Serena", value: "Serena" },
    ]);
  });

  it("legacy catalog records의 flat options도 읽을 때 canonical option object로 정규화한다", () => {
    const parsed = modelCatalogSchema.safeParse([
      {
        id: "audio-1",
        type: "audio",
        key: "legacy-qwen",
        label: "Legacy Qwen TTS",
        vendor: "HUGGINGFACE",
        provider: "hf_space",
        providerConfig: {
          space_id: "legacy/qwen",
          api_name: "/generate",
        },
        parameters: {
          prompt: { ui: "textarea", required: true },
          language: {
            ui: "select",
            options: ["English", "Korean"],
            default: "English",
          },
        },
        meta: {
          model_id: "legacy/qwen",
          default_speed: 1,
        },
        isActive: true,
        isDefault: true,
        createdAt: new Date("2026-03-06T00:00:00Z"),
        updatedAt: new Date("2026-03-06T00:00:00Z"),
      },
    ]);

    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    if (parsed.data[0]?.type !== "audio") {
      throw new Error("expected audio model");
    }

    expect(parsed.data[0]?.parameters.language?.options).toEqual([
      { label: "English", value: "English" },
      { label: "Korean", value: "Korean" },
    ]);
  });
});
