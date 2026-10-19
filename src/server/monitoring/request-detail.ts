import { generationOutputUrl, generationOutputAssetSelect, generationOutputDuration } from "@/server/history/generation-output-availability";
import { historyRequestSettings } from "@/server/history/history-authoring-references";
import type { HistoryInputMedia } from "@/shared/generation/history-detail";
import { promptProvenanceSchema, type PromptProvenance } from "@/shared/generation-graph/prompt-provenance";
import { recordObject } from "@/server/generation-request/request-snapshot";
import { historyPromptAuthoring } from "@/server/history/history-prompt-authoring";
import type { PromptSource } from "@/shared/generation-graph/prompt-provenance";
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
  inputPrompt?: string | null;
  localPrompt?: string | null;
  connectedPrompt?: string | null;
  promptSources?: Array<Omit<PromptSource, "sources">>;
  inputMedia?: HistoryInputMedia[];
  promptProvenance?: PromptProvenance | null;
  requestParameters?: Record<string, unknown> | null;
  id: string;
  type: "image" | "video" | "audio";
  status: string;
  model: string | null;
  prompt: string;
  createdAt: string;
  finishedAt?: string | null;
  updatedAt: string;
  durationMs: number | null;
  progress: number | null;
  errorMessage: string | null;
  warningMessage: string | null;
  inputImages: string[];
  inputAudios: string[];
  inputVideos?: string[];
  referenceText: string | null;
  assets: MonitoringRequestAsset[];
};

type InputAssetRow = {
  assetId: string;
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
  ownerEmail?: string,
): Promise<InputAssetRow[]> {
  if (!("generationInputAsset" in prisma)) return [];
  return prisma.generationInputAsset.findMany({
    where: { requestId, generationType, ...(ownerEmail !== undefined ? { ownerEmail, asset: { ownerEmail } } : {}) },
    orderBy: [{ field: "asc" }, { sortOrder: "asc" }],
    select: {
      field: true,
      assetId: true,
      sortOrder: true,
      asset: { select: { type: true, storageUrl: true, legacyUrl: true } },
    },
  }) as Promise<InputAssetRow[]>;
}

const FINISHED_STATUSES = new Set(["completed", "failed", "cancelled"]);

