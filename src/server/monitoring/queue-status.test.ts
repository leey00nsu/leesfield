import { getQueueStatus } from "@/server/monitoring/queue-status";
import { prisma } from "@/server/db/prisma";

vi.mock("@/server/db/prisma", () => ({
  prisma: {
    imageGeneration: {
      findMany: vi.fn(),
    },
    videoGeneration: {
      findMany: vi.fn(),
    },
  },
}));

describe("getQueueStatus", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("모델별 pending/processing 수를 반환한다", async () => {
    (prisma.imageGeneration.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      { status: "pending", requestParams: { model: "z-image-turbo" } },
      { status: "processing", requestParams: { model: "z-image-turbo" } },
    ]);
    (prisma.videoGeneration.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      { status: "pending", requestParams: { model: "wan2-2-hf" } },
      { status: "pending", requestParams: { model: "wan2-2-hf" } },
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
