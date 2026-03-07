import { getQueueStatus } from "@/server/monitoring/queue-status";
import { prisma } from "@/server/db/prisma";
import type {
  RuntimeAudioModel,
  RuntimeImageModel,
  RuntimeVideoModel,
} from "@/server/model-catalog/runtime-models";

const mockGetRuntimeCatalog = vi.hoisted(() => vi.fn());

vi.mock("@/server/db/prisma", () => ({
  prisma: {
    audioGeneration: {
      groupBy: vi.fn(),
    },
    imageGeneration: {
      groupBy: vi.fn(),
    },
    videoGeneration: {
      groupBy: vi.fn(),
    },
  },
}));

vi.mock("@/server/model-catalog/runtime-models", async () => {
  const actual = await vi.importActual<
    typeof import("@/server/model-catalog/runtime-models")
  >("@/server/model-catalog/runtime-models");
  return {
    ...actual,
    getRuntimeCatalog: mockGetRuntimeCatalog,
  };
});

describe("getQueueStatus", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    const audioModels: RuntimeAudioModel[] = [
      {
        key: "qwen-tts",
        isActive: true,
        isDefault: true,
        defaults: {
          voice: "alloy",
          speed: 1,
        },
        concurrentLimit: 1,
        supportsInputAudio: false,
      },
    ];
    const imageModels: RuntimeImageModel[] = [
      {
        key: "z-image-turbo",
        isActive: true,
        isDefault: true,
        defaults: {
          steps: 5,
          width: 512,
          height: 512,
          guidanceScale: 1,
          modeChoice: "Distilled (4 steps)",
          promptUpsampling: false,
        },
        concurrentLimit: 1,
        maxInputImages: 0,
      },
    ];
    const videoModels: RuntimeVideoModel[] = [
      {
        key: "wan2-2-hf",
        isActive: true,
        isDefault: true,
        defaults: {
          steps: 6,
          guidanceScale: 1,
          durationSec: 3.5,
          fps: 16,
          aspectRatio: "16:9",
          resolution: 720,
        },
        concurrentLimit: 1,
        supportsInitImage: true,
      },
    ];
    mockGetRuntimeCatalog.mockResolvedValue({ audioModels, imageModels, videoModels });
  });

  it("모델별 pending/processing 수를 반환한다", async () => {
    (prisma.audioGeneration.groupBy as ReturnType<typeof vi.fn>).mockResolvedValue([
      { modelKey: "qwen-tts", status: "processing", _count: { _all: 3 } },
    ]);
    (prisma.imageGeneration.groupBy as ReturnType<typeof vi.fn>).mockResolvedValue([
      { modelKey: "z-image-turbo", status: "pending", _count: { _all: 1 } },
      { modelKey: "z-image-turbo", status: "processing", _count: { _all: 1 } },
    ]);
    (prisma.videoGeneration.groupBy as ReturnType<typeof vi.fn>).mockResolvedValue([
      { modelKey: "wan2-2-hf", status: "pending", _count: { _all: 2 } },
    ]);

    const result = await getQueueStatus();

    const imageItem = result.items.find(
      (item) => item.type === "image" && item.model === "z-image-turbo",
    );
    const videoItem = result.items.find(
      (item) => item.type === "video" && item.model === "wan2-2-hf",
    );
    const audioItem = result.items.find(
      (item) => item.type === "audio" && item.model === "qwen-tts",
    );

    expect(imageItem).toMatchObject({ pending: 1, processing: 1 });
    expect(videoItem).toMatchObject({ pending: 2, processing: 0 });
    expect(audioItem).toMatchObject({ pending: 0, processing: 3 });
    expect(result.updatedAt).toEqual(expect.any(String));
  });
});
