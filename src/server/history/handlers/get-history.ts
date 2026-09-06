import type { Prisma } from "@prisma/client";

import type { GenerationHistoryItem } from "@/entities/generation/model/types";
import { prisma } from "@/server/db/prisma";
import { mediaAssetService } from "@/server/media-assets/media-asset-service";
import {
  buildAudioWhere,
  buildImageWhere,
  buildVideoWhere,
  extractInputAudios,
  extractInputImages,
  extractModel,
  extractReferenceText,
  parseHistoryQuery,
  toHistoryDurationMs,
  type HistoryQuery,
  type HistoryResponse,
} from "@/server/history/lib/history-query";

const emptyPage = Promise.resolve([[], 0] as const);

function snapshotString(params: unknown, key: string) {
  if (!params || typeof params !== "object" || Array.isArray(params)) return null;
  const value = (params as Record<string, unknown>)[key];
  return typeof value === "string" && value ? value : null;
}

function inputAssetIds(params: unknown) {
  if (!params || typeof params !== "object" || Array.isArray(params)) return [];
  const values = (params as Record<string, unknown>).inputAssets;
  if (!Array.isArray(values)) return [];
  return values.flatMap((value) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) return [];
    const assetId = (value as Record<string, unknown>).assetId;
    return typeof assetId === "string" && assetId ? [assetId] : [];
  });
}

async function resolvedAsset(
  ownerEmail: string,
  assetId: string | null | undefined,
  fallbackUrl: string | null,
) {
  if (!assetId) return { assetId: null, url: fallbackUrl };
  try {
    const asset = await mediaAssetService.get(ownerEmail, assetId);
    return { assetId: asset.id, url: asset.url };
  } catch {
    return { assetId, url: fallbackUrl };
  }
}

function graphProvenance(record: {
  graphNodeId: string | null;
  graphNode: { graphId: string } | null;
  requestParams: Prisma.JsonValue | null;
}) {
  return {
    graphId: record.graphNode?.graphId ?? snapshotString(record.requestParams, "graphId"),
    graphNodeId: record.graphNodeId ?? snapshotString(record.requestParams, "graphNodeId"),
  };
}

async function imageItem(ownerEmail: string, record: {
  requestId: string;
  status: string;
  prompt: string;
  requestParams: Prisma.JsonValue | null;
  graphNodeId: string | null;
  graphNode: { graphId: string } | null;
  progress: number;
  errorMessage: string | null;
  createdAt: Date;
  updatedAt: Date;
  images: Array<{ assetId: string | null; url: string }>;
}): Promise<GenerationHistoryItem> {
  const output = record.images[0];
  const asset = await resolvedAsset(ownerEmail, output?.assetId, output?.url ?? null);
  const completed = record.status === "completed";
  return {
    id: record.requestId,
    type: "image",
    origin: "generation",
    assetId: asset.assetId,
    ...graphProvenance(record),
    sourceAssetIds: inputAssetIds(record.requestParams),
    operation: null,
    status: record.status as GenerationHistoryItem["status"],
    prompt: record.prompt,
    model: extractModel(record.requestParams),
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
    durationMs: toHistoryDurationMs(record.createdAt, record.updatedAt, record.status),
    progress: record.progress,
    resultUrl: completed ? asset.url : null,
    thumbnailUrl: completed ? asset.url : null,
    inputImages: extractInputImages(record.requestParams),
    errorMessage: record.status === "failed" ? record.errorMessage : null,
  };
}

