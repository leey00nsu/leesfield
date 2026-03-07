import type { AudioGenerationFormValues } from "@/features/audio-generation/model/audio-generation-schema";
import type {
  AudioGenerationResponse,
  AudioGenerationStatus,
} from "@/features/audio-generation/model/audio-generation-types";
import {
  createAudioGenerationRecord,
  getAudioGenerationByRequestId,
} from "@/server/audio-generation/audio-generation-repository";

export type AudioGenerationRecord = {
  id: string;
  status: AudioGenerationStatus;
  progress: number;
  result?: AudioGenerationResponse["result"];
  errorMessage?: string;
};

function mapRecord(
  record: Awaited<ReturnType<typeof getAudioGenerationByRequestId>>,
): AudioGenerationRecord | null {
  if (!record) return null;
  const audios = record.audios ?? [];
  const result = audios.length
    ? {
        audios: audios.map((audio) => ({
          url: audio.url,
          durationSec: audio.durationSec ?? undefined,
        })),
      }
    : undefined;

  return {
    id: record.requestId,
    status: record.status,
    progress: record.progress,
    result,
    errorMessage: record.errorMessage ?? undefined,
  };
}

export async function createMockAudioGenerationWithLimit(
  payload: AudioGenerationFormValues,
  ownerEmail: string,
  apiKeyId: string | null = null,
) {
  const requestId = crypto.randomUUID();
  const record = await createAudioGenerationRecord(
    requestId,
    payload,
    ownerEmail,
    apiKeyId,
  );

  return {
    record: {
      id: record.requestId,
      status: record.status,
      progress: record.progress,
    } satisfies AudioGenerationRecord,
    latest: null,
  };
}

export async function getAudioGeneration(id: string, ownerEmail: string) {
  const record = await getAudioGenerationByRequestId(id, ownerEmail);
  return mapRecord(record);
}
