import { snapshotRequest } from '@/server/generation-request/request-snapshot';
import { Prisma } from "@prisma/client";
import { prisma } from "@/server/db/prisma";
import type { AudioGenerationFormValues } from "@/features/audio-generation/model/audio-generation-schema";
import type {
  AudioGenerationResponse,
  AudioGenerationStatus,
} from "@/features/audio-generation/model/audio-generation-types";
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

export async function createAudioGenerationRecord(
  requestId: string,
  payload: AudioGenerationFormValues,
  ownerEmail: string,
  apiKeyId: string | null = null,
  graphNodeId: string | null = null,
  requestSnapshot?: Record<string, Prisma.InputJsonValue | null>,
  inputAssetRefs?: readonly GenerationInputAssetRef[],
) {
  const requestParams: Record<string, Prisma.InputJsonValue | null> = {};
  Object.entries(payload).forEach(([key, value]) => {
    if (value === undefined) {
      return;
    }
    requestParams[key] =
      typeof value === "string"
        ? value.trim() || null
        : JSON.parse(JSON.stringify(value));
  });

  const refs = inputAssetRefs ?? inputAssetRefsFromSnapshot("audio", requestSnapshot ?? requestParams);
  const persistedRequest = await snapshotRequest("audio", requestSnapshot ?? requestParams, {
    inputAssets: inputAssetRefs,
  });
  const data = {
    requestId,
    ownerEmail,
    apiKeyId,
    prompt: payload.prompt ?? "",
    requestParams: persistedRequest,
    historyMetadata: historyMetadataFromRequest(persistedRequest) ?? undefined,
    modelKey: payload.model,
    graphNodeId,
    status: "pending" as const,
    progress: 0,
  };
  if (refs.length === 0) return prisma.audioGeneration.create({ data });
  return prisma.$transaction(async (tx) => {
    const record = await tx.audioGeneration.create({ data });
    await linkGenerationInputAssets(tx, {
      requestId,
      generationType: "audio",
      ownerEmail,
      refs,
    });
    return record;
  });
}

export async function saveAudioGenerationResult(
  generationId: string,
  status: AudioGenerationStatus,
  progress: number,
  result?: AudioGenerationResponse["result"],
  errorMessage?: string,
  lease?: GenerationLease,
  artifacts?: GeneratedMediaArtifact[],
) {
  if (artifacts?.length) {
    await prisma.$transaction(async (tx) => {
      const updated = lease
        ? await tx.audioGeneration.updateMany({
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
        : await tx.audioGeneration.updateMany({
            where: { id: generationId },
            data: { status, progress, errorMessage: errorMessage ?? null },
          });
      if (updated.count !== 1) {
        if (lease) throw new GenerationLeaseLostError("audio", generationId);
        throw new Error("GENERATION_STATE_CONFLICT");
      }
      const generation = await tx.audioGeneration.findUnique({
        where: { id: generationId },
        select: { ownerEmail: true, requestId: true },
      });
      if (!generation?.ownerEmail) throw new Error("GENERATION_OWNER_REQUIRED");
      await tx.audioGenerationAudio.deleteMany({ where: { generationId } });
      for (const artifact of artifacts) {
        const asset = await tx.mediaAsset.create({
          data: {
            ownerEmail: generation.ownerEmail,
            type: "audio",
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
        await tx.audioGenerationAudio.create({
          data: {
            generationId,
            assetId: asset.id,
            url: artifact.storageUrl,
            durationSec: artifact.durationMs === null ? null : Math.round(artifact.durationMs / 1_000),
          },
        });
      }
    });
    return;
  }
  if (lease) {
    await prisma.$transaction(async (tx) => {
      const updated = await tx.audioGeneration.updateMany({
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
        throw new GenerationLeaseLostError("audio", generationId);
      }
      if (result?.audios?.length) {
        await tx.audioGenerationAudio.deleteMany({ where: { generationId } });
        await tx.audioGenerationAudio.createMany({
          data: result.audios.map((audio) => ({
            generationId,
            url: audio.url,
            durationSec: audio.durationSec ?? null,
          })),
        });
      }
    });
    return;
  }

  const operations: Prisma.PrismaPromise<unknown>[] = [
    prisma.audioGeneration.update({
      where: { id: generationId },
      data: {
        status,
        progress,
        errorMessage: errorMessage ?? null,
      },
    }),
  ];

  if (result?.audios?.length) {
    operations.push(
      prisma.audioGenerationAudio.deleteMany({
        where: { generationId },
      }),
    );
    operations.push(
      prisma.audioGenerationAudio.createMany({
        data: result.audios.map((audio) => ({
          generationId,
          url: audio.url,
          durationSec: audio.durationSec ?? null,
        })),
      }),
    );
  }

  await prisma.$transaction(operations);
}

export async function updateAudioGenerationStatus(
  generationId: string,
  status: AudioGenerationStatus,
  progress: number,
  errorMessage?: string,
  lease?: GenerationLease,
) {
  if (lease) {
    const updated = await prisma.audioGeneration.updateMany({
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
      throw new GenerationLeaseLostError("audio", generationId);
    }
    return prisma.audioGeneration.findUnique({ where: { id: generationId } });
  }
  return prisma.audioGeneration.update({
    where: { id: generationId },
    data: {
      status,
      progress,
      errorMessage: errorMessage ?? null,
    },
  });
}

export async function getAudioGenerationByRequestId(
  requestId: string,
  ownerEmail: string,
  apiKeyId?: string | null,
) {
  return prisma.audioGeneration.findFirst({
    where: { requestId, ownerEmail, ...(apiKeyId ? { apiKeyId } : {}) },
    include: {
      audios: {
        orderBy: { createdAt: "asc" },
      },
    },
  });
}
