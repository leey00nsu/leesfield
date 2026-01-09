import { Prisma } from "@prisma/client";
import { prisma } from "@/server/db/prisma";
import type { VideoGenerationFormValues } from "@/features/video-generation/model/video-generation-schema";
import type {
  VideoGenerationResponse,
  VideoGenerationStatus,
} from "@/features/video-generation/model/video-generation-types";

export async function createVideoGenerationRecord(
  requestId: string,
  payload: VideoGenerationFormValues,
  ownerEmail: string,
) {
  const requestParams: Prisma.InputJsonValue = {
    model: payload.model,
    prompt: payload.prompt,
    initImage: payload.initImage || null,
    aspectRatio: payload.aspectRatio,
    resolution: payload.resolution,
    durationSec: payload.durationSec,
    fps: payload.fps,
    steps: payload.steps,
    guidanceScale: payload.guidanceScale,
    seed: payload.seed ?? null,
  };

  return prisma.videoGeneration.create({
    data: {
      requestId,
      ownerEmail,
      prompt: payload.prompt,
      requestParams,
      status: "pending",
      progress: 0,
    },
  });
}

export async function saveVideoGenerationResult(
  generationId: string,
  status: VideoGenerationStatus,
  progress: number,
  result?: VideoGenerationResponse["result"],
  errorMessage?: string,
) {
  const operations: Prisma.PrismaPromise<unknown>[] = [
    prisma.videoGeneration.update({
      where: { id: generationId },
      data: {
        status,
        progress,
        errorMessage: errorMessage ?? null,
      },
    }),
  ];

  if (result?.videos?.length) {
    operations.push(
      prisma.videoGenerationVideo.deleteMany({
        where: { generationId },
      }),
    );
    operations.push(
      prisma.videoGenerationVideo.createMany({
        data: result.videos.map((video) => ({
          generationId,
          url: video.url,
          width: video.width ?? null,
          height: video.height ?? null,
          durationSec: video.durationSec ?? null,
        })),
      }),
    );
  }

  await prisma.$transaction(operations);
}

export async function getVideoGenerationByRequestId(
  requestId: string,
  ownerEmail: string,
) {
  return prisma.videoGeneration.findFirst({
    where: { requestId, ownerEmail },
    include: {
      videos: {
        orderBy: { createdAt: "asc" },
      },
    },
  });
}
