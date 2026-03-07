import { beforeEach, describe, expect, it, vi } from "vitest";
import { getMonitoringRequestDetail } from "@/server/monitoring/request-detail";
import { prisma } from "@/server/db/prisma";

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
  },
}));

describe("getMonitoringRequestDetail", () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
});
