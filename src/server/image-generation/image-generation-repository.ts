import { Prisma } from "@prisma/client";
import { prisma } from "@/server/db/prisma";
import type { ImageGenerationFormValues } from "@/features/image-generation/model/image-generation-schema";
import type {
  ImageGenerationResponse,
  ImageGenerationStatus,
} from "@/features/image-generation/model/image-generation-types";

export async function createImageGenerationRecord(
  requestId: string,
  payload: ImageGenerationFormValues,
  ownerEmail: string
) {
  const requestParams: Prisma.InputJsonValue = {
    model: payload.model,
    prompt: payload.prompt,
    width: payload.width,
    height: payload.height,
    steps: payload.steps,
    seed: payload.seed || null,
    imageCount: payload.imageCount,
    initImagesCount: payload.initImages?.length ?? 0,
  };

  return prisma.imageGeneration.create({
    data: {
      requestId,
      ownerEmail,
      prompt: payload.prompt,
      requestParams,
      modelKey: payload.model,
      aspectRatio: `${payload.width}x${payload.height}`,
      imageCount: payload.imageCount,
      steps: payload.steps,
      seed: payload.seed || null,
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

export async function updateImageGenerationStatus(
  generationId: string,
  status: ImageGenerationStatus,
  progress: number,
  errorMessage?: string,
) {
  return prisma.imageGeneration.update({
    where: { id: generationId },
    data: {
      status,
      progress,
      errorMessage: errorMessage ?? null,
    },
  });
}

export async function getImageGenerationByRequestId(
  requestId: string,
  ownerEmail: string,
) {
  return prisma.imageGeneration.findFirst({
    where: { requestId, ownerEmail },
    include: {
      images: {
        orderBy: { createdAt: "asc" },
      },
    },
  });
}