async function videoItem(ownerEmail: string, record: {
  requestId: string;
  status: string;
  prompt: string;
  requestParams: Prisma.JsonValue | null;
  graphNodeId: string | null;
  graphNode: { graphId: string } | null;
  progress: number;
  errorMessage: string | null;
  createdAt: Date;
  updatedAt: Date;
  videos: Array<{ assetId: string | null; url: string }>;
}): Promise<GenerationHistoryItem> {
  const output = record.videos[0];
  const asset = await resolvedAsset(ownerEmail, output?.assetId, output?.url ?? null);
  const completed = record.status === "completed";
  return {
    id: record.requestId,
    type: "video",
    origin: "generation",
    assetId: asset.assetId,
    ...graphProvenance(record),
    sourceAssetIds: inputAssetIds(record.requestParams),
    operation: null,
    status: record.status as GenerationHistoryItem["status"],
    prompt: record.prompt,
    model: extractModel(record.requestParams),
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
    durationMs: toHistoryDurationMs(record.createdAt, record.updatedAt, record.status),
    progress: record.progress,
    resultUrl: completed ? asset.url : null,
    thumbnailUrl: null,
    inputImages: extractInputImages(record.requestParams),
    errorMessage: record.status === "failed" ? record.errorMessage : null,
  };
}

async function audioItem(ownerEmail: string, record: {
  requestId: string;
  status: string;
  prompt: string;
  requestParams: Prisma.JsonValue | null;
  graphNodeId: string | null;
  graphNode: { graphId: string } | null;
  progress: number;
  errorMessage: string | null;
  createdAt: Date;
  updatedAt: Date;
  audios: Array<{ assetId: string | null; url: string }>;
}): Promise<GenerationHistoryItem> {
  const output = record.audios[0];
  const asset = await resolvedAsset(ownerEmail, output?.assetId, output?.url ?? null);
  const completed = record.status === "completed";
  return {
    id: record.requestId,
    type: "audio",
    origin: "generation",
    assetId: asset.assetId,
    ...graphProvenance(record),
    sourceAssetIds: inputAssetIds(record.requestParams),
    operation: null,
    status: record.status as GenerationHistoryItem["status"],
    prompt: record.prompt,
    model: extractModel(record.requestParams),
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
    durationMs: toHistoryDurationMs(record.createdAt, record.updatedAt, record.status),
    progress: record.progress,
    resultUrl: completed ? asset.url : null,
    thumbnailUrl: null,
    inputImages: [],
    inputAudios: extractInputAudios(record.requestParams),
    referenceText: extractReferenceText(record.requestParams),
    errorMessage: record.status === "failed" ? record.errorMessage : null,
  };
}

function operationWhere(query: HistoryQuery, ownerEmail: string): Prisma.MediaOperationWhereInput {
  return {
    ownerEmail,
    status: "completed",
    outputs: {
      some: {
        status: "completed",
        ...(query.type === "all" ? {} : { type: query.type }),
      },
    },
    ...(query.query ? { type: { contains: query.query, mode: "insensitive" } } : {}),
  };
}

