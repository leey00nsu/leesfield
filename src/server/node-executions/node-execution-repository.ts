import { parseImageVariants } from "@/shared/media-assets/image-variants";
import { Prisma } from "@prisma/client";

import { prisma } from "@/server/db/prisma";
import type { GeneratedMediaArtifact } from "@/server/media-assets/generated-media-artifact";
import type { MediaType } from "@/shared/media-assets/media-asset-contract";

import {
  NodeExecutionCancelledError,
  NodeExecutionNodeNotFoundError,
  NodeExecutionNotFoundError,
} from "./node-execution-errors";
import type { NodeExecutionMediaType, NodeExecutionStatus } from "./node-execution-contract";

const activeStatuses = ["pending", "processing", "uploading"] as const;

export type StoredNodeExecutionSource = {
  id: string;
  kind: string;
  configVersion: number;
  config: unknown;
  selectedOutputAssetId: string | null;
  outputs?: Array<{
    portId: string;
    sortOrder: number;
    assetId: string;
  }>;
};

export type StoredNodeExecutionEdge = {
  hasPause?: boolean;
  id: string;
  sourcePortId: string;
  targetPortId: string;
  sortOrder: number;
  createdAt: Date;
  sourceNodeId: string;
  sourceNode: StoredNodeExecutionSource;
};

export type StoredNodeExecutionTarget = {
  id: string;
  kind: string;
  configVersion: number;
  config: unknown;
  graph: { version: number; schemaVersion: number };
  incomingEdges: StoredNodeExecutionEdge[];
};

export type StoredExecutionRecord = {
  executionId: string;
  mediaType: NodeExecutionMediaType;
  graphNodeId: string;
  status: NodeExecutionStatus;
  progress: number;
  errorMessage: string | null;
  modelKey: string | null;
  createdAt: Date;
  outputs: Array<{
    assetId: string | null;
    url: string;
    width: number | null;
    height: number | null;
    durationSec: number | null;
  }>;
};

const sourceNodeSelect = {
  id: true,
  kind: true,
  configVersion: true,
  config: true,
  selectedOutputAssetId: true,
  outputs: {
    orderBy: [{ portId: "asc" as const }, { sortOrder: "asc" as const }],
    select: { portId: true, sortOrder: true, assetId: true },
  },
} satisfies Prisma.GenerationGraphNodeSelect;

async function getOwnedNode(ownerEmail: string, graphId: string, nodeId: string) {
  const node = await prisma.generationGraphNode.findFirst({
    where: { id: nodeId, graphId, graph: { ownerEmail } },
    select: {
      id: true,
      kind: true,
      configVersion: true,
      config: true,
      graph: { select: { version: true, schemaVersion: true } },
      incomingEdges: {
        select: {
          hasPause: true,
          id: true,
          sourcePortId: true,
          targetPortId: true,
          sortOrder: true,
          createdAt: true,
          sourceNodeId: true,
          sourceNode: { select: sourceNodeSelect },
        },
        orderBy: [{ targetPortId: "asc" }, { sortOrder: "asc" }, { createdAt: "asc" }, { id: "asc" }],
      },
    },
  });
  if (!node) throw new NodeExecutionNodeNotFoundError();
  return node as StoredNodeExecutionTarget;
}

async function getAssets(ownerEmail: string, assetIds: string[]) {
  if (assetIds.length === 0) return [];
  return prisma.mediaAsset.findMany({
    where: { id: { in: [...new Set(assetIds)] }, ownerEmail, status: "completed" },
    select: {
      id: true,
      ownerEmail: true,
      type: true,
      status: true,
      mimeType: true,
    },
  });
}

function outputRows<T extends { assetId: string | null; url: string; width?: number | null; height?: number | null; durationSec?: number | null }>(
  rows: T[],
) {
  return rows.map((row) => ({
    assetId: row.assetId,
    url: row.url,
    width: row.width ?? null,
    height: row.height ?? null,
    durationSec: row.durationSec ?? null,
  }));
}