function toDurationMs(createdAt: Date, finishedAt: Date | null | undefined, status: string) {
  if (!FINISHED_STATUSES.has(status) || !finishedAt) return null;
  return Math.max(0, finishedAt.getTime() - createdAt.getTime());
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

function snapshotDetails(snapshot: unknown, rows: InputAssetRow[], finalPrompt: string) {
  const parsed = promptProvenanceSchema.safeParse(recordObject(snapshot).promptProvenance);
  const flatten = (sources: PromptSource[]): Array<Omit<PromptSource, "sources">> => sources.flatMap(({ sources: children, ...source }) => [source, ...flatten(children ?? [])]);
  return {
    inputPrompt: historyPromptAuthoring(snapshot, finalPrompt).inputPrompt,
    localPrompt: parsed.success ? parsed.data.localPrompt : null,
    connectedPrompt: parsed.success ? parsed.data.connectedPrompt : null,
    promptSources: parsed.success ? flatten(parsed.data.sources) : [],
    promptProvenance: parsed.success ? parsed.data : null,
    inputMedia: rows.flatMap(row => {
      const url = row.asset.storageUrl ?? row.asset.legacyUrl;
      return url ? [{ assetId: row.assetId ?? null, type: row.asset.type, role: row.field, sortOrder: row.sortOrder, url }] : [];
    }),
  };
}

async function getMonitoringRequestDetailUnobserved(
  type: "image" | "video" | "audio",
  requestId: string,
  ownerEmail?: string,
): Promise<MonitoringRequestDetail | null> {
  if (type === "image") {
    const record = await prisma.imageGeneration.findUnique({
      where: { requestId, ...(ownerEmail !== undefined ? { ownerEmail } : {}) },
      select: {
        requestId: true,
        status: true,
        modelKey: true,
        prompt: true,
        requestParams: true,
        createdAt: true,
        updatedAt: true,
        finishedAt: true,
        progress: true,
        errorMessage: true,
        images: {
          select: {
            url: true,
            assetId: true,
            asset: { select: generationOutputAssetSelect },
            width: true,
            height: true,
          },
        },
      },
    });

    if (!record) return null;

    const inputAssets = await listInputAssets("image", record.requestId, ownerEmail);

    const messages = splitDetailMessage(record.status, record.errorMessage);

    return {
      id: record.requestId,
      ...snapshotDetails(record.requestParams, inputAssets, record.prompt),
      type: "image",
      status: record.status,
      model: record.modelKey ?? null,
      requestParameters: await historyRequestSettings(type, record.modelKey, record.requestParams),
      prompt: record.prompt,
      createdAt: record.createdAt.toISOString(),
      finishedAt: record.finishedAt?.toISOString() ?? null,
      updatedAt: record.updatedAt.toISOString(),
      durationMs: toDurationMs(record.createdAt, record.finishedAt, record.status),
      progress: record.progress,
      errorMessage: messages.errorMessage,
      warningMessage: messages.warningMessage,
      inputImages: [
        ...inputAssetUrls(inputAssets, "image"),
        ...extractInputImages(record.requestParams),
      ],
      inputAudios: inputAssetUrls(inputAssets, "audio"),
      inputVideos: inputAssetUrls(inputAssets, "video"),
      referenceText: null,
      assets: record.images.filter((output) => Boolean(generationOutputUrl(output))).map((image) => ({
        url: generationOutputUrl(image)!,
        imageVariants: parseImageVariants(image.asset?.imageVariants),
        width: image.width ?? null,
        height: image.height ?? null,
        durationSec: null,
      })),
    };
  }

  if (type === "audio") {
    const record = await prisma.audioGeneration.findUnique({
      where: { requestId, ...(ownerEmail !== undefined ? { ownerEmail } : {}) },
      select: {
        requestId: true,
        status: true,
        modelKey: true,
        prompt: true,
        requestParams: true,
        createdAt: true,
        updatedAt: true,
        finishedAt: true,
        progress: true,
        errorMessage: true,
        audios: {
          select: {
            assetId: true, asset: { select: generationOutputAssetSelect },
            url: true,
            durationSec: true,
          },
        },
      },
    });

    if (!record) return null;

    const inputAssets = await listInputAssets("audio", record.requestId, ownerEmail);

    const messages = splitDetailMessage(record.status, record.errorMessage);

    return {
      id: record.requestId,
      ...snapshotDetails(record.requestParams, inputAssets, record.prompt),
      type: "audio",
      status: record.status,
      model: record.modelKey ?? null,
      requestParameters: await historyRequestSettings(type, record.modelKey, record.requestParams),
      prompt: record.prompt,
      createdAt: record.createdAt.toISOString(),
      finishedAt: record.finishedAt?.toISOString() ?? null,
      updatedAt: record.updatedAt.toISOString(),
      durationMs: toDurationMs(record.createdAt, record.finishedAt, record.status),
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
      inputVideos: inputAssetUrls(inputAssets, "video"),
      assets: record.audios.filter((output) => Boolean(generationOutputUrl(output))).map((audio) => ({
        url: generationOutputUrl(audio)!,
        width: null,
        height: null,
        durationSec: generationOutputDuration(audio),
      })),
    };
  }

  const record = await prisma.videoGeneration.findUnique({
    where: { requestId, ...(ownerEmail !== undefined ? { ownerEmail } : {}) },
    select: {
      requestId: true,
      status: true,
      modelKey: true,
      prompt: true,
      requestParams: true,
      createdAt: true,
      updatedAt: true,
        finishedAt: true,
      progress: true,
      errorMessage: true,
      videos: {
        select: {
          assetId: true, asset: { select: generationOutputAssetSelect },
          url: true,
          width: true,
          height: true,
          durationSec: true,
        },
      },
    },
  });

  if (!record) return null;

  const inputAssets = await listInputAssets("video", record.requestId, ownerEmail);

  const messages = splitDetailMessage(record.status, record.errorMessage);

  return {
    id: record.requestId,
    ...snapshotDetails(record.requestParams, inputAssets, record.prompt),
    type: "video",
    status: record.status,
    model: record.modelKey ?? null,
      requestParameters: await historyRequestSettings(type, record.modelKey, record.requestParams),
    prompt: record.prompt,
    createdAt: record.createdAt.toISOString(),
      finishedAt: record.finishedAt?.toISOString() ?? null,
    updatedAt: record.updatedAt.toISOString(),
    durationMs: toDurationMs(record.createdAt, record.finishedAt, record.status),
    progress: record.progress,
    errorMessage: messages.errorMessage,
    warningMessage: messages.warningMessage,
    inputImages: [
      ...inputAssetUrls(inputAssets, "image"),
      ...extractInputImages(record.requestParams),
    ],
    inputAudios: inputAssetUrls(inputAssets, "audio"),
    inputVideos: inputAssetUrls(inputAssets, "video"),
    referenceText: null,
    assets: record.videos.filter((output) => Boolean(generationOutputUrl(output))).map((video) => ({
      url: generationOutputUrl(video)!,
      width: video.width ?? null,
      height: video.height ?? null,
      durationSec: generationOutputDuration(video),
    })),
  };
}

export async function getMonitoringRequestDetail(
  type: "image" | "video" | "audio",
  requestId: string,
  ownerEmail?: string,
) {
  return measureDatabase("monitoring.request-detail", () =>
    getMonitoringRequestDetailUnobserved(type, requestId, ownerEmail),
  );
}
