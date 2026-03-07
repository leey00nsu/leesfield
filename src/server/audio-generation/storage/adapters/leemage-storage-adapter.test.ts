import { audioGenerationDefaults } from "@/features/audio-generation/model/audio-generation-schema";

const baseEnv = {
  LEEMAGE_API_KEY: process.env.LEEMAGE_API_KEY,
  LEEMAGE_PROJECT_ID: process.env.LEEMAGE_PROJECT_ID,
  LEEMAGE_BASE_URL: process.env.LEEMAGE_BASE_URL,
};

function createWavDataUrl(contentType = "application/octet-stream") {
  const wavHeader = Buffer.from([
    0x52, 0x49, 0x46, 0x46, 0x24, 0x00, 0x00, 0x00,
    0x57, 0x41, 0x56, 0x45, 0x66, 0x6d, 0x74, 0x20,
  ]);
  return `data:${contentType};base64,${wavHeader.toString("base64")}`;
}

describe("leemageAudioStorageAdapter", () => {
  afterEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.unmock("leemage-sdk");
    Object.assign(process.env, baseEnv);
  });

  it("octet-stream data URL도 실제 오디오 확장자로 업로드한다", async () => {
    const mockUpload = vi.fn().mockResolvedValue({
      url: "https://cdn.example.com/request-id-1.wav",
    });

    vi.resetModules();
    vi.doMock("leemage-sdk", () => ({
      LeemageClient: class {
        files = { upload: mockUpload };
      },
    }));

    Object.assign(process.env, {
      LEEMAGE_API_KEY: "test-key",
      LEEMAGE_PROJECT_ID: "project-id",
    });

    const { leemageAudioStorageAdapter } = await import(
      "@/server/audio-generation/storage/adapters/leemage-storage-adapter"
    );

    await leemageAudioStorageAdapter.uploadAudios(
      {
        ...audioGenerationDefaults,
        prompt: "hello",
        model: "qwen-tts",
      },
      "request-id",
      [createWavDataUrl()],
      { duration_sec: 1.5 },
    );

    expect(mockUpload).toHaveBeenCalledTimes(1);
    expect(mockUpload.mock.calls[0]?.[1]).toMatchObject({
      name: "request-id-1.wav",
      type: "audio/wav",
    });
  });
});
