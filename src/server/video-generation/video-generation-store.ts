import type { VideoGenerationFormValues } from "@/features/video-generation/model/video-generation-schema";
import type {
  VideoGenerationResponse,
  VideoGenerationStatus,
} from "@/features/video-generation/model/video-generation-types";
import { prisma } from "@/server/db/prisma";
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

const ACTIVE_STATUSES: VideoGenerationStatus[] = ["pending", "processing"];
const EXPIRY_MS = 10 * 60 * 1000;
const reservationLocks = new Map<string, Promise<void>>();

async function withReservationLock<T>(key: string, task: () => Promise<T>) {
  const previous = reservationLocks.get(key) ?? Promise.resolve();
  let release = () => {};
  const current = new Promise<void>((resolve) => {
    release = resolve;
  });
  reservationLocks.set(key, previous.then(() => current));
  await previous;
  try {
    return await task();
  } finally {
    release();
    if (reservationLocks.get(key) === current) {
      reservationLocks.delete(key);
    }
  }
}

function buildReservationKey(
  ownerEmail: string,
  model: VideoGenerationFormValues["model"],
) {
  return `${ownerEmail}:${model}`;
}

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

export async function findActiveVideoGenerations(
  ownerEmail: string,
  model: VideoGenerationFormValues["model"],
) {
  const cutoff = new Date(Date.now() - EXPIRY_MS);
  const where = {
    ownerEmail,
    status: { in: ACTIVE_STATUSES },
    updatedAt: { gt: cutoff },
    requestParams: {
      path: ["model"],
      equals: model,
    },
  };

  const [count, latest] = await prisma.$transaction([
    prisma.videoGeneration.count({ where }),
    prisma.videoGeneration.findFirst({
      where,
      orderBy: { updatedAt: "desc" },
    }),
  ]);

  return {
    count,
    latest: latest
      ? ({
          id: latest.requestId,
          status: latest.status,
          progress: latest.progress,
        } satisfies VideoGenerationRecord)
      : null,
  };
}

export async function createMockVideoGenerationWithLimit(
  payload: VideoGenerationFormValues,
  ownerEmail: string,
  limit: number,
) {
  const requestId = crypto.randomUUID();

  if (!Number.isFinite(limit) || limit <= 0) {
    const record = await createVideoGenerationRecord(
      requestId,
      payload,
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

  return withReservationLock(
    buildReservationKey(ownerEmail, payload.model),
    async () => {
      const active = await findActiveVideoGenerations(ownerEmail, payload.model);
      if (active.count >= limit) {
        return { record: null, latest: active.latest };
      }
      const record = await createVideoGenerationRecord(
        requestId,
        payload,
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
    },
  );
}

export async function getVideoGeneration(id: string, ownerEmail: string) {
  const record = await getVideoGenerationByRequestId(id, ownerEmail);
  return mapRecord(record);
}
