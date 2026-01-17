import { processImageJobs, processVideoJobs } from "@/server/generation-worker/generation-worker";
import { prisma } from "@/server/db/prisma";
import { resolveImageGenerationResult } from "@/server/image-generation/image-generation";
import { resolveVideoGenerationResult } from "@/server/video-generation/video-generation";
import {
  saveImageGenerationResult,
  updateImageGenerationStatus,
} from "@/server/image-generation/image-generation-repository";
import {
  saveVideoGenerationResult,
  updateVideoGenerationStatus,
} from "@/server/video-generation/video-generation-repository";

vi.mock("@/server/db/prisma", () => ({
  prisma: {
    imageGeneration: {
      findMany: vi.fn(),
      updateMany: vi.fn(),
    },
    videoGeneration: {
      findMany: vi.fn(),
      updateMany: vi.fn(),
    },
  },
}));

vi.mock("@/server/image-generation/image-generation", () => ({
  resolveImageGenerationResult: vi.fn(),
}));

vi.mock("@/server/video-generation/video-generation", () => ({
  resolveVideoGenerationResult: vi.fn(),
}));

vi.mock("@/server/image-generation/image-generation-repository", () => ({
  saveImageGenerationResult: vi.fn(),
  updateImageGenerationStatus: vi.fn(),
}));

vi.mock("@/server/video-generation/video-generation-repository", () => ({
  saveVideoGenerationResult: vi.fn(),
  updateVideoGenerationStatus: vi.fn(),
}));

describe("generation worker", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("processImageJobs updates status when completed with skipDbSave", async () => {
    const mockRecord = {
      id: "img-db-id",
      requestId: "img-request-id",
      prompt: "hello",
      requestParams: {
        model: "z-image-turbo",
        width: 512,
        height: 512,
        steps: 5,
        imageCount: 1,
        seed: "",
      },
      imageCount: 1,
      steps: 5,
      seed: null,
      progress: 0,
    };

    (prisma.imageGeneration.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      mockRecord,
    ]);
    (prisma.imageGeneration.updateMany as ReturnType<typeof vi.fn>).mockResolvedValue({
      count: 1,
    });
    (resolveImageGenerationResult as ReturnType<typeof vi.fn>).mockResolvedValue({
      status: "completed",
      result: { images: [] },
      errorMessage: undefined,
      skipDbSave: true,
    });

    await processImageJobs();

    expect(updateImageGenerationStatus).toHaveBeenCalledWith(
      "img-db-id",
      "completed",
      100,
      undefined,
    );
    expect(saveImageGenerationResult).not.toHaveBeenCalled();
  });

  it("processVideoJobs updates status when completed with skipDbSave", async () => {
    const mockRecord = {
      id: "vid-db-id",
      requestId: "vid-request-id",
      prompt: "hello",
      requestParams: {
        model: "wan2-2-hf",
        initImage: "data:image/png;base64,AAAA",
        aspectRatio: "16:9",
        resolution: 720,
        durationSec: 3.5,
        fps: 16,
        steps: 6,
        guidanceScale: 1,
        seed: "",
      },
    };

    (prisma.videoGeneration.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      mockRecord,
    ]);
    (prisma.videoGeneration.updateMany as ReturnType<typeof vi.fn>).mockResolvedValue({
      count: 1,
    });
    (resolveVideoGenerationResult as ReturnType<typeof vi.fn>).mockResolvedValue({
      status: "completed",
      result: { videos: [] },
      errorMessage: undefined,
      skipDbSave: true,
    });

    await processVideoJobs();

    expect(updateVideoGenerationStatus).toHaveBeenCalledWith(
      "vid-db-id",
      "completed",
      100,
      undefined,
    );
    expect(saveVideoGenerationResult).not.toHaveBeenCalled();
  });
});
