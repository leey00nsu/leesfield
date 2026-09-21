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
    const file = {
      id: "file-1",
      url: "https://cdn.example.com/request-id-1.wav",
      mimeType: "audio/wav",
      size: 16,
    };
    const mockPresign = vi.fn().mockResolvedValue({
      presignedUrl: "https://upload.example/signed",
      objectName: "project/file-1.wav",
      objectUrl: file.url,
      fileId: file.id,
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    });
    const mockConfirm = vi.fn().mockResolvedValue({ file });

    vi.resetModules();
    vi.doMock("leemage-sdk", () => ({
      LeemageClient: class {
        files = { presign: mockPresign, confirm: mockConfirm };
      },
    }));
    vi.doMock("@/server/http/safe-remote", () => ({
      requestRemote: vi.fn().mockResolvedValue({ status: 200, headers: {}, body: Buffer.alloc(0) }),
    }));
    vi.doMock("@/server/media-assets/media-cleanup-repository", () => ({
      cleanupUploadRetryAt: () => new Date(),
      createStorageCleanupIntent: vi.fn().mockResolvedValue({ id: "cleanup" }),
      queueStorageCleanup: vi.fn().mockResolvedValue({ id: "cleanup" }),
    }));

    Object.assign(process.env, {
      LEEMAGE_API_KEY: "test-key",
      LEEMAGE_PROJECT_ID: "project-id",
    });

    const { leemageAudioStorageAdapter } = await import(
      "@/server/audio-generation/storage/adapters/leemage-storage-adapter"
    );

    const result = await leemageAudioStorageAdapter.uploadAudios(
      {
        ...audioGenerationDefaults,
        prompt: "hello",
        model: "qwen-tts",
      },
      "node-banana-한글",
      [createWavDataUrl()],
      { duration_sec: 1.5 },
    );

    expect(mockPresign).toHaveBeenCalledTimes(1);
    expect(mockPresign.mock.calls[0]?.[1]).toMatchObject({
      fileName: expect.stringMatching(/^leesfield-[a-f0-9]{64}\.wav$/),
      contentType: "audio/wav",
    });
    expect(result.artifacts).toEqual([
      expect.objectContaining({
        storageObjectId: "file-1",
        storageUrl: "https://cdn.example.com/request-id-1.wav",
        mimeType: "audio/wav",
        durationMs: 1500,
      }),
    ]);
  });
});
