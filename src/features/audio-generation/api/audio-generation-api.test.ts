import { afterEach, describe, expect, it, vi } from "vitest";
import { requestAudioGeneration } from "@/features/audio-generation/api/audio-generation-api";

describe("requestAudioGeneration", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("audio reference 입력을 multipart form-data로 전송한다", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        requestId: "req-1",
        status: "pending",
        progress: 0,
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await requestAudioGeneration({
      prompt: "hello",
      model: "qwen-tts",
      voice: "alloy",
      speed: 1,
      seed: "",
      inputAudio: "data:audio/wav;base64,UklGRg==",
      referenceText: "reference words",
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/audio-generation",
      expect.objectContaining({
        method: "POST",
        body: expect.any(FormData),
      }),
    );

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(init.headers).toBeUndefined();
    const body = init.body as FormData;
    expect(body.get("prompt")).toBe("hello");
    expect(body.get("model")).toBe("qwen-tts");
    expect(body.get("inputAudio")).toBe("data:audio/wav;base64,UklGRg==");
    expect(body.get("referenceText")).toBe("reference words");
  });

  it("mode 기반 TTS 추가 파라미터를 form-data에 포함한다", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        requestId: "req-2",
        status: "pending",
        progress: 0,
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const payload = {
      prompt: "hello qwen",
      model: "qwen-tts-mode",
      voice: "",
      speed: 1,
      seed: "7",
      inputAudio: "",
      referenceText: "",
      modeChoice: "voice_clone",
      language: "English",
      speaker: "Vivian",
      streamMode: true,
      referencePreset: "ref_audio_3",
      customInstruction: "",
      voiceInstruction: "",
      xvecOnly: false,
      chunkSize: 120,
      temperature: 0.7,
      topK: 20,
      repetitionPenalty: 1.1,
    };

    await requestAudioGeneration(payload);

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = init.body as FormData;
    expect(body.get("modeChoice")).toBe("voice_clone");
    expect(body.get("language")).toBe("English");
    expect(body.get("speaker")).toBe("Vivian");
    expect(body.get("streamMode")).toBe("true");
    expect(body.get("referencePreset")).toBe("ref_audio_3");
    expect(body.get("xvecOnly")).toBe("false");
    expect(body.get("chunkSize")).toBe("120");
    expect(body.get("temperature")).toBe("0.7");
    expect(body.get("topK")).toBe("20");
    expect(body.get("repetitionPenalty")).toBe("1.1");
  });

  it("실패 응답이면 에러를 그대로 노출한다", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({
        message: "REQUEST_FAILED",
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      requestAudioGeneration({
        prompt: "hello",
        model: "qwen-tts",
        voice: "",
        speed: 1,
        seed: "",
        inputAudio: "",
        referenceText: "",
      }),
    ).rejects.toMatchObject({
      message: "REQUEST_FAILED",
      code: "REQUEST_FAILED",
    });
  });
});