async function listExecutions(
  ownerEmail: string,
  graphNodeId: string,
  mediaType: NodeExecutionMediaType,
  take = 20,
): Promise<StoredExecutionRecord[]> {
  const where = { ownerEmail, graphNodeId };
  const orderBy = { createdAt: "desc" as const };
  if (mediaType === "image") {
    const records = await prisma.imageGeneration.findMany({
      where,
      orderBy,
      take,
      select: {
        requestId: true,
        status: true,
        progress: true,
        errorMessage: true,
        modelKey: true,
        createdAt: true,
        images: {
          orderBy: { createdAt: "asc" },
          select: { assetId: true, url: true, width: true, height: true },
        },
      },
    });
    return records.map((record) => ({
      executionId: record.requestId,
      mediaType,
      graphNodeId,
      status: record.status,
      progress: record.progress,
      errorMessage: record.errorMessage,
      modelKey: record.modelKey,
      createdAt: record.createdAt,
      outputs: outputRows(record.images),
    }));
  }
  if (mediaType === "video") {
    const records = await prisma.videoGeneration.findMany({
      where,
      orderBy,
      take,
      select: {
        requestId: true,
        status: true,
        progress: true,
        errorMessage: true,
        modelKey: true,
        createdAt: true,
        videos: {
          orderBy: { createdAt: "asc" },
          select: { assetId: true, url: true, width: true, height: true, durationSec: true },
        },
      },
    });
    return records.map((record) => ({
      executionId: record.requestId,
      mediaType,
      graphNodeId,
      status: record.status,
      progress: record.progress,
      errorMessage: record.errorMessage,
      modelKey: record.modelKey,
      createdAt: record.createdAt,
      outputs: outputRows(record.videos),
    }));
  }
  const records = await prisma.audioGeneration.findMany({
    where,
    orderBy,
    take,
    select: {
      requestId: true,
      status: true,
      progress: true,
      errorMessage: true,
      modelKey: true,
      createdAt: true,
      audios: {
        orderBy: { createdAt: "asc" },
        select: { assetId: true, url: true, durationSec: true },
      },
    },
  });
  return records.map((record) => ({
    executionId: record.requestId,
    mediaType,
    graphNodeId,
    status: record.status,
    progress: record.progress,
    errorMessage: record.errorMessage,
    modelKey: record.modelKey,
    createdAt: record.createdAt,
    outputs: outputRows(record.audios),
  }));
}

async function findExecution(
  ownerEmail: string,
  graphId: string,
  graphNodeId: string,
  executionId: string,
): Promise<StoredExecutionRecord> {
  const node = await getOwnedNode(ownerEmail, graphId, graphNodeId);
  const kind = node.kind;
  const mediaType = kind === "generate.image" ? "image" : kind === "generate.video" ? "video" : kind === "generate.audio" ? "audio" : null;
  if (!mediaType) throw new NodeExecutionNotFoundError();
  const where = { requestId: executionId, ownerEmail, graphNodeId };
  if (mediaType === "image") {
    const record = await prisma.imageGeneration.findFirst({
      where,
      select: {
        requestId: true,
        status: true,
        progress: true,
        errorMessage: true,
        modelKey: true,
        createdAt: true,
        images: { orderBy: { createdAt: "asc" }, select: { assetId: true, url: true, width: true, height: true } },
      },
    });
    if (!record) throw new NodeExecutionNotFoundError();
    return {
      executionId: record.requestId,
      mediaType,
      graphNodeId,
      status: record.status,
      progress: record.progress,
      errorMessage: record.errorMessage,
      modelKey: record.modelKey,
      createdAt: record.createdAt,
      outputs: outputRows(record.images),
    };
  }
  if (mediaType === "video") {
    const record = await prisma.videoGeneration.findFirst({
      where,
      select: {
        requestId: true,
        status: true,
        progress: true,
        errorMessage: true,
        modelKey: true,
        createdAt: true,
        videos: { orderBy: { createdAt: "asc" }, select: { assetId: true, url: true, width: true, height: true, durationSec: true } },
      },
    });
    if (!record) throw new NodeExecutionNotFoundError();
    return {
      executionId: record.requestId,
      mediaType,
      graphNodeId,
      status: record.status,
      progress: record.progress,
      errorMessage: record.errorMessage,
      modelKey: record.modelKey,
      createdAt: record.createdAt,
      outputs: outputRows(record.videos),
    };
  }
  const record = await prisma.audioGeneration.findFirst({
    where,
    select: {
      requestId: true,
      status: true,
      progress: true,
      errorMessage: true,
      modelKey: true,
      createdAt: true,
      audios: { orderBy: { createdAt: "asc" }, select: { assetId: true, url: true, durationSec: true } },
    },
  });
  if (!record) throw new NodeExecutionNotFoundError();
  return {
    executionId: record.requestId,
    mediaType,
    graphNodeId,
    status: record.status,
    progress: record.progress,
    errorMessage: record.errorMessage,
    modelKey: record.modelKey,
    createdAt: record.createdAt,
    outputs: outputRows(record.audios),
  };
}

