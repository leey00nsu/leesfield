import type {
  AudioGenerationStatus,
  ImageGenerationStatus,
  VideoGenerationStatus,
} from "@prisma/client";
import { prisma } from "@/server/db/prisma";
import {
  buildAudioWhere,
  buildImageWhere,
  buildVideoWhere,
  parseHistoryQuery,
} from "@/server/history/lib/history-query";

const ACTIVE_IMAGE_STATUSES: ImageGenerationStatus[] = ["pending", "processing"];
const ACTIVE_VIDEO_STATUSES: VideoGenerationStatus[] = ["pending", "processing"];
const ACTIVE_AUDIO_STATUSES: AudioGenerationStatus[] = ["pending", "processing"];

type ActiveStatus = {
  activeCount: number;
  latestUpdatedAt: Date | null;
};

function maxDate(a: Date | null, b: Date | null) {
  if (!a) return b;
  if (!b) return a;
  return a > b ? a : b;
}

async function getActiveImageStatus(
  where: Record<string, unknown>,
): Promise<ActiveStatus> {
  const [activeCount, latest] = await Promise.all([
    prisma.imageGeneration.count({
      where: {
        ...where,
        status: { in: ACTIVE_IMAGE_STATUSES },
      },
    }),
    prisma.imageGeneration.findFirst({
      where: {
        ...where,
        status: { in: ACTIVE_IMAGE_STATUSES },
      },
      orderBy: { updatedAt: "desc" },
      select: { updatedAt: true },
    }),
  ]);

  return {
    activeCount,
    latestUpdatedAt: latest?.updatedAt ?? null,
  };
}

async function getActiveVideoStatus(
  where: Record<string, unknown>,
): Promise<ActiveStatus> {
  const [activeCount, latest] = await Promise.all([
    prisma.videoGeneration.count({
      where: {
        ...where,
        status: { in: ACTIVE_VIDEO_STATUSES },
      },
    }),
    prisma.videoGeneration.findFirst({
      where: {
        ...where,
        status: { in: ACTIVE_VIDEO_STATUSES },
      },
      orderBy: { updatedAt: "desc" },
      select: { updatedAt: true },
    }),
  ]);

  return {
    activeCount,
    latestUpdatedAt: latest?.updatedAt ?? null,
  };
}

async function getActiveAudioStatus(
  where: Record<string, unknown>,
): Promise<ActiveStatus> {
  const [activeCount, latest] = await Promise.all([
    prisma.audioGeneration.count({
      where: {
        ...where,
        status: { in: ACTIVE_AUDIO_STATUSES },
      },
    }),
    prisma.audioGeneration.findFirst({
      where: {
        ...where,
        status: { in: ACTIVE_AUDIO_STATUSES },
      },
      orderBy: { updatedAt: "desc" },
      select: { updatedAt: true },
    }),
  ]);

  return {
    activeCount,
    latestUpdatedAt: latest?.updatedAt ?? null,
  };
}

export async function getHistoryStatus(
  searchParams: URLSearchParams,
  ownerEmail: string,
) {
  const query = parseHistoryQuery(searchParams);

  if (query.type === "image") {
    const where = { ownerEmail, ...buildImageWhere(query) };
    const status = await getActiveImageStatus(where);
    return {
      hasActive: status.activeCount > 0,
      activeCount: status.activeCount,
      latestUpdatedAt: status.latestUpdatedAt?.toISOString() ?? null,
    };
  }

  if (query.type === "video") {
    const where = { ownerEmail, ...buildVideoWhere(query) };
    const status = await getActiveVideoStatus(where);
    return {
      hasActive: status.activeCount > 0,
      activeCount: status.activeCount,
      latestUpdatedAt: status.latestUpdatedAt?.toISOString() ?? null,
    };
  }

  if (query.type === "audio") {
    const where = { ownerEmail, ...buildAudioWhere(query) };
    const status = await getActiveAudioStatus(where);
    return {
      hasActive: status.activeCount > 0,
      activeCount: status.activeCount,
      latestUpdatedAt: status.latestUpdatedAt?.toISOString() ?? null,
    };
  }

  const imageWhere = { ownerEmail, ...buildImageWhere(query) };
  const videoWhere = { ownerEmail, ...buildVideoWhere(query) };
  const audioWhere = { ownerEmail, ...buildAudioWhere(query) };

  const [imageStatus, videoStatus, audioStatus] = await Promise.all([
    getActiveImageStatus(imageWhere),
    getActiveVideoStatus(videoWhere),
    getActiveAudioStatus(audioWhere),
  ]);

  const activeCount =
    imageStatus.activeCount + videoStatus.activeCount + audioStatus.activeCount;
  const latestUpdatedAt = maxDate(
    maxDate(imageStatus.latestUpdatedAt, videoStatus.latestUpdatedAt),
    audioStatus.latestUpdatedAt,
  );

  return {
    hasActive: activeCount > 0,
    activeCount,
    latestUpdatedAt: latestUpdatedAt?.toISOString() ?? null,
  };
}
