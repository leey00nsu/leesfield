import { describe, expect, it, vi } from "vitest";
import { requestAudioGeneration } from "@/features/audio-generation/api/audio-generation-api";

describe("requestAudioGeneration", () => {
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
});