async function cancelExecution(
  ownerEmail: string,
  graphId: string,
  graphNodeId: string,
  executionId: string,
) {
  const record = await findExecution(ownerEmail, graphId, graphNodeId, executionId);
  if (!(activeStatuses as readonly string[]).includes(record.status)) return record;
  const cancelRequestedAt = new Date();
  const where = { requestId: executionId, ownerEmail, graphNodeId };
  if (record.mediaType === "image") {
    if (record.status === "pending") {
      const cancelled = await prisma.imageGeneration.updateMany({
        where: { ...where, status: "pending" },
        data: { status: "cancelled", progress: 0, cancelRequestedAt },
      });
      if (cancelled.count === 1) {
        return findExecution(ownerEmail, graphId, graphNodeId, executionId);
      }
    }
    await prisma.imageGeneration.updateMany({
      where: { ...where, status: { in: ["processing", "uploading"] } },
      data: { cancelRequestedAt },
    });
  } else if (record.mediaType === "video") {
    if (record.status === "pending") {
      const cancelled = await prisma.videoGeneration.updateMany({
        where: { ...where, status: "pending" },
        data: { status: "cancelled", progress: 0, cancelRequestedAt },
      });
      if (cancelled.count === 1) {
        return findExecution(ownerEmail, graphId, graphNodeId, executionId);
      }
    }
    await prisma.videoGeneration.updateMany({
      where: { ...where, status: { in: ["processing", "uploading"] } },
      data: { cancelRequestedAt },
    });
  } else {
    if (record.status === "pending") {
      const cancelled = await prisma.audioGeneration.updateMany({
        where: { ...where, status: "pending" },
        data: { status: "cancelled", progress: 0, cancelRequestedAt },
      });
      if (cancelled.count === 1) {
        return findExecution(ownerEmail, graphId, graphNodeId, executionId);
      }
    }
    await prisma.audioGeneration.updateMany({
      where: { ...where, status: { in: ["processing", "uploading"] } },
      data: { cancelRequestedAt },
    });
  }
  return findExecution(ownerEmail, graphId, graphNodeId, executionId);
}

async function settleCancelledIfRequested(mediaType: NodeExecutionMediaType, generationId: string) {
  const model = mediaType === "image"
    ? prisma.imageGeneration
    : mediaType === "video"
      ? prisma.videoGeneration
      : prisma.audioGeneration;
  const record = await (model.findUnique as typeof prisma.imageGeneration.findUnique)({
    where: { id: generationId },
    select: { cancelRequestedAt: true, status: true },
  });
  if (!record?.cancelRequestedAt || !(activeStatuses as readonly string[]).includes(record.status)) return false;
  const updated = await (model.updateMany as typeof prisma.imageGeneration.updateMany)({
    where: { id: generationId, status: { in: [...activeStatuses] }, cancelRequestedAt: { not: null } },
    data: { status: "cancelled", progress: 0 },
  });
  return updated.count === 1;
}

async function markUploading(mediaType: NodeExecutionMediaType, generationId: string) {
  const model = mediaType === "image"
    ? prisma.imageGeneration
    : mediaType === "video"
      ? prisma.videoGeneration
      : prisma.audioGeneration;
  const updated = await (model.updateMany as typeof prisma.imageGeneration.updateMany)({
    where: { id: generationId, status: "processing", cancelRequestedAt: null },
    data: { status: "uploading", progress: 95 },
  });
  if (updated.count === 1) return;
  if (await settleCancelledIfRequested(mediaType, generationId)) {
    throw new NodeExecutionCancelledError();
  }
  throw new Error("NODE_EXECUTION_STATE_CONFLICT");
}

function assertArtifacts(mediaType: MediaType, artifacts: GeneratedMediaArtifact[]) {
  if (
    artifacts.length === 0 ||
    artifacts.some(
      (artifact) =>
        artifact.type !== mediaType ||
        artifact.storageProvider !== "leemage" ||
        !artifact.storageObjectId ||
        !artifact.storageUrl ||
        !artifact.mimeType ||
        !Number.isSafeInteger(artifact.bytes) ||
        artifact.bytes <= 0,
    ) ||
    new Set(artifacts.map((artifact) => artifact.storageObjectId)).size !== artifacts.length
  ) {
    throw new Error("GENERATION_DURABLE_OUTPUT_REQUIRED");
  }
}

