import { getQueueStatus } from "@/server/monitoring/queue-status";
import { prisma } from "@/server/db/prisma";

vi.mock("@/server/db/prisma", () => ({
  prisma: {
    imageGeneration: {
      groupBy: vi.fn(),
    },
    videoGeneration: {
      groupBy: vi.fn(),
    },
  },
}));

describe("getQueueStatus", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("모델별 pending/processing 수를 반환한다", async () => {
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

    expect(imageItem).toMatchObject({ pending: 1, processing: 1 });
    expect(videoItem).toMatchObject({ pending: 2, processing: 0 });
    expect(result.updatedAt).toEqual(expect.any(String));
  });
});
