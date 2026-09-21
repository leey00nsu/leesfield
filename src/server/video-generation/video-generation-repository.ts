import { snapshotRequest } from '@/server/generation-request/request-snapshot';
import { Prisma } from "@prisma/client";
import { prisma } from "@/server/db/prisma";
import type { VideoGenerationFormValues } from "@/features/video-generation/model/video-generation-schema";
import type {
  VideoGenerationResponse,
  VideoGenerationStatus,
} from "@/features/video-generation/model/video-generation-types";
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
import type { GeneratedMediaArtifact } from "@/server/media-assets/generated-media-artifact";
import { isCleanupClient, linkStorageCleanupToAsset } from "@/server/media-assets/media-cleanup-repository";

export async function createVideoGenerationRecord(
  requestId: string,
  payload: VideoGenerationFormValues,
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
    initImage: payload.initImage || null,
    aspectRatio: payload.aspectRatio,
    resolution: payload.resolution,
    durationSec: payload.durationSec,
    fps: payload.fps,
    steps: payload.steps,
    guidanceScale: payload.guidanceScale,
    seed: payload.seed ?? null,
  };

  const refs = inputAssetRefs ?? inputAssetRefsFromSnapshot("video", requestParams);
  const persistedRequest = await snapshotRequest("video", requestParams as Record<string, unknown>, {
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
    status: "pending" as const,
    progress: 0,
  };
  if (refs.length === 0) return prisma.videoGeneration.create({ data });
  return prisma.$transaction(async (tx) => {
    const record = await tx.videoGeneration.create({ data });
    await linkGenerationInputAssets(tx, {
      requestId,
      generationType: "video",
      ownerEmail,
      refs,
    });
    return record;
  });
}

export async function saveVideoGenerationResult(
  generationId: string,
  status: VideoGenerationStatus,
  progress: number,
  result?: VideoGenerationResponse["result"],
  errorMessage?: string,
  lease?: GenerationLease,
  artifacts?: GeneratedMediaArtifact[],
) {
  if (artifacts?.length) {
    await prisma.$transaction(async (tx) => {
      const updated = lease
        ? await tx.videoGeneration.updateMany({
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
          })
        : await tx.videoGeneration.updateMany({
            where: { id: generationId },
            data: { status, progress, errorMessage: errorMessage ?? null },
          });
      if (updated.count !== 1) {
        if (lease) throw new GenerationLeaseLostError("video", generationId);
        throw new Error("GENERATION_STATE_CONFLICT");
      }
      const generation = await tx.videoGeneration.findUnique({
        where: { id: generationId },
        select: { ownerEmail: true, requestId: true },
      });
      if (!generation?.ownerEmail) throw new Error("GENERATION_OWNER_REQUIRED");
      await tx.videoGenerationVideo.deleteMany({ where: { generationId } });
      for (const artifact of artifacts) {
        const asset = await tx.mediaAsset.create({
          data: {
            ownerEmail: generation.ownerEmail,
            type: "video",
            origin: "generation",
            storageProvider: artifact.storageProvider,
            storageObjectId: artifact.storageObjectId,
            storageUrl: artifact.storageUrl,
            mimeType: artifact.mimeType,
            bytes: BigInt(artifact.bytes),
            width: artifact.width,
            height: artifact.height,
            durationMs: artifact.durationMs,
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
        await tx.videoGenerationVideo.create({
          data: {
            generationId,
            assetId: asset.id,
            url: artifact.storageUrl,
            width: artifact.width,
            height: artifact.height,
            durationSec: artifact.durationMs === null ? null : Math.round(artifact.durationMs / 1_000),
          },
        });
      }
    });
    return;
  }
  if (lease) {
    await prisma.$transaction(async (tx) => {
      const updated = await tx.videoGeneration.updateMany({
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
        throw new GenerationLeaseLostError("video", generationId);
      }
      if (result?.videos?.length) {
        await tx.videoGenerationVideo.deleteMany({ where: { generationId } });
        await tx.videoGenerationVideo.createMany({
          data: result.videos.map((video) => ({
            generationId,
            url: video.url,
            width: video.width ?? null,
            height: video.height ?? null,
            durationSec: video.durationSec ?? null,
          })),
        });
      }
    });
    return;
  }

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

export async function updateVideoGenerationStatus(
  generationId: string,
  status: VideoGenerationStatus,
  progress: number,
  errorMessage?: string,
  lease?: GenerationLease,
) {
  if (lease) {
    const updated = await prisma.videoGeneration.updateMany({
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
      throw new GenerationLeaseLostError("video", generationId);
    }
    return prisma.videoGeneration.findUnique({ where: { id: generationId } });
  }
  return prisma.videoGeneration.update({
    where: { id: generationId },
    data: {
      status,
      progress,
      errorMessage: errorMessage ?? null,
    },
  });
}

export async function getVideoGenerationByRequestId(
  requestId: string,
  ownerEmail: string,
  apiKeyId?: string | null,
) {
  return prisma.videoGeneration.findFirst({
    where: { requestId, ownerEmail, ...(apiKeyId ? { apiKeyId } : {}) },
    include: {
      videos: {
        orderBy: { createdAt: "asc" },
      },
    },
  });
}