async function completeGeneration(
  mediaType: NodeExecutionMediaType,
  generationId: string,
  artifacts: GeneratedMediaArtifact[],
) {
  assertArtifacts(mediaType, artifacts);
  return prisma.$transaction(async (tx) => {
    const model = mediaType === "image"
      ? tx.imageGeneration
      : mediaType === "video"
        ? tx.videoGeneration
        : tx.audioGeneration;
    const completed = await (model.updateMany as typeof tx.imageGeneration.updateMany)({
      where: { id: generationId, graphNodeId: { not: null }, status: "uploading", cancelRequestedAt: null },
      data: { status: "completed", progress: 100, errorMessage: null },
    });
    if (completed.count !== 1) {
      const cancelled = await (model.updateMany as typeof tx.imageGeneration.updateMany)({
        where: { id: generationId, status: { in: [...activeStatuses] }, cancelRequestedAt: { not: null } },
        data: { status: "cancelled", progress: 0 },
      });
      if (cancelled.count === 1) return { status: "cancelled" as const, assetIds: [] };
      throw new Error("NODE_EXECUTION_STATE_CONFLICT");
    }
    const generation = await (model.findUnique as typeof tx.imageGeneration.findUnique)({
      where: { id: generationId },
      select: { ownerEmail: true, graphNodeId: true },
    });
    if (!generation?.ownerEmail || !generation.graphNodeId) throw new Error("NODE_EXECUTION_TARGET_INVALID");

    if (mediaType === "image") await tx.imageGenerationImage.deleteMany({ where: { generationId } });
    if (mediaType === "video") await tx.videoGenerationVideo.deleteMany({ where: { generationId } });
    if (mediaType === "audio") await tx.audioGenerationAudio.deleteMany({ where: { generationId } });

    const assetIds: string[] = [];
    for (const artifact of artifacts) {
      const asset = await tx.mediaAsset.create({
        data: {
          ownerEmail: generation.ownerEmail,
          type: mediaType,
          status: "completed",
          origin: "generation",
          storageProvider: artifact.storageProvider,
          storageObjectId: artifact.storageObjectId,
          storageUrl: artifact.storageUrl,
          imageVariants: parseImageVariants(artifact.imageVariants) ?? undefined,
          mimeType: artifact.mimeType,
          bytes: BigInt(artifact.bytes),
          width: artifact.width,
          height: artifact.height,
          durationMs: artifact.durationMs,
        },
        select: { id: true },
      });
      assetIds.push(asset.id);
      if (mediaType === "image") {
        await tx.imageGenerationImage.create({
          data: {
            generationId,
            url: artifact.storageUrl,
            width: artifact.width,
            height: artifact.height,
            assetId: asset.id,
          },
        });
      } else if (mediaType === "video") {
        await tx.videoGenerationVideo.create({
          data: {
            generationId,
            url: artifact.storageUrl,
            width: artifact.width,
            height: artifact.height,
            durationSec: artifact.durationMs === null ? null : Math.round(artifact.durationMs / 1_000),
            assetId: asset.id,
          },
        });
      } else {
        await tx.audioGenerationAudio.create({
          data: {
            generationId,
            url: artifact.storageUrl,
            durationSec: artifact.durationMs === null ? null : Math.round(artifact.durationMs / 1_000),
            assetId: asset.id,
          },
        });
      }
    }
    await tx.generationGraphNodeOutput.deleteMany({
      where: { graphNodeId: generation.graphNodeId, portId: mediaType },
    });
    await tx.generationGraphNodeOutput.createMany({
      data: assetIds.map((assetId, sortOrder) => ({
        graphNodeId: generation.graphNodeId as string,
        portId: mediaType,
        sortOrder,
        assetId,
      })),
    });
    await tx.generationGraphNode.updateMany({
      where: { id: generation.graphNodeId },
      data: { selectedOutputAssetId: assetIds[0] },
    });
    return { status: "completed" as const, assetIds };
  });
}

export const nodeExecutionRepository = {
  getOwnedNode,
  getAssets,
  listExecutions,
  findExecution,
  cancelExecution,
  settleCancelledIfRequested,
  markUploading,
  completeGeneration,
};

export type NodeExecutionRepository = typeof nodeExecutionRepository;
