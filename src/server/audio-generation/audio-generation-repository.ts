import { Prisma } from "@prisma/client";
import { prisma } from "@/server/db/prisma";
import type { AudioGenerationFormValues } from "@/features/audio-generation/model/audio-generation-schema";
import type {
  AudioGenerationResponse,
  AudioGenerationStatus,
} from "@/features/audio-generation/model/audio-generation-types";

export async function createAudioGenerationRecord(
  requestId: string,
  payload: AudioGenerationFormValues,
  ownerEmail: string,
  apiKeyId: string | null = null,
) {
  const requestParams: Prisma.InputJsonValue = {
    model: payload.model,
    prompt: payload.prompt,
    voice: payload.voice ?? null,
    speed: payload.speed ?? null,
    seed: payload.seed || null,
  };

  return prisma.audioGeneration.create({
    data: {
      requestId,
      ownerEmail,
      apiKeyId,
      prompt: payload.prompt,
      requestParams,
      modelKey: payload.model,
      status: "pending",
      progress: 0,
    },
  });
}

export async function saveAudioGenerationResult(
  generationId: string,
  status: AudioGenerationStatus,
  progress: number,
  result?: AudioGenerationResponse["result"],
  errorMessage?: string,
) {
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
) {
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
) {
  return prisma.audioGeneration.findFirst({
    where: { requestId, ownerEmail },
    include: {
      audios: {
        orderBy: { createdAt: "asc" },
      },
    },
  });
}
