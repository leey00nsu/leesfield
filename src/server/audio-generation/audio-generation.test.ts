import { beforeEach, describe, expect, it, vi } from "vitest";
import { audioGenerationDefaults } from "@/features/audio-generation/model/audio-generation-schema";
import { resolveAudioGenerationResult } from "@/server/audio-generation/audio-generation";

const mockGenerate = vi.hoisted(() => vi.fn());
const mockUploadAudios = vi.hoisted(() => vi.fn());
const mockResolveAudioStorageProvider = vi.hoisted(() => vi.fn());

vi.mock("@/server/audio-generation/adapters/hf-space-adapter", () => ({
  hfSpaceAudioAdapter: {
    generate: mockGenerate,
    mapError: (error: unknown) =>
      error instanceof Error ? `mapped:${error.message}` : "mapped:unknown",
  },
}));

vi.mock("@/server/audio-generation/storage/adapters/leemage-storage-adapter", () => ({
  leemageAudioStorageAdapter: {
    name: "leemage",
    uploadAudios: mockUploadAudios,
  },
}));

vi.mock("@/server/audio-generation/storage/storage-selector", () => ({
  resolveAudioStorageProvider: mockResolveAudioStorageProvider,
}));

describe("resolveAudioGenerationResult", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("storage provider가 없으면 inline 결과와 경고를 반환한다", async () => {
    mockGenerate.mockResolvedValue({
      audios: ["data:audio/mpeg;base64,ZmFrZQ=="],
      meta: { duration_sec: 2.5 },
    });
    mockResolveAudioStorageProvider.mockReturnValue({
      provider: null,
      warningMessage: "storage skipped",
    });

    const result = await resolveAudioGenerationResult(
      {
        ...audioGenerationDefaults,
        prompt: "hello",
        model: "qwen-tts",
        speed: 1,
      },
      "request-id",
    );

    expect(result).toEqual({
      status: "completed",
      result: {
        audios: [
          {
            url: "data:audio/mpeg;base64,ZmFrZQ==",
            durationSec: 2.5,
          },
        ],
      },
      errorMessage: "storage skipped",
      skipDbSave: true,
    });
    expect(mockUploadAudios).not.toHaveBeenCalled();
  });

  it("storage provider가 있으면 업로드 결과를 반환한다", async () => {
    mockGenerate.mockResolvedValue({
      audios: ["data:audio/mpeg;base64,ZmFrZQ=="],
      meta: { duration_sec: 1.2 },
    });
    mockResolveAudioStorageProvider.mockReturnValue({ provider: "leemage" });
    mockUploadAudios.mockResolvedValue({
      status: "completed",
      result: {
        audios: [{ url: "https://cdn.example.com/audio.mp3", durationSec: 1.2 }],
      },
    });

    const payload = {
      ...audioGenerationDefaults,
      prompt: "hello",
      model: "qwen-tts",
      speed: 1.5,
    };

    const result = await resolveAudioGenerationResult(payload, "request-id");

    expect(mockUploadAudios).toHaveBeenCalledWith(
      payload,
      "request-id",
      ["data:audio/mpeg;base64,ZmFrZQ=="],
      { duration_sec: 1.2 },
    );
    expect(result.status).toBe("completed");
    expect(result.result?.audios[0]?.url).toBe("https://cdn.example.com/audio.mp3");
  });

  it("provider 오류를 사용자 친화적 메시지로 반환한다", async () => {
    mockGenerate.mockRejectedValue(new Error("HF_SPACE_NOT_READY"));
    mockResolveAudioStorageProvider.mockReturnValue({ provider: "leemage" });

    const result = await resolveAudioGenerationResult(
      {
        ...audioGenerationDefaults,
        prompt: "hello",
        model: "qwen-tts",
      },
      "request-id",
    );

    expect(result).toEqual({
      status: "failed",
      errorMessage: "mapped:HF_SPACE_NOT_READY",
    });
  });
});
