import { prisma } from "@/server/db/prisma";
import {
  extractInputAudios,
  extractInputImages,
  extractReferenceText,
} from "@/server/history/lib/history-query";

export type MonitoringRequestAsset = {
  url: string;
  width: number | null;
  height: number | null;
  durationSec: number | null;
};

export type MonitoringRequestDetail = {
  id: string;
  type: "image" | "video" | "audio";
  status: string;
  model: string | null;
  prompt: string;
  createdAt: string;
  updatedAt: string;
  durationMs: number | null;
  progress: number | null;
  errorMessage: string | null;
  warningMessage: string | null;
  inputImages: string[];
  inputAudios: string[];
  referenceText: string | null;
  assets: MonitoringRequestAsset[];
};

const FINISHED_STATUSES = new Set(["completed", "failed"]);

function toDurationMs(createdAt: Date, updatedAt: Date, status: string) {
  if (!FINISHED_STATUSES.has(status)) return null;
  return Math.max(0, updatedAt.getTime() - createdAt.getTime());
}

function splitDetailMessage(status: string, message: string | null) {
  if (!message) {
    return {
      errorMessage: null,
      warningMessage: null,
    };
  }

  if (status === "completed") {
    return {
      errorMessage: null,
      warningMessage: message,
    };
  }

  return {
    errorMessage: message,
    warningMessage: null,
  };
}

export async function getMonitoringRequestDetail(
  type: "image" | "video" | "audio",
  requestId: string,
): Promise<MonitoringRequestDetail | null> {
  if (type === "image") {
    const record = await prisma.imageGeneration.findUnique({
      where: { requestId },
      select: {
        requestId: true,
        status: true,
        modelKey: true,
        prompt: true,
        requestParams: true,
        createdAt: true,
        updatedAt: true,
        progress: true,
        errorMessage: true,
        images: {
          select: {
            url: true,
            width: true,
            height: true,
          },
        },
      },
    });

    if (!record) return null;

    const messages = splitDetailMessage(record.status, record.errorMessage);

    return {
      id: record.requestId,
      type: "image",
      status: record.status,
      model: record.modelKey ?? null,
      prompt: record.prompt,
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.updatedAt.toISOString(),
      durationMs: toDurationMs(record.createdAt, record.updatedAt, record.status),
      progress: record.progress,
      errorMessage: messages.errorMessage,
      warningMessage: messages.warningMessage,
      inputImages: extractInputImages(record.requestParams),
      inputAudios: [],
      referenceText: null,
      assets: record.images.map((image) => ({
        url: image.url,
        width: image.width ?? null,
        height: image.height ?? null,
        durationSec: null,
      })),
    };
  }

  if (type === "audio") {
    const record = await prisma.audioGeneration.findUnique({
      where: { requestId },
      select: {
        requestId: true,
        status: true,
        modelKey: true,
        prompt: true,
        requestParams: true,
        createdAt: true,
        updatedAt: true,
        progress: true,
        errorMessage: true,
        audios: {
          select: {
            url: true,
            durationSec: true,
          },
        },
      },
    });

    if (!record) return null;

    const messages = splitDetailMessage(record.status, record.errorMessage);

    return {
      id: record.requestId,
      type: "audio",
      status: record.status,
      model: record.modelKey ?? null,
      prompt: record.prompt,
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.updatedAt.toISOString(),
      durationMs: toDurationMs(record.createdAt, record.updatedAt, record.status),
      progress: record.progress,
      errorMessage: messages.errorMessage,
      warningMessage: messages.warningMessage,
      inputImages: extractInputImages(record.requestParams),
      inputAudios: extractInputAudios(record.requestParams),
      referenceText: extractReferenceText(record.requestParams),
      assets: record.audios.map((audio) => ({
        url: audio.url,
        width: null,
        height: null,
        durationSec: audio.durationSec ?? null,
      })),
    };
  }

  const record = await prisma.videoGeneration.findUnique({
    where: { requestId },
    select: {
      requestId: true,
      status: true,
      modelKey: true,
      prompt: true,
      requestParams: true,
      createdAt: true,
      updatedAt: true,
      progress: true,
      errorMessage: true,
      videos: {
        select: {
          url: true,
          width: true,
          height: true,
          durationSec: true,
        },
      },
    },
  });

  if (!record) return null;

  const messages = splitDetailMessage(record.status, record.errorMessage);

  return {
    id: record.requestId,
    type: "video",
    status: record.status,
    model: record.modelKey ?? null,
    prompt: record.prompt,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
    durationMs: toDurationMs(record.createdAt, record.updatedAt, record.status),
    progress: record.progress,
    errorMessage: messages.errorMessage,
    warningMessage: messages.warningMessage,
    inputImages: extractInputImages(record.requestParams),
    inputAudios: [],
    referenceText: null,
    assets: record.videos.map((video) => ({
      url: video.url,
      width: video.width ?? null,
      height: video.height ?? null,
      durationSec: video.durationSec ?? null,
    })),
  };
}
