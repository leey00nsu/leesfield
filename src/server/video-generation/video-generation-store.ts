import type { VideoGenerationFormValues } from "@/features/video-generation/model/video-generation-schema";
import type {
  VideoGenerationResponse,
  VideoGenerationStatus,
} from "@/features/video-generation/model/video-generation-types";
import {
  getVideoGenerationByRequestId,
} from "@/server/video-generation/video-generation-repository";
import { submitVideoGeneration } from "@/server/video-generation/video-generation-submission";

export type VideoGenerationRecord = {
  id: string;
  status: VideoGenerationStatus;
  progress: number;
  result?: VideoGenerationResponse["result"];
  errorMessage?: string;
};

function mapRecord(
  record: Awaited<ReturnType<typeof getVideoGenerationByRequestId>>,
): VideoGenerationRecord | null {
  if (!record) return null;
  const videos = record.videos ?? [];
  const result = videos.length
    ? {
        videos: videos.map((video) => ({
          url: video.url,
          width: video.width ?? undefined,
          height: video.height ?? undefined,
          durationSec: video.durationSec ?? undefined,
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

export async function createMockVideoGenerationWithLimit(
  payload: VideoGenerationFormValues,
  ownerEmail: string,
  apiKeyId: string | null = null,
  requestId?: string,
) {
  const selectedRequestId = requestId ?? crypto.randomUUID();
  const { record } = await submitVideoGeneration({
    payload,
    ownerEmail,
    apiKeyId,
    requestId: selectedRequestId,
  });
  return {
    record: record satisfies VideoGenerationRecord,
    latest: null,
  };
}

export async function getVideoGeneration(
  id: string,
  ownerEmail: string,
  apiKeyId?: string | null,
) {
  const record = await getVideoGenerationByRequestId(id, ownerEmail, apiKeyId);
  return mapRecord(record);
}
