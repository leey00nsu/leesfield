import { beforeEach, describe, expect, it, vi } from "vitest";
import { getMonitoringRequestDetail } from "@/server/monitoring/request-detail";
import { prisma } from "@/server/db/prisma";

const mockInputAssets = vi.hoisted(() => vi.fn());

vi.mock("@/server/db/prisma", () => ({
  prisma: {
    imageGeneration: {
      findUnique: vi.fn(),
    },
    videoGeneration: {
      findUnique: vi.fn(),
    },
    audioGeneration: {
      findUnique: vi.fn(),
    },
    generationInputAsset: {
      findMany: mockInputAssets,
    },
  },
}));

describe("getMonitoringRequestDetail", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockInputAssets.mockResolvedValue([]);
  });

  it("audio 요청 상세를 오디오 asset으로 반환한다", async () => {
    const createdAt = new Date("2026-01-10T10:00:00.000Z");
    const updatedAt = new Date("2026-01-10T10:00:02.000Z");
    (prisma.audioGeneration.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      requestId: "aud-1",
      status: "completed",
      modelKey: "qwen-tts",
      prompt: "hello",
      requestParams: {
        inputAudio: "data:audio/wav;base64,UklGRg==",
        referenceText: "reference words",
        dynamicParams: {speaker:"Ryan",seed:0},
      },
      createdAt,
      updatedAt,
      progress: 100,
      errorMessage: null,
      audios: [
        {
          url: "https://cdn.example.com/audio.mp3",
          durationSec: 4,
        },
      ],
    });

    const result = await getMonitoringRequestDetail("audio" as never, "aud-1");

    expect(result).toMatchObject({
      id: "aud-1",
      type: "audio",
      durationMs: 2000,
      errorMessage: null,
      warningMessage: null,
      inputAudios: ["data:audio/wav;base64,UklGRg=="],
      requestParameters: {dynamicParams:{speaker:"Ryan",seed:0}},
      referenceText: "reference words",
      assets: [
        {
          url: "https://cdn.example.com/audio.mp3",
          durationSec: 4,
        },
      ],
    });
  });

  it("completed audio 안내 메시지는 warning 으로 분리한다", async () => {
    const createdAt = new Date("2026-01-10T10:00:00.000Z");
    const updatedAt = new Date("2026-01-10T10:00:02.000Z");
    (prisma.audioGeneration.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      requestId: "aud-2",
      status: "completed",
      modelKey: "qwen-tts",
      prompt: "hello",
      requestParams: {},
      createdAt,
      updatedAt,
      progress: 100,
      errorMessage: "오디오 저장소가 지정되지 않아 외부 저장소 업로드를 건너뛰고 inline 결과를 사용합니다.",
      audios: [
        {
          url: "https://cdn.example.com/audio.mp3",
          durationSec: 4,
        },
      ],
    });

    const result = await getMonitoringRequestDetail("audio" as never, "aud-2");

    expect(result).toMatchObject({
      id: "aud-2",
      status: "completed",
      errorMessage: null,
      warningMessage:
        "오디오 저장소가 지정되지 않아 외부 저장소 업로드를 건너뛰고 inline 결과를 사용합니다.",
    });
  });

  it("returns durable input asset URLs while keeping the stored file body out of the response", async () => {
    (prisma.imageGeneration.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      requestId: "img-asset",
      status: "completed",
      modelKey: "image-model",
      prompt: "portrait",
      requestParams: {
        requestVersion: 3,
        requestSettings: { initImages: ["[file]"] },
        initImages: [],
      },
      createdAt: new Date("2026-01-10T10:00:00.000Z"),
      updatedAt: new Date("2026-01-10T10:00:02.000Z"),
      progress: 100,
      errorMessage: null,
      images: [{ url: "https://cdn.example.com/output.png", asset: { imageVariants: null }, width: 512, height: 512 }],
    });
    mockInputAssets.mockResolvedValue([{
      field: "initImages",
      sortOrder: 0,
      asset: {
        type: "image",
        storageUrl: "https://cdn.example.com/input.png",
        legacyUrl: null,
      },
    }]);

    const result = await getMonitoringRequestDetail("image", "img-asset");

    expect(result?.inputImages).toEqual(["https://cdn.example.com/input.png"]);
    expect(JSON.stringify(result)).not.toContain("[file]");
    expect(mockInputAssets).toHaveBeenCalledWith(expect.objectContaining({
      where: { requestId: "img-asset", generationType: "image" },
    }));
  });
});
