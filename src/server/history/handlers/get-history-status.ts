import {assistantHistoryWhere} from "../assistant-history";
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

const ACTIVE_IMAGE_STATUSES: ImageGenerationStatus[] = ["pending", "processing", "uploading"];
const ACTIVE_VIDEO_STATUSES: VideoGenerationStatus[] = ["pending", "processing", "uploading"];
const ACTIVE_AUDIO_STATUSES: AudioGenerationStatus[] = ["pending", "processing", "uploading"];

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
  options:{includeAssistant?:boolean}={},
) {
  const query = parseHistoryQuery(searchParams);
  const assistantStatus=async():Promise<ActiveStatus>=>{
    if(!options.includeAssistant||query.hidden)return {activeCount:0,latestUpdatedAt:null};
    const where={...assistantHistoryWhere(query,ownerEmail),status:{in:["pending","processing"] as ("pending"|"processing")[]}};
    const [activeCount,latest]=await Promise.all([prisma.assistantExecution.count({where}),prisma.assistantExecution.findFirst({where,orderBy:{updatedAt:"desc"},select:{updatedAt:true}})]);
    return {activeCount,latestUpdatedAt:latest?.updatedAt??null};
  };
  if(query.type==="assistant"){const result=await assistantStatus();return {hasActive:result.activeCount>0,activeCount:result.activeCount,latestUpdatedAt:result.latestUpdatedAt?.toISOString()??null};}

  if (query.type === "image") {
    const where = { ownerEmail, hiddenAt: query.hidden ? { not: null } : null, ...buildImageWhere(query) };
    const status = await getActiveImageStatus(where);
    return {
      hasActive: status.activeCount > 0,
      activeCount: status.activeCount,
      latestUpdatedAt: status.latestUpdatedAt?.toISOString() ?? null,
    };
  }

  if (query.type === "video") {
    const where = { ownerEmail, hiddenAt: query.hidden ? { not: null } : null, ...buildVideoWhere(query) };
    const status = await getActiveVideoStatus(where);
    return {
      hasActive: status.activeCount > 0,
      activeCount: status.activeCount,
      latestUpdatedAt: status.latestUpdatedAt?.toISOString() ?? null,
    };
  }

  if (query.type === "audio") {
    const where = { ownerEmail, hiddenAt: query.hidden ? { not: null } : null, ...buildAudioWhere(query) };
    const status = await getActiveAudioStatus(where);
    return {
      hasActive: status.activeCount > 0,
      activeCount: status.activeCount,
      latestUpdatedAt: status.latestUpdatedAt?.toISOString() ?? null,
    };
  }

  const imageWhere = { ownerEmail, hiddenAt: query.hidden ? { not: null } : null, ...buildImageWhere(query) };
  const videoWhere = { ownerEmail, hiddenAt: query.hidden ? { not: null } : null, ...buildVideoWhere(query) };
  const audioWhere = { ownerEmail, hiddenAt: query.hidden ? { not: null } : null, ...buildAudioWhere(query) };

  const [imageStatus, videoStatus, audioStatus,assistant] = await Promise.all([
    getActiveImageStatus(imageWhere),
    getActiveVideoStatus(videoWhere),
    getActiveAudioStatus(audioWhere),
    assistantStatus(),
  ]);

  const activeCount =
    imageStatus.activeCount + videoStatus.activeCount + audioStatus.activeCount+assistant.activeCount;
  const latestUpdatedAt = maxDate(maxDate(maxDate(imageStatus.latestUpdatedAt, videoStatus.latestUpdatedAt),audioStatus.latestUpdatedAt),assistant.latestUpdatedAt);

  return {
    hasActive: activeCount > 0,
    activeCount,
    latestUpdatedAt: latestUpdatedAt?.toISOString() ?? null,
  };
}
