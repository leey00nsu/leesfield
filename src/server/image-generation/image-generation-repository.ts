import { Prisma } from "@prisma/client";
import { prisma } from "@/server/db/prisma";
import type { ImageGenerationFormValues } from "@/features/image-generation/model/image-generation-schema";
import type {
  ImageGenerationResponse,
  ImageGenerationStatus,
} from "@/features/image-generation/model/image-generation-types";

export async function createImageGenerationRecord(
  requestId: string,
  payload: ImageGenerationFormValues
) {
  return prisma.imageGeneration.create({
    data: {
      requestId,
      prompt: payload.prompt,
      negativePrompt: null,
      aspectRatio: `${payload.width}x${payload.height}`,
      imageCount: payload.imageCount,
      cfgScale: 0,
      steps: payload.steps,
      seed: payload.seed || null,
      sampler: null,
      status: "pending",
      progress: 0,
    },
  });
}

export async function saveImageGenerationResult(
  generationId: string,
  status: ImageGenerationStatus,
  progress: number,
  result?: ImageGenerationResponse["result"],
  errorMessage?: string
) {
  const operations: Prisma.PrismaPromise<unknown>[] = [
    prisma.imageGeneration.update({
      where: { id: generationId },
      data: {
        status,
        progress,
        errorMessage: errorMessage ?? null,
      },
    }),
  ];

  if (result?.images?.length) {
    operations.push(
      prisma.imageGenerationImage.deleteMany({
        where: { generationId },
      })
    );
    operations.push(
      prisma.imageGenerationImage.createMany({
        data: result.images.map((image) => ({
          generationId,
          url: image.url,
          width: image.width ?? null,
          height: image.height ?? null,
        })),
      })
    );
  }

  await prisma.$transaction(operations);
}

export async function getImageGenerationByRequestId(requestId: string) {
  return prisma.imageGeneration.findUnique({
    where: { requestId },
    include: {
      images: {
        orderBy: { createdAt: "asc" },
      },
    },
  });
}
