import type { VideoGenerationFormValues } from "@/features/video-generation/model/video-generation-schema";
import type {
  VideoGenerationResponse,
  VideoGenerationStatus,
} from "@/features/video-generation/model/video-generation-types";
import { uploadInputImages } from "@/server/shared/input-image-uploader";
import {
  createVideoGenerationRecord,
  getVideoGenerationByRequestId,
} from "@/server/video-generation/video-generation-repository";

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
) {
  const requestId = crypto.randomUUID();
  const initImage = payload.initImage?.trim() ?? "";
  const resolvedPayload = initImage
    ? {
        ...payload,
        initImage: (await uploadInputImages(requestId, [initImage]))[0] ?? "",
      }
    : payload;
  const record = await createVideoGenerationRecord(
    requestId,
    resolvedPayload,
    ownerEmail,
  );
  return {
    record: {
      id: record.requestId,
      status: record.status,
      progress: record.progress,
    } satisfies VideoGenerationRecord,
    latest: null,
  };
}

export async function getVideoGeneration(id: string, ownerEmail: string) {
  const record = await getVideoGenerationByRequestId(id, ownerEmail);
  return mapRecord(record);
}
