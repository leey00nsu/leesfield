import { Prisma } from "@prisma/client";

import { prisma } from "@/server/db/prisma";
import { findNodeDefinition } from "@/shared/generation-graph/node-registry";
import type {
  CreateMediaOperationInput,
  CreateMediaUploadInput,
  ListMediaAssetsInput,
  MediaType,
} from "@/shared/media-assets/media-asset-contract";

import {
  MediaAssetNotFoundError,
  MediaOperationConflictError,
  MediaOperationNotFoundError,
  MediaQuotaExceededError,
  MediaUploadConflictError,
  MediaUploadExpiredError,
  MediaUploadNotFoundError,
} from "./media-asset-errors";
import type { InspectedMedia, StorageConfirmedFile, StoragePresignResult } from "./media-storage";
import type { GeneratedMediaArtifact } from "./generated-media-artifact";

const assetSelect = {
  id: true,
  version: true,
  ownerEmail: true,
  type: true,
  status: true,
  origin: true,
  storageProvider: true,
  storageObjectId: true,
  storageUrl: true,
  legacyUrl: true,
  mimeType: true,
  bytes: true,
  width: true,
  height: true,
  durationMs: true,
  sourceOperationId: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.MediaAssetSelect;

const uploadSessionInclude = {
  asset: { select: assetSelect },
  operation: {
    select: {
      id: true,
      ownerEmail: true,
      graphNodeId: true,
      status: true,
      expectedOutputCount: true,
      type: true,
      configVersion: true,
    },
  },
} satisfies Prisma.MediaUploadSessionInclude;

const operationSelect = {
  id: true,
  ownerEmail: true,
  graphId: true,
  graphNodeId: true,
  type: true,
  configVersion: true,
  parameters: true,
  status: true,
  progress: true,
  expectedOutputCount: true,
  errorCode: true,
  errorMessage: true,
  createdAt: true,
  updatedAt: true,
  completedAt: true,
  graphNode: { select: { id: true, graphId: true, kind: true, configVersion: true } },
  inputs: {
    orderBy: [{ portId: "asc" as const }, { sortOrder: "asc" as const }],
    select: {
      assetId: true,
      portId: true,
      sortOrder: true,
      asset: { select: { ownerEmail: true, type: true, status: true, mimeType: true } },
    },
  },
  outputs: {
    orderBy: [{ createdAt: "asc" as const }, { id: "asc" as const }],
    select: { id: true },
  },
} satisfies Prisma.MediaOperationSelect;

export type MediaAssetRecord = Prisma.MediaAssetGetPayload<{ select: typeof assetSelect }>;
export type MediaUploadSessionRecord = Prisma.MediaUploadSessionGetPayload<{
  include: typeof uploadSessionInclude;
}>;
export type MediaOperationRecord = Prisma.MediaOperationGetPayload<{
  select: typeof operationSelect;
}>;

const activeOperationStatuses = ["pending", "processing", "uploading"] as const;

async function getOwnerReservedBytes(ownerEmail: string) {
  const [assets, uploads] = await Promise.all([
    prisma.mediaAsset.aggregate({
      where: { ownerEmail, status: { in: ["completed", "deleting"] } },
      _sum: { bytes: true },
    }),
    prisma.mediaUploadSession.aggregate({
      where: { ownerEmail, status: { in: ["pending", "confirming"] } },
      _sum: { declaredBytes: true },
    }),
  ]);
  return (assets._sum.bytes ?? BigInt(0)) + (uploads._sum.declaredBytes ?? BigInt(0));
}

async function getOperation(ownerEmail: string, operationId: string) {
  const operation = await prisma.mediaOperation.findFirst({
    where: { id: operationId, ownerEmail },
    select: operationSelect,
  });
  if (!operation) throw new MediaOperationNotFoundError();
  return operation;
}

async function listNodeOperations(ownerEmail: string, graphId: string, graphNodeId: string, take = 20) {
  return prisma.mediaOperation.findMany({
    where: { ownerEmail, graphId, graphNodeId },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take,
    select: operationSelect,
  });
}

async function updateOperationProgress(
  ownerEmail: string,
  operationId: string,
  progress: number,
) {
  await prisma.mediaOperation.updateMany({
    where: { id: operationId, ownerEmail, status: { in: ["pending", "processing"] } },
    data: { status: "processing", progress: Math.max(1, Math.min(89, Math.round(progress))) },
  });
  return getOperation(ownerEmail, operationId);
}

async function failOperation(ownerEmail: string, operationId: string, errorCode: string) {
  await prisma.mediaOperation.updateMany({
    where: { id: operationId, ownerEmail, status: { in: [...activeOperationStatuses] } },
    data: { status: "failed", errorCode, errorMessage: null },
  });
  return getOperation(ownerEmail, operationId);
}

async function cancelOperation(ownerEmail: string, operationId: string) {
  await prisma.mediaOperation.updateMany({
    where: { id: operationId, ownerEmail, status: { in: [...activeOperationStatuses] } },
    data: { status: "cancelled", errorCode: null, errorMessage: null },
  });
  return getOperation(ownerEmail, operationId);
}

async function claimPendingServerOperation(operationId: string) {
  const claimed = await prisma.mediaOperation.updateMany({
    where: { id: operationId, status: "pending", type: "edit.image.removeBackground" },
    data: { status: "processing", progress: 10, errorCode: null, errorMessage: null },
  });
  if (claimed.count !== 1) return null;
  return prisma.mediaOperation.findUnique({
    where: { id: operationId },
    select: operationSelect,
  });
}

async function listPendingServerOperationIds(take = 20) {
  return prisma.mediaOperation.findMany({
    where: { status: "pending", type: "edit.image.removeBackground" },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    take,
    select: { id: true },
  });
}

async function completeServerOperation(
  ownerEmail: string,
  operationId: string,
  artifacts: GeneratedMediaArtifact[],
  now: Date,
) {
  return prisma.$transaction(async (tx) => {
    const operation = await tx.mediaOperation.findFirst({
      where: { id: operationId, ownerEmail },
      select: operationSelect,
    });
    if (!operation || !operation.graphNodeId || operation.status !== "processing") {
      throw new MediaOperationConflictError("MEDIA_OPERATION_TARGET_INVALID");
    }
    if (artifacts.length !== operation.expectedOutputCount) {
      throw new MediaOperationConflictError("MEDIA_OPERATION_TARGET_INVALID");
    }
    const outputPort = findNodeDefinition(operation.type)?.ports.find((port) => port.direction === "output");
    if (!outputPort) throw new MediaOperationConflictError("MEDIA_OPERATION_TARGET_INVALID");
    const uploading = await tx.mediaOperation.updateMany({
      where: { id: operationId, ownerEmail, status: "processing" },
      data: { status: "uploading", progress: 90 },
    });
    if (uploading.count !== 1) throw new MediaOperationConflictError("MEDIA_OPERATION_TARGET_INVALID");

    const assetIds: string[] = [];
    for (const artifact of artifacts) {
      const asset = await tx.mediaAsset.create({
        data: {
          ownerEmail,
          type: artifact.type,
          status: "completed",
          origin: "media_operation",
          storageProvider: artifact.storageProvider,
          storageObjectId: artifact.storageObjectId,
          storageUrl: artifact.storageUrl,
          mimeType: artifact.mimeType,
          bytes: BigInt(artifact.bytes),
          width: artifact.width,
          height: artifact.height,
          durationMs: artifact.durationMs,
          sourceOperationId: operationId,
        },
        select: { id: true },
      });
      assetIds.push(asset.id);
    }
    await tx.generationGraphNodeOutput.deleteMany({
      where: { graphNodeId: operation.graphNodeId, portId: outputPort.id },
    });
    await tx.generationGraphNodeOutput.createMany({
      data: assetIds.map((assetId, sortOrder) => ({
        graphNodeId: operation.graphNodeId as string,
        portId: outputPort.id,
        sortOrder,
        assetId,
        createdAt: now,
      })),
    });
    await tx.generationGraphNode.updateMany({
      where: { id: operation.graphNodeId },
      data: { selectedOutputAssetId: assetIds[0] },
    });
    await tx.mediaOperation.update({
      where: { id: operationId },
      data: { status: "completed", progress: 100, completedAt: now },
    });
    return assetIds;
  });
}

async function listTerminalOperationOutputs(ownerEmail: string, operationId: string) {
  return prisma.mediaAsset.findMany({
    where: {
      ownerEmail,
      sourceOperationId: operationId,
      sourceOperation: { is: { status: { in: ["failed", "cancelled"] } } },
      graphNodeOutputs: { none: {} },
    },
    select: assetSelect,
  });
}

async function deleteTerminalOperationOutput(ownerEmail: string, operationId: string, assetId: string) {
  await prisma.mediaAsset.deleteMany({
    where: {
      id: assetId,
      ownerEmail,
      sourceOperationId: operationId,
      sourceOperation: { is: { status: { in: ["failed", "cancelled"] } } },
      graphNodeOutputs: { none: {} },
    },
  });
}

async function createOperation(ownerEmail: string, input: CreateMediaOperationInput) {
  try {
    return await prisma.$transaction(async (tx) => {
      const node = await tx.generationGraphNode.findFirst({
        where: { id: input.graphNodeId, graphId: input.graphId, graph: { ownerEmail } },
        select: { id: true, graphId: true, kind: true, configVersion: true },
      });
      if (!node) throw new MediaOperationConflictError("MEDIA_OPERATION_TARGET_INVALID");
      const definition = node.kind ? findNodeDefinition(node.kind) : null;
      if (
        !definition ||
        node.kind !== input.type ||
        node.configVersion !== input.configVersion ||
        !["browser-operation", "server-operation"].includes(definition.executionMode) ||
        !definition.configSchema.safeParse({ parameters: input.parameters }).success
      ) {
        throw new MediaOperationConflictError("MEDIA_OPERATION_TARGET_INVALID");
      }

      const assets = await tx.mediaAsset.findMany({
        where: { id: { in: input.inputs.map((item) => item.assetId) } },
        select: { id: true, ownerEmail: true, type: true, status: true, mimeType: true },
      });
      if (assets.length !== new Set(input.inputs.map((item) => item.assetId)).size) {
        throw new MediaOperationConflictError("MEDIA_OPERATION_TARGET_INVALID");
      }
      const assetsById = new Map(assets.map((asset) => [asset.id, asset]));
      if (
        input.inputs.some((item) => {
          const asset = assetsById.get(item.assetId);
          return !asset || asset.ownerEmail !== ownerEmail || asset.status !== "completed";
        })
      ) {
        throw new MediaOperationConflictError("MEDIA_OPERATION_TARGET_INVALID");
      }
      const inputPorts = definition.ports.filter((port) => port.direction === "input");
      const countsByPort = new Map<string, number>();
      const inputSlots = new Set<string>();
      for (const item of input.inputs) {
        const port = inputPorts.find((candidate) => candidate.id === item.portId);
        const asset = assetsById.get(item.assetId);
        if (!port || !asset || port.valueType === "text" || port.valueType === "media") {
          throw new MediaOperationConflictError("MEDIA_OPERATION_TARGET_INVALID");
        }
        if (port.valueType !== asset.type) {
          throw new MediaOperationConflictError("MEDIA_OPERATION_TARGET_INVALID");
        }
        const slot = `${item.portId}:${item.sortOrder}`;
        if (inputSlots.has(slot)) {
          throw new MediaOperationConflictError("MEDIA_OPERATION_TARGET_INVALID");
        }
        inputSlots.add(slot);
        countsByPort.set(item.portId, (countsByPort.get(item.portId) ?? 0) + 1);
      }
      if (
        inputPorts.some((port) => {
          const count = countsByPort.get(port.id) ?? 0;
          return count < port.minConnections || (port.maxConnections !== null && count > port.maxConnections);
        })
      ) {
        throw new MediaOperationConflictError("MEDIA_OPERATION_TARGET_INVALID");
      }
      const outputPort = definition.ports.find((port) => port.direction === "output");
      if (
        !outputPort ||
        (outputPort.valueShape === "single" && input.expectedOutputCount !== 1)
      ) {
        throw new MediaOperationConflictError("MEDIA_OPERATION_TARGET_INVALID");
      }

      return tx.mediaOperation.create({
        data: {
          ownerEmail,
          graphId: input.graphId,
          graphNodeId: input.graphNodeId,
          type: input.type,
          configVersion: input.configVersion,
          parameters: input.parameters as Prisma.InputJsonValue,
          expectedOutputCount: input.expectedOutputCount,
          inputs: {
            create: input.inputs.map((item) => ({
              assetId: item.assetId,
              portId: item.portId,
              sortOrder: item.sortOrder,
            })),
          },
        },
        select: operationSelect,
      });
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new MediaOperationConflictError("MEDIA_OPERATION_ACTIVE");
    }
    throw error;
  }
}

async function createUploadSession(
  ownerEmail: string,
  input: CreateMediaUploadInput,
  presign: StoragePresignResult,
  ownerQuota: bigint,
) {
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT CAST(pg_advisory_xact_lock(hashtext(${`media-assets:${ownerEmail}`})) AS TEXT)`;
    const [assets, uploads] = await Promise.all([
      tx.mediaAsset.aggregate({
        where: { ownerEmail, status: { in: ["completed", "deleting"] } },
        _sum: { bytes: true },
      }),
      tx.mediaUploadSession.aggregate({
        where: { ownerEmail, status: { in: ["pending", "confirming"] } },
        _sum: { declaredBytes: true },
      }),
    ]);
    const reserved =
      (assets._sum.bytes ?? BigInt(0)) + (uploads._sum.declaredBytes ?? BigInt(0));
    if (reserved + BigInt(input.declaredBytes) > ownerQuota) {
      throw new MediaQuotaExceededError();
    }
    if (input.operationId) {
      const operation = await tx.mediaOperation.findFirst({
        where: { id: input.operationId, ownerEmail },
        select: { id: true, status: true, expectedOutputCount: true },
      });
      if (!operation) throw new MediaOperationNotFoundError();
      if (!(activeOperationStatuses as readonly string[]).includes(operation.status)) {
        throw new MediaOperationConflictError("MEDIA_OPERATION_TARGET_INVALID");
      }
      const reservedOutputs = await tx.mediaUploadSession.count({
        where: {
          operationId: operation.id,
          status: { in: ["pending", "confirming", "completed"] },
        },
      });
      if (reservedOutputs >= operation.expectedOutputCount) {
        throw new MediaOperationConflictError("MEDIA_OPERATION_TARGET_INVALID");
      }
      const duplicateOutput = await tx.mediaUploadSession.count({
        where: {
          operationId: operation.id,
          outputPortId: input.outputPortId,
          sortOrder: input.sortOrder,
          status: { in: ["pending", "confirming", "completed"] },
        },
      });
      if (duplicateOutput > 0) {
        throw new MediaOperationConflictError("MEDIA_OPERATION_TARGET_INVALID");
      }
      await tx.mediaOperation.update({
        where: { id: operation.id },
        data: { status: "uploading", progress: 90 },
      });
    }

    return tx.mediaUploadSession.create({
      data: {
        ownerEmail,
        intendedType: input.intendedType,
        fileName: input.fileName,
        declaredMimeType: input.declaredMimeType,
        declaredBytes: BigInt(input.declaredBytes),
        storageProvider: "leemage",
        storageObjectId: presign.objectId,
        storageObjectName: presign.objectName,
        storageFileName: presign.fileName ?? null,
        storageUrl: presign.objectUrl,
        operationId: input.operationId,
        outputPortId: input.outputPortId,
        sortOrder: input.sortOrder,
        expiresAt: presign.expiresAt,
      },
      include: uploadSessionInclude,
    });
  });
}

export type ClaimUploadResult =
  | { kind: "completed"; session: MediaUploadSessionRecord; asset: MediaAssetRecord }
  | { kind: "claimed"; session: MediaUploadSessionRecord };

async function claimUpload(
  ownerEmail: string,
  uploadId: string,
  now: Date,
): Promise<ClaimUploadResult> {
  const result = await prisma.$transaction(async (tx): Promise<ClaimUploadResult | { kind: "expired" }> => {
    const session = await tx.mediaUploadSession.findFirst({
      where: { id: uploadId, ownerEmail },
      include: uploadSessionInclude,
    });
    if (!session) throw new MediaUploadNotFoundError();
    if (session.status === "completed" && session.asset) {
      return { kind: "completed", session, asset: session.asset };
    }
    if (
      session.operation &&
      !(activeOperationStatuses as readonly string[]).includes(session.operation.status)
    ) {
      throw new MediaOperationConflictError("MEDIA_OPERATION_TARGET_INVALID");
    }
    if (session.expiresAt <= now && ["pending", "confirming"].includes(session.status)) {
      const expired = await tx.mediaUploadSession.updateMany({
        where: { id: session.id, status: { in: ["pending", "confirming"] }, expiresAt: { lte: now } },
        data: { status: "expired", errorCode: "MEDIA_UPLOAD_EXPIRED" },
      });
      if (expired.count !== 1) throw new MediaUploadConflictError("MEDIA_UPLOAD_CONFIRMING");
      if (session.operationId) {
        await tx.mediaOperation.updateMany({
          where: {
            id: session.operationId,
            ownerEmail,
            status: { in: [...activeOperationStatuses] },
          },
          data: {
            status: "failed",
            errorCode: "MEDIA_UPLOAD_EXPIRED",
            errorMessage: null,
          },
        });
      }
      return { kind: "expired" };
    }
    if (session.status === "confirming") {
      throw new MediaUploadConflictError("MEDIA_UPLOAD_CONFIRMING");
    }
    if (session.status === "failed") {
      throw new MediaUploadConflictError("MEDIA_UPLOAD_FAILED");
    }
    if (session.status === "expired") return { kind: "expired" };

    const claimed = await tx.mediaUploadSession.updateMany({
      where: { id: session.id, ownerEmail, status: "pending" },
      data: { status: "confirming", errorCode: null },
    });
    if (claimed.count !== 1) {
      throw new MediaUploadConflictError("MEDIA_UPLOAD_CONFIRMING");
    }
    return {
      kind: "claimed",
      session: { ...session, status: "confirming", errorCode: null },
    };
  });
  if (result.kind === "expired") throw new MediaUploadExpiredError();
  return result;
}

async function getPendingUpload(ownerEmail: string, uploadId: string, now: Date) {
  const session = await prisma.mediaUploadSession.findFirst({
    where: { id: uploadId, ownerEmail },
    include: uploadSessionInclude,
  });
  if (!session) throw new MediaUploadNotFoundError();
  if (session.expiresAt <= now) throw new MediaUploadExpiredError();
  if (session.status !== "pending") {
    throw new MediaUploadConflictError(
      session.status === "confirming" ? "MEDIA_UPLOAD_CONFIRMING" : "MEDIA_UPLOAD_FAILED",
    );
  }
  return session;
}

async function failUpload(ownerEmail: string, uploadId: string, errorCode: string) {
  await prisma.$transaction(async (tx) => {
    const session = await tx.mediaUploadSession.findFirst({
      where: { id: uploadId, ownerEmail },
      select: { id: true, operationId: true },
    });
    if (!session) return;
    await tx.mediaUploadSession.updateMany({
      where: { id: session.id, status: "confirming" },
      data: { status: "failed", errorCode },
    });
    if (session.operationId) {
      await tx.mediaOperation.updateMany({
        where: { id: session.operationId, ownerEmail, status: { in: [...activeOperationStatuses] } },
        data: { status: "failed", errorCode, errorMessage: null },
      });
    }
  });
}

async function completeUpload(input: {
  ownerEmail: string;
  uploadId: string;
  confirmed: StorageConfirmedFile;
  inspected: InspectedMedia;
  now: Date;
}) {
  return prisma.$transaction(async (tx) => {
    const session = await tx.mediaUploadSession.findFirst({
      where: { id: input.uploadId, ownerEmail: input.ownerEmail },
      include: uploadSessionInclude,
    });
    if (!session) throw new MediaUploadNotFoundError();
    if (session.status === "completed" && session.asset) return session.asset;
    if (session.status !== "confirming") {
      throw new MediaUploadConflictError(
        session.status === "failed" ? "MEDIA_UPLOAD_FAILED" : "MEDIA_UPLOAD_CONFIRMING",
      );
    }

    if (session.expiresAt <= input.now) throw new MediaUploadExpiredError();
    // Lock and recheck the live row before creating assets, so concurrent
    // expiry/cancellation cannot be overwritten by a late confirmation.
    const claimed = await tx.mediaUploadSession.updateMany({
      where: { id: session.id, status: "confirming", expiresAt: { gt: input.now } },
      data: { status: "confirming" },
    });
    if (claimed.count !== 1) throw new MediaUploadConflictError("MEDIA_UPLOAD_CONFIRMING");
    if (session.operationId) {
      const active = await tx.mediaOperation.updateMany({
        where: { id: session.operationId, ownerEmail: input.ownerEmail, status: "uploading" },
        data: { status: "uploading" },
      });
      if (active.count !== 1) throw new MediaOperationConflictError("MEDIA_OPERATION_TARGET_INVALID");
    }

    const asset = await tx.mediaAsset.create({
      data: {
        ownerEmail: input.ownerEmail,
        type: session.intendedType,
        origin: session.operationId ? "media_operation" : "upload",
        storageProvider: session.storageProvider,
        storageObjectId: input.confirmed.objectId,
        storageUrl: input.confirmed.url,
        mimeType: input.inspected.detectedMimeType,
        bytes: BigInt(input.confirmed.bytes),
        width: input.inspected.width,
        height: input.inspected.height,
        durationMs: input.inspected.durationMs,
        sourceOperationId: session.operationId,
      },
      select: assetSelect,
    });
    await tx.mediaUploadSession.update({
      where: { id: session.id },
      data: { status: "completed", assetId: asset.id, errorCode: null },
    });

    if (session.operationId && session.operation?.graphNodeId) {
      const completedUploads = await tx.mediaUploadSession.findMany({
        where: { operationId: session.operationId, status: "completed", assetId: { not: null } },
        orderBy: [{ outputPortId: "asc" }, { sortOrder: "asc" }],
        select: { assetId: true, outputPortId: true, sortOrder: true },
      });
      if (completedUploads.length === session.operation.expectedOutputCount) {
        const completed = await tx.mediaOperation.updateMany({
          where: { id: session.operationId, ownerEmail: input.ownerEmail, status: "uploading" },
          data: { status: "completed", progress: 100, completedAt: input.now },
        });
        if (completed.count !== 1) {
          throw new MediaOperationConflictError("MEDIA_OPERATION_TARGET_INVALID");
        }
        const outputPortIds = Array.from(
          new Set(
            completedUploads.flatMap((output) =>
              output.outputPortId ? [output.outputPortId] : [],
            ),
          ),
        );
        await tx.generationGraphNodeOutput.deleteMany({
          where: {
            graphNodeId: session.operation.graphNodeId,
            portId: { in: outputPortIds },
          },
        });
        for (const output of completedUploads) {
          if (!output.assetId || !output.outputPortId) continue;
          await tx.generationGraphNodeOutput.create({
            data: {
              graphNodeId: session.operation.graphNodeId,
              portId: output.outputPortId,
              sortOrder: output.sortOrder,
              assetId: output.assetId,
              createdAt: input.now,
            },
          });
        }
        const selectedOutputAssetId = completedUploads[0]?.assetId ?? null;
        if (selectedOutputAssetId) {
          await tx.generationGraphNode.updateMany({
            where: {
              id: session.operation.graphNodeId,
            },
            data: { selectedOutputAssetId },
          });
        }
      }
    }
    return asset;
  });
}

async function getAsset(ownerEmail: string, assetId: string) {
  const asset = await prisma.mediaAsset.findFirst({
    where: { id: assetId, ownerEmail, status: "completed" },
    select: assetSelect,
  });
  if (!asset) throw new MediaAssetNotFoundError();
  return asset;
}

async function listAssets(ownerEmail: string, input: ListMediaAssetsInput) {
  const categoryWhere = input.category === "uploads" ? { origin: "upload" as const }
    : input.category === "edited" ? { origin: "media_operation" as const }
    : input.category === "generated" ? { origin: { in: ["generation", "legacy_generation"] as ("generation" | "legacy_generation")[] } } : {};
  if (input.cursor) {
    const cursor = await prisma.mediaAsset.findFirst({
      where: {
        id: input.cursor,
        ownerEmail,
        status: "completed",
        OR: [
          { origin: { not: "media_operation" } },
          { sourceOperation: { is: { status: "completed" } } },
        ],
        ...(input.type ? { type: input.type } : {}),
        ...categoryWhere,
      },
      select: { id: true },
    });
    if (!cursor) throw new MediaAssetNotFoundError();
  }
  return prisma.mediaAsset.findMany({
    where: {
      ownerEmail,
      status: "completed",
      OR: [
        { origin: { not: "media_operation" } },
        { sourceOperation: { is: { status: "completed" } } },
      ],
      ...(input.type ? { type: input.type } : {}),
        ...categoryWhere,
    },
    select: assetSelect,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: input.limit + 1,
    ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
  });
}

async function getAssetUsage(ownerEmail: string, assetId: string) {
  const asset = await prisma.mediaAsset.findFirst({
    where: { id: assetId, ownerEmail },
    select: {
      selectedByGraphNodes: { select: { graphId: true } },
      graphNodeOutputs: { select: { graphNode: { select: { graphId: true } } } },
      operationInputs: {
        select: {
          operation: {
            select: { id: true, graphId: true, graphNode: { select: { graphId: true } } },
          },
        },
      },
    },
  });
  if (!asset) throw new MediaAssetNotFoundError();
  const inputNodes = await prisma.generationGraphNode.findMany({
    where: {
      graph: { ownerEmail },
      config: { path: ["assetId"], equals: assetId },
    },
    select: { graphId: true },
  });
  const graphIds = Array.from(
    new Set([
      ...asset.selectedByGraphNodes.map((node) => node.graphId),
      ...asset.graphNodeOutputs.map((output) => output.graphNode.graphId),
      ...asset.operationInputs.flatMap((input) => [
        input.operation.graphId,
        input.operation.graphNode?.graphId ?? null,
      ]),
      ...inputNodes.map((node) => node.graphId),
    ].filter((graphId): graphId is string => Boolean(graphId))),
  ).sort();
  const operationIds = Array.from(
    new Set(asset.operationInputs.map((input) => input.operation.id)),
  ).sort();
  return { graphIds, operationIds };
}

async function markAssetDeleting(ownerEmail: string, assetId: string) {
  const result = await prisma.mediaAsset.updateMany({
    where: { id: assetId, ownerEmail, status: "completed" },
    data: { status: "deleting" },
  });
  if (result.count !== 1) throw new MediaAssetNotFoundError();
  const asset = await prisma.mediaAsset.findFirst({ where: { id: assetId, ownerEmail }, select: assetSelect });
  if (!asset) throw new MediaAssetNotFoundError();
  return asset;
}

async function restoreAsset(ownerEmail: string, assetId: string) {
  await prisma.mediaAsset.updateMany({
    where: { id: assetId, ownerEmail, status: "deleting" },
    data: { status: "completed" },
  });
}

async function deleteAsset(ownerEmail: string, assetId: string) {
  const result = await prisma.mediaAsset.deleteMany({
    where: { id: assetId, ownerEmail, status: "deleting" },
  });
  if (result.count !== 1) throw new MediaAssetNotFoundError();
}

async function expireUploads(now: Date, limit: number, scope?: { ownerEmail: string; graphId: string; graphNodeId: string }) {
  return prisma.$transaction(async (tx) => {
    const sessions = await tx.mediaUploadSession.findMany({
      where: {
        status: { in: ["pending", "confirming"] }, expiresAt: { lte: now },
        ...(scope ? { ownerEmail: scope.ownerEmail, operation: { graphId: scope.graphId, graphNodeId: scope.graphNodeId } } : {}),
      },
      orderBy: { expiresAt: "asc" },
      take: limit,
      select: {
        id: true,
        ownerEmail: true,
        storageProvider: true,
        storageObjectId: true,
        operationId: true,
      },
    });
    if (sessions.length === 0) return sessions;
    const expired = [];
    for (const session of sessions) {
      const updated = await tx.mediaUploadSession.updateMany({
        where: { id: session.id, status: { in: ["pending", "confirming"] }, expiresAt: { lte: now } },
        data: { status: "expired", errorCode: "MEDIA_UPLOAD_EXPIRED" },
      });
      if (updated.count === 1) expired.push(session);
    }
    const operationIds = expired.flatMap((session) =>
      session.operationId ? [session.operationId] : [],
    );
    if (operationIds.length > 0) {
      await tx.mediaOperation.updateMany({
        where: { id: { in: operationIds }, status: { in: [...activeOperationStatuses] } },
        data: {
          status: "failed",
          errorCode: "MEDIA_UPLOAD_EXPIRED",
          errorMessage: null,
        },
      });
    }
    return expired;
  });
}

export const mediaAssetRepository = {
  getOwnerReservedBytes,
  getOperation,
  listNodeOperations,
  updateOperationProgress,
  failOperation,
  cancelOperation,
  claimPendingServerOperation,
  listPendingServerOperationIds,
  completeServerOperation,
  listTerminalOperationOutputs,
  deleteTerminalOperationOutput,
  createOperation,
  createUploadSession,
  getPendingUpload,
  claimUpload,
  failUpload,
  completeUpload,
  getAsset,
  listAssets,
  getAssetUsage,
  markAssetDeleting,
  restoreAsset,
  deleteAsset,
  expireUploads,
};

export type MediaAssetRepository = typeof mediaAssetRepository;
export type MediaUploadType = MediaType;
