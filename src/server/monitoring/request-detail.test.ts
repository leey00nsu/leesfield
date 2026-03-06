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
      requestParams: {},
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
      assets: [
        {
          url: "https://cdn.example.com/audio.mp3",
          durationSec: 4,
        },
      ],
    });
  });
});
