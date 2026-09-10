import { snapshotRequest } from '@/server/generation-request/request-snapshot';
import type { GeneratedMediaArtifact } from "@/server/media-assets/generated-media-artifact";
import { parseImageVariants } from "@/shared/media-assets/image-variants";
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
  ownerEmail: string,
  apiKeyId: string | null = null,
  graphNodeId: string | null = null,
  requestSnapshot?: Record<string, Prisma.InputJsonValue | null>,
) {
  const requestParams: Prisma.InputJsonValue = requestSnapshot ?? {
    dynamicParams: payload.dynamicParams ? JSON.parse(JSON.stringify(payload.dynamicParams)) : undefined,
    model: payload.model,
    prompt: payload.prompt,
    width: payload.width,
    height: payload.height,
    steps: payload.steps,
    modeChoice: payload.modeChoice ?? null,
    guidanceScale: payload.guidanceScale ?? null,
    promptUpsampling: payload.promptUpsampling ?? null,
    seed: payload.seed || null,
    imageCount: payload.imageCount,
    initImagesCount: payload.initImages?.length ?? 0,
    initImages: payload.initImages ?? [],
  };

  return prisma.imageGeneration.create({
    data: {
      requestId,
      ownerEmail,
      apiKeyId,
      graphNodeId,
      prompt: payload.prompt ?? "",
      requestParams: await snapshotRequest('image', requestParams as Record<string, unknown>),
      modelKey: payload.model,
      aspectRatio: typeof payload.width === "number" && typeof payload.height === "number" ? `${payload.width}x${payload.height}` : null,
      imageCount: payload.imageCount ?? null,
      steps: payload.steps ?? null,
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
  errorMessage?: string,
  artifacts?: GeneratedMediaArtifact[],
) {
  if (artifacts?.length) {
    await prisma.$transaction(async tx => {
      const generation = await tx.imageGeneration.update({where: {id: generationId}, data: {status, progress, errorMessage: errorMessage ?? null}, select: {ownerEmail: true}});
      if (!generation.ownerEmail) throw new Error("GENERATION_OWNER_REQUIRED");
      await tx.imageGenerationImage.deleteMany({where: {generationId}});
      for (const artifact of artifacts) {
        const asset = await tx.mediaAsset.create({data: {ownerEmail: generation.ownerEmail, type: "image", origin: "generation", storageProvider: artifact.storageProvider, storageObjectId: artifact.storageObjectId, storageUrl: artifact.storageUrl, mimeType: artifact.mimeType, bytes: BigInt(artifact.bytes), width: artifact.width, height: artifact.height, imageVariants: parseImageVariants(artifact.imageVariants) ?? undefined}, select: {id: true}});
        await tx.imageGenerationImage.create({data: {generationId, assetId: asset.id, url: artifact.storageUrl, width: artifact.width, height: artifact.height}});
      }
    });
    return;
  }
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
