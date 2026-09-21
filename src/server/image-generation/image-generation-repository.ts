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
import {
  GenerationLeaseLostError,
  type GenerationLease,
} from "@/server/generation-worker/execution-lease";
import {
  inputAssetRefsFromSnapshot,
  linkGenerationInputAssets,
  type GenerationInputAssetRef,
} from "@/server/generation-request/generation-input-assets";
import { historyMetadataFromRequest } from "@/server/history/lib/history-metadata";
import { isCleanupClient, linkStorageCleanupToAsset } from "@/server/media-assets/media-cleanup-repository";

export async function createImageGenerationRecord(
  requestId: string,
  payload: ImageGenerationFormValues,
  ownerEmail: string,
  apiKeyId: string | null = null,
  graphNodeId: string | null = null,
  requestSnapshot?: Record<string, Prisma.InputJsonValue | null>,
  inputAssetRefs?: readonly GenerationInputAssetRef[],
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

  const refs = inputAssetRefs ?? inputAssetRefsFromSnapshot("image", requestParams);
  const persistedRequest = await snapshotRequest("image", requestParams as Record<string, unknown>, {
    inputAssets: inputAssetRefs,
  });
  const data = {
    requestId,
    ownerEmail,
    apiKeyId,
    graphNodeId,
    prompt: payload.prompt ?? "",
    requestParams: persistedRequest,
    historyMetadata: historyMetadataFromRequest(persistedRequest) ?? undefined,
    modelKey: payload.model,
    aspectRatio: typeof payload.width === "number" && typeof payload.height === "number" ? `${payload.width}x${payload.height}` : null,
    imageCount: payload.imageCount ?? null,
    steps: payload.steps ?? null,
    seed: payload.seed || null,
    status: "pending" as const,
    progress: 0,
  };
  if (refs.length === 0) return prisma.imageGeneration.create({ data });
  return prisma.$transaction(async (tx) => {
    const record = await tx.imageGeneration.create({ data });
    await linkGenerationInputAssets(tx, {
      requestId,
      generationType: "image",
      ownerEmail,
      refs,
    });
    return record;
  });
}

export async function saveImageGenerationResult(
  generationId: string,
  status: ImageGenerationStatus,
  progress: number,
  result?: ImageGenerationResponse["result"],
  errorMessage?: string,
  artifacts?: GeneratedMediaArtifact[],
  lease?: GenerationLease,
) {
  if (lease) {
    await prisma.$transaction(async (tx) => {
      const updated = await tx.imageGeneration.updateMany({
        where: {
          id: generationId,
          status: { in: ["processing", "uploading"] },
          cancelRequestedAt: null,
          executionLeaseToken: lease.token,
          executionLeaseVersion: lease.version,
          executionLeaseUntil: { gt: new Date() },
        },
        data: {
          status,
          progress,
          errorMessage: errorMessage ?? null,
          executionLeaseToken: null,
          executionLeaseUntil: null,
        },
      });
      if (updated.count !== 1) {
        throw new GenerationLeaseLostError("image", generationId);
      }
      const generation = await tx.imageGeneration.findUnique({
        where: { id: generationId },
        select: { ownerEmail: true, requestId: true },
      });
      if (!generation?.ownerEmail) throw new Error("GENERATION_OWNER_REQUIRED");
      await tx.imageGenerationImage.deleteMany({ where: { generationId } });
      if (artifacts?.length) {
        for (const artifact of artifacts) {
          const asset = await tx.mediaAsset.create({
            data: {
              ownerEmail: generation.ownerEmail,
              type: "image",
              origin: "generation",
              storageProvider: artifact.storageProvider,
              storageObjectId: artifact.storageObjectId,
              storageUrl: artifact.storageUrl,
              mimeType: artifact.mimeType,
              bytes: BigInt(artifact.bytes),
              width: artifact.width,
              height: artifact.height,
              imageVariants: parseImageVariants(artifact.imageVariants) ?? undefined,
            },
            select: { id: true },
          });
          if (isCleanupClient(tx)) {
            await linkStorageCleanupToAsset(tx, {
              ownerEmail: generation.ownerEmail,
              requestId: generation.requestId,
              storageProvider: artifact.storageProvider,
              storageObjectId: artifact.storageObjectId,
              storageUrl: artifact.storageUrl,
              reason: "generation_output",
              assetId: asset.id,
            });
          }
          await tx.imageGenerationImage.create({
            data: {
              generationId,
              assetId: asset.id,
              url: artifact.storageUrl,
              width: artifact.width,
              height: artifact.height,
            },
          });
        }
      } else if (result?.images?.length) {
        await tx.imageGenerationImage.createMany({
          data: result.images.map((image) => ({
            generationId,
            url: image.url,
            width: image.width ?? null,
            height: image.height ?? null,
          })),
        });
      }
    });
    return;
  }

  if (artifacts?.length) {
    await prisma.$transaction(async tx => {
      const generation = await tx.imageGeneration.update({where: {id: generationId}, data: {status, progress, errorMessage: errorMessage ?? null}, select: {ownerEmail: true, requestId: true}});
      if (!generation.ownerEmail) throw new Error("GENERATION_OWNER_REQUIRED");
      await tx.imageGenerationImage.deleteMany({where: {generationId}});
      for (const artifact of artifacts) {
        const asset = await tx.mediaAsset.create({data: {ownerEmail: generation.ownerEmail, type: "image", origin: "generation", storageProvider: artifact.storageProvider, storageObjectId: artifact.storageObjectId, storageUrl: artifact.storageUrl, mimeType: artifact.mimeType, bytes: BigInt(artifact.bytes), width: artifact.width, height: artifact.height, imageVariants: parseImageVariants(artifact.imageVariants) ?? undefined}, select: {id: true}});
        if (isCleanupClient(tx)) {
          await linkStorageCleanupToAsset(tx, {
            ownerEmail: generation.ownerEmail,
            requestId: generation.requestId,
            storageProvider: artifact.storageProvider,
            storageObjectId: artifact.storageObjectId,
            storageUrl: artifact.storageUrl,
            reason: "generation_output",
            assetId: asset.id,
          });
        }
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
  lease?: GenerationLease,
) {
  if (lease) {
    const updated = await prisma.imageGeneration.updateMany({
      where: {
        id: generationId,
        status: { in: ["processing", "uploading"] },
        cancelRequestedAt: null,
        executionLeaseToken: lease.token,
        executionLeaseVersion: lease.version,
        executionLeaseUntil: { gt: new Date() },
      },
      data: {
        status,
        progress,
        errorMessage: errorMessage ?? null,
        executionLeaseToken: null,
        executionLeaseUntil: null,
      },
    });
    if (updated.count !== 1) {
      throw new GenerationLeaseLostError("image", generationId);
    }
    return prisma.imageGeneration.findUnique({ where: { id: generationId } });
  }
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
  apiKeyId?: string | null,
) {
  return prisma.imageGeneration.findFirst({
    where: { requestId, ownerEmail, ...(apiKeyId ? { apiKeyId } : {}) },
    include: {
      images: {
        orderBy: { createdAt: "asc" },
      },
    },
  });
}
