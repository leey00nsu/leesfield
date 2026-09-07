import { imageUrlsFor, parseImageVariants } from "@/shared/media-assets/image-variants";
import type { Prisma } from "@prisma/client";

import type { GenerationHistoryItem } from "@/entities/generation/model/types";
import { prisma } from "@/server/db/prisma";
import { compareHistory, cursorWhere, decodeHistoryCursor, encodeHistoryCursor } from "../lib/history-cursor";
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
  return { assetId: assetId ?? null, url: fallbackUrl };
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
  images: Array<{ assetId: string | null; url: string; asset?: {imageVariants: unknown} | null }>;
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
    imageVariants: completed ? parseImageVariants(output?.asset?.imageVariants) : null,
    thumbnailUrl: completed && asset.url ? imageUrlsFor({url: asset.url, imageVariants: output?.asset?.imageVariants}, "list")[0] : null,
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
  const status = searchParams.get("status") ?? "all";
  const validStatus = ["pending", "processing", "uploading", "completed", "failed", "cancelled"].includes(status) ? status : "all";
  const scope = JSON.stringify([query.type, query.query, query.sort, validStatus]);
  const cursor = decodeHistoryCursor(searchParams.get("cursor"), scope);
  const pageOffset = cursor ? 0 : query.offset;
  const take = query.limit + pageOffset + 1;
  const filter = validStatus === "all" ? {} : { status: validStatus as GenerationHistoryItem["status"] };
  const asc = query.sort === "date_asc";
  const orderBy = { createdAt: query.sort === "date_asc" ? "asc" : "desc" } as const;
  const graphNode = { select: { graphId: true } } as const;

  const imagePromise = query.type === "all" || query.type === "image"
    ? Promise.all([
        prisma.imageGeneration.findMany({
          where: { ownerEmail, ...filter, AND: [buildImageWhere(query), cursorWhere(cursor, 0, "requestId", asc)] }, orderBy: [orderBy, { requestId: asc ? "asc" : "desc" }], take,
          select: {
            requestId: true, status: true, prompt: true, requestParams: true,
            graphNodeId: true, graphNode, progress: true, errorMessage: true,
            createdAt: true, updatedAt: true,
            images: { orderBy: { createdAt: "asc" }, take: 1, select: { assetId: true, url: true, asset: {select: {imageVariants: true}} } },
          },
        }),
        prisma.imageGeneration.count({ where: { ownerEmail, ...filter, ...buildImageWhere(query) } }),
      ])
    : emptyPage;
  const videoPromise = query.type === "all" || query.type === "video"
    ? Promise.all([
        prisma.videoGeneration.findMany({
          where: { ownerEmail, ...filter, AND: [buildVideoWhere(query), cursorWhere(cursor, 1, "requestId", asc)] }, orderBy: [orderBy, { requestId: asc ? "asc" : "desc" }], take,
          select: {
            requestId: true, status: true, prompt: true, requestParams: true,
            graphNodeId: true, graphNode, progress: true, errorMessage: true,
            createdAt: true, updatedAt: true,
            videos: { orderBy: { createdAt: "asc" }, take: 1, select: { assetId: true, url: true } },
          },
        }),
        prisma.videoGeneration.count({ where: { ownerEmail, ...filter, ...buildVideoWhere(query) } }),
      ])
    : emptyPage;
  const audioPromise = query.type === "all" || query.type === "audio"
    ? Promise.all([
        prisma.audioGeneration.findMany({
          where: { ownerEmail, ...filter, AND: [buildAudioWhere(query), cursorWhere(cursor, 2, "requestId", asc)] }, orderBy: [orderBy, { requestId: asc ? "asc" : "desc" }], take,
          select: {
            requestId: true, status: true, prompt: true, requestParams: true,
            graphNodeId: true, graphNode, progress: true, errorMessage: true,
            createdAt: true, updatedAt: true,
            audios: { orderBy: { createdAt: "asc" }, take: 1, select: { assetId: true, url: true } },
          },
        }),
        prisma.audioGeneration.count({ where: { ownerEmail, ...filter, ...buildAudioWhere(query) } }),
      ])
    : emptyPage;
  const editWhere = { ...operationWhere(query, ownerEmail), ...(validStatus !== "all" && validStatus !== "completed" ? { id: { in: [] as string[] } } : {}) };
  const operationPromise = Promise.all([
    prisma.mediaOperation.findMany({
      where: { ...editWhere, AND: [cursorWhere(cursor, 3, "id", asc)] }, orderBy: [orderBy, { id: asc ? "asc" : "desc" }], take,
      select: {
        id: true, graphId: true, graphNodeId: true, type: true, configVersion: true,
        parameters: true, progress: true, createdAt: true, updatedAt: true,
        inputs: { orderBy: [{ portId: "asc" }, { sortOrder: "asc" }], select: { assetId: true } },
        outputs: {
          where: { status: "completed", ...(query.type === "all" ? {} : { type: query.type }) },
          orderBy: { createdAt: "asc" }, take: 1,
          select: { id: true, type: true, storageUrl: true, legacyUrl: true, imageVariants: true },
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
      imageVariants: output.type === "image" ? parseImageVariants(output.imageVariants) : null,
      thumbnailUrl: output.type === "image" && asset.url ? imageUrlsFor({url: asset.url, imageVariants: output.imageVariants}, "list")[0] : null,
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
  ].sort((a, b) => compareHistory(a, b, asc));
  const page = items.slice(pageOffset, pageOffset + query.limit);

  return {
    items: page,
    nextCursor: items.length > pageOffset + query.limit && page.length ? encodeHistoryCursor(page[page.length - 1], scope) : null,
    total: imageTotal + videoTotal + audioTotal + operationTotal,
    limit: query.limit,
    offset: pageOffset,
  };
}
