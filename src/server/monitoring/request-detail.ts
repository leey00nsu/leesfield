import { requestSettings } from "./request-settings";
import { parseImageVariants, type ImageVariants } from "@/shared/media-assets/image-variants";
import { prisma } from "@/server/db/prisma";
import { measureDatabase } from "@/server/observability/request-observability";
import {
  extractInputAudios,
  extractInputImages,
  extractReferenceText,
} from "@/server/history/lib/history-query";

export type MonitoringRequestAsset = {
  imageVariants?: ImageVariants | null;
  url: string;
  width: number | null;
  height: number | null;
  durationSec: number | null;
};

export type MonitoringRequestDetail = {
  requestParameters?: Record<string, unknown> | null;
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

type InputAssetRow = {
  field: string;
  sortOrder: number;
  asset: {
    type: "image" | "audio" | "video";
    storageUrl: string | null;
    legacyUrl: string | null;
  };
};

async function listInputAssets(
  generationType: "image" | "video" | "audio",
  requestId: string,
): Promise<InputAssetRow[]> {
  if (!("generationInputAsset" in prisma)) return [];
  return prisma.generationInputAsset.findMany({
    where: { requestId, generationType },
    orderBy: [{ field: "asc" }, { sortOrder: "asc" }],
    select: {
      field: true,
      sortOrder: true,
      asset: { select: { type: true, storageUrl: true, legacyUrl: true } },
    },
  }) as Promise<InputAssetRow[]>;
}

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

function inputAssetUrls(
  rows: readonly InputAssetRow[] | null | undefined,
  type: InputAssetRow["asset"]["type"],
) {
  return (rows ?? [])
    .filter((row) => row.asset.type === type)
    .sort((left, right) => left.sortOrder - right.sortOrder || left.field.localeCompare(right.field))
    .flatMap((row) => {
      const url = row.asset.storageUrl ?? row.asset.legacyUrl;
      return url ? [url] : [];
    });
}

async function getMonitoringRequestDetailUnobserved(
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
            asset: {select: {imageVariants: true}},
            width: true,
            height: true,
          },
        },
      },
    });

    if (!record) return null;

    const inputAssets = await listInputAssets("image", record.requestId);

    const messages = splitDetailMessage(record.status, record.errorMessage);

    return {
      id: record.requestId,
      type: "image",
      status: record.status,
      model: record.modelKey ?? null,
      requestParameters: requestSettings(record.requestParams),
      prompt: record.prompt,
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.updatedAt.toISOString(),
      durationMs: toDurationMs(record.createdAt, record.updatedAt, record.status),
      progress: record.progress,
      errorMessage: messages.errorMessage,
      warningMessage: messages.warningMessage,
      inputImages: [
        ...inputAssetUrls(inputAssets, "image"),
        ...extractInputImages(record.requestParams),
      ],
      inputAudios: [],
      referenceText: null,
      assets: record.images.map((image) => ({
        url: image.url,
        imageVariants: parseImageVariants(image.asset?.imageVariants),
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

    const inputAssets = await listInputAssets("audio", record.requestId);

    const messages = splitDetailMessage(record.status, record.errorMessage);

    return {
      id: record.requestId,
      type: "audio",
      status: record.status,
      model: record.modelKey ?? null,
      requestParameters: requestSettings(record.requestParams),
      prompt: record.prompt,
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.updatedAt.toISOString(),
      durationMs: toDurationMs(record.createdAt, record.updatedAt, record.status),
      progress: record.progress,
      errorMessage: messages.errorMessage,
      warningMessage: messages.warningMessage,
      inputImages: [
        ...inputAssetUrls(inputAssets, "image"),
        ...extractInputImages(record.requestParams),
      ],
      inputAudios: [
        ...inputAssetUrls(inputAssets, "audio"),
        ...extractInputAudios(record.requestParams),
      ],
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

  const inputAssets = await listInputAssets("video", record.requestId);

  const messages = splitDetailMessage(record.status, record.errorMessage);

  return {
    id: record.requestId,
    type: "video",
    status: record.status,
    model: record.modelKey ?? null,
      requestParameters: requestSettings(record.requestParams),
    prompt: record.prompt,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
    durationMs: toDurationMs(record.createdAt, record.updatedAt, record.status),
    progress: record.progress,
    errorMessage: messages.errorMessage,
    warningMessage: messages.warningMessage,
    inputImages: [
      ...inputAssetUrls(inputAssets, "image"),
      ...extractInputImages(record.requestParams),
    ],
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

export async function getMonitoringRequestDetail(
  type: "image" | "video" | "audio",
  requestId: string,
) {
  return measureDatabase("monitoring.request-detail", () =>
    getMonitoringRequestDetailUnobserved(type, requestId),
  );
}