export async function getHistory(
  searchParams: URLSearchParams,
  ownerEmail: string,
): Promise<HistoryResponse> {
  const query = parseHistoryQuery(searchParams);
  const cappedOffset = Math.min(query.offset, 200);
  const take = query.limit + cappedOffset;
  const orderBy = { createdAt: query.sort === "date_asc" ? "asc" : "desc" } as const;
  const graphNode = { select: { graphId: true } } as const;

  const imagePromise = query.type === "all" || query.type === "image"
    ? Promise.all([
        prisma.imageGeneration.findMany({
          where: { ownerEmail, ...buildImageWhere(query) }, orderBy, take,
          select: {
            requestId: true, status: true, prompt: true, requestParams: true,
            graphNodeId: true, graphNode, progress: true, errorMessage: true,
            createdAt: true, updatedAt: true,
            images: { orderBy: { createdAt: "asc" }, take: 1, select: { assetId: true, url: true } },
          },
        }),
        prisma.imageGeneration.count({ where: { ownerEmail, ...buildImageWhere(query) } }),
      ])
    : emptyPage;
  const videoPromise = query.type === "all" || query.type === "video"
    ? Promise.all([
        prisma.videoGeneration.findMany({
          where: { ownerEmail, ...buildVideoWhere(query) }, orderBy, take,
          select: {
            requestId: true, status: true, prompt: true, requestParams: true,
            graphNodeId: true, graphNode, progress: true, errorMessage: true,
            createdAt: true, updatedAt: true,
            videos: { orderBy: { createdAt: "asc" }, take: 1, select: { assetId: true, url: true } },
          },
        }),
        prisma.videoGeneration.count({ where: { ownerEmail, ...buildVideoWhere(query) } }),
      ])
    : emptyPage;
  const audioPromise = query.type === "all" || query.type === "audio"
    ? Promise.all([
        prisma.audioGeneration.findMany({
          where: { ownerEmail, ...buildAudioWhere(query) }, orderBy, take,
          select: {
            requestId: true, status: true, prompt: true, requestParams: true,
            graphNodeId: true, graphNode, progress: true, errorMessage: true,
            createdAt: true, updatedAt: true,
            audios: { orderBy: { createdAt: "asc" }, take: 1, select: { assetId: true, url: true } },
          },
        }),
        prisma.audioGeneration.count({ where: { ownerEmail, ...buildAudioWhere(query) } }),
      ])
    : emptyPage;
  const editWhere = operationWhere(query, ownerEmail);
  const operationPromise = Promise.all([
    prisma.mediaOperation.findMany({
      where: editWhere, orderBy, take,
      select: {
        id: true, graphId: true, graphNodeId: true, type: true, configVersion: true,
        parameters: true, progress: true, createdAt: true, updatedAt: true,
        inputs: { orderBy: [{ portId: "asc" }, { sortOrder: "asc" }], select: { assetId: true } },
        outputs: {
          where: { status: "completed", ...(query.type === "all" ? {} : { type: query.type }) },
          orderBy: { createdAt: "asc" }, take: 1,
          select: { id: true, type: true, storageUrl: true, legacyUrl: true },
        },
      },
    }),
    prisma.mediaOperation.count({ where: editWhere }),
  ]);

  const [[images, imageTotal], [videos, videoTotal], [audios, audioTotal], [operations, operationTotal]] =
    await Promise.all([imagePromise, videoPromise, audioPromise, operationPromise]);
  const operationItems = await Promise.all(operations.flatMap((operation) => {
    const output = operation.outputs[0];
    if (!output) return [];
    return [resolvedAsset(ownerEmail, output.id, output.storageUrl ?? output.legacyUrl).then((asset): GenerationHistoryItem => ({
      id: operation.id,
      type: output.type,
      origin: "edit",
      assetId: asset.assetId,
      graphId: operation.graphId,
      graphNodeId: operation.graphNodeId,
      sourceAssetIds: operation.inputs.map((input) => input.assetId),
      operation: {
        id: operation.id,
        type: operation.type,
        configVersion: operation.configVersion,
        parameters: operation.parameters,
      },
      status: "completed",
      prompt: operation.type,
      model: null,
      createdAt: operation.createdAt.toISOString(),
      updatedAt: operation.updatedAt.toISOString(),
      durationMs: toHistoryDurationMs(operation.createdAt, operation.updatedAt, "completed"),
      progress: operation.progress,
      resultUrl: asset.url,
      thumbnailUrl: output.type === "image" ? asset.url : null,
      inputImages: [],
      inputAudios: [],
      errorMessage: null,
    }))];
  }));
  const items = [
    ...(await Promise.all(images.map((record) => imageItem(ownerEmail, record)))),
    ...(await Promise.all(videos.map((record) => videoItem(ownerEmail, record)))),
    ...(await Promise.all(audios.map((record) => audioItem(ownerEmail, record)))),
    ...operationItems,
  ].sort((a, b) => {
    const delta = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    return query.sort === "date_asc" ? delta : -delta;
  });

  return {
    items: items.slice(cappedOffset, cappedOffset + query.limit),
    total: imageTotal + videoTotal + audioTotal + operationTotal,
    limit: query.limit,
    offset: cappedOffset,
  };
}
