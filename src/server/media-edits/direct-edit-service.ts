import { Prisma, type MediaOperation } from "@prisma/client";
import { prisma } from "@/server/db/prisma";
import { withQueueTransaction } from "@/server/job-queue/job-queue-transaction";
import { enqueueQueueJobTx, queueScopeDigest } from "@/server/job-queue/job-queue-registration";
import { requestQueueCancellationTx } from "@/server/job-queue/job-queue-recovery";
import { hashSubmissionPayload } from "@/server/generation-admission/submission-ledger";
import { mediaOperationLeaseWhere, MediaOperationLeaseLostError, type MediaOperationLease } from "@/server/media-operations/media-operation-lease";
import { linkStorageCleanupToAsset, releaseStorageCleanupsForRequest } from "@/server/media-assets/media-cleanup-repository";
import type { GeneratedMediaArtifact } from "@/server/media-assets/generated-media-artifact";
import { parseImageVariants } from "@/shared/media-assets/image-variants";
import { validateNodeConfig } from "@/shared/generation-graph/node-registry";
import { directEditRequestSchema, directEditSnapshotSchema, editMediaType, editOutputPort, isDirectEditType,
  validEditGeometry, type DirectEditDto, type DirectEditSnapshot } from "@/shared/media-assets/direct-media-edit";
import { matchesEditReservation, objectRecord } from "./direct-edit-target";
import { inspectDirectVideoSource } from "./direct-edit-source";

export class DirectEditError extends Error {
  constructor(readonly code: string, readonly status = 409) { super(code); }
}
const includeGraph = { nodes: { include: { outputs: true } }, edges: true } as const;
const active = ["pending", "processing", "uploading"] as const;
function snapshot(row: MediaOperation) { return directEditSnapshotSchema.parse(row.parameters); }
export async function directEditDto(row: MediaOperation): Promise<DirectEditDto> {
  const s = snapshot(row);
  const output = await prisma.mediaOperationOutput.findFirst({ where: { operationId: row.id }, select: { assetId: true } });
  return { id: row.id, type: row.type, status: row.status, progress: row.progress, resultNodeId: s.resultNodeId,
    sourceNodeId: s.sourceNodeId, sourceAssetId: s.sourceAssetId, outputAssetId: output?.assetId ?? null,
    errorCode: row.errorCode, createdAt: row.createdAt.toISOString(), finishedAt: row.finishedAt?.toISOString() ?? null };
}
export async function startDirectEdit(ownerEmail: string, graphId: string, sourceNodeId: string, raw: unknown) {
  const parsed = directEditRequestSchema.safeParse(raw);
  if (!parsed.success) throw new DirectEditError("INVALID_REQUEST", 400);
  const input = parsed.data;
  // Network/probe work stays outside queue/Graph transactions. The asset version
  // and displayed source are revalidated under the lock before admission.
  const previousRequest = await prisma.mediaOperation.findUnique({ where: { id: input.requestId }, select: { id: true } });
  let measured: { width: number; height: number; durationMs: number } | undefined;
  if (!previousRequest && input.edit.kind !== "image.crop") {
    const candidate = await prisma.mediaAsset.findFirst({ where: { id: input.sourceAssetId, ownerEmail, status: "completed", type: "video", version: input.sourceVersion } });
    if (candidate && (!candidate.width || !candidate.height || !candidate.durationMs)) {
      try { measured = await inspectDirectVideoSource(ownerEmail, candidate.id); }
      catch { throw new DirectEditError("EDIT_SOURCE_UNSUPPORTED", 422); }
    }
  }
  const row = await withQueueTransaction(async tx => {
    const previous = await tx.mediaOperation.findUnique({ where: { id: input.requestId } });
    const { expectedGraphVersion: _version, ...request } = input;
    void _version;
    if (previous) {
      if (previous.ownerEmail !== ownerEmail || previous.graphId !== graphId || !isDirectEditType(previous.type)) throw new DirectEditError("EDIT_REQUEST_CONFLICT");
      const s = snapshot(previous), { width: _w, height: _h, durationMs: _d, ...identity } = s;
      void _w; void _h; void _d;
      if (hashSubmissionPayload(identity) !== hashSubmissionPayload({ ...request, sourceNodeId })) throw new DirectEditError("EDIT_REQUEST_CONFLICT");
      return previous;
    }
    await tx.$queryRaw`SELECT id FROM "GenerationGraph" WHERE id = ${graphId} AND "ownerEmail" = ${ownerEmail} FOR UPDATE`;
    const graph = await tx.generationGraph.findFirst({ where: { id: graphId, ownerEmail }, include: includeGraph });
    if (!graph) throw new DirectEditError("NOT_FOUND", 404);
    if (graph.nodes.some(n => !validateNodeConfig(n.kind, n.configVersion, n.config).supported)) throw new DirectEditError("SPACE_READ_ONLY", 403);
    if (graph.schemaVersion > 3 || graph.minimumWriterVersion > 3 || graph.version !== input.expectedGraphVersion) throw new DirectEditError("GRAPH_VERSION_CONFLICT");
    const asset = await tx.mediaAsset.findFirst({ where: { id: input.sourceAssetId, ownerEmail, status: "completed", type: editMediaType(input.edit) } });
    const width = measured?.width ?? asset?.width, height = measured?.height ?? asset?.height;
    if (!asset || asset.version !== input.sourceVersion || !width || !height) throw new DirectEditError("EDIT_SOURCE_CHANGED");
    const s: DirectEditSnapshot = { ...request, sourceNodeId, width, height, durationMs: measured?.durationMs ?? asset.durationMs };
    if (!directEditSnapshotSchema.safeParse(s).success || !validEditGeometry(input.edit, s.width, s.height, s.durationMs)) throw new DirectEditError("EDIT_RANGE_INVALID", 400);
    if (!matchesEditReservation(graph, s)) throw new DirectEditError("EDIT_SOURCE_CHANGED");
    const operation = await tx.mediaOperation.create({ data: {
      id: input.requestId, ownerEmail, graphId, graphNodeId: input.resultNodeId,
      type: "direct." + input.edit.kind, configVersion: 1, parameters: s as unknown as Prisma.InputJsonValue,
      expectedOutputCount: 1, inputs: { create: { assetId: asset.id, portId: editMediaType(input.edit), sortOrder: 0 } },
    } });
    await enqueueQueueJobTx(tx, { kind: "media_operation", source: { type: "media_operation", id: operation.id },
      ownerScopeDigest: queueScopeDigest(ownerEmail), snapshotRef: "media-operation:" + operation.id });
    return operation;
  });
  return directEditDto(row);
}
export async function getDirectEdit(ownerEmail: string, graphId: string, sourceNodeId: string, operationId: string) {
  const row = await prisma.mediaOperation.findFirst({ where: { id: operationId, ownerEmail, graphId } });
  if (!row || !isDirectEditType(row.type) || snapshot(row).sourceNodeId !== sourceNodeId) throw new DirectEditError("NOT_FOUND", 404);
  return directEditDto(row);
}
export async function cancelDirectEdit(ownerEmail: string, graphId: string, sourceNodeId: string, operationId: string) {
  await getDirectEdit(ownerEmail, graphId, sourceNodeId, operationId);
  await withQueueTransaction(async tx => {
    const job = await tx.queueJob.findFirst({ where: { executionType: "media_operation", executionId: operationId } });
    if (job) await requestQueueCancellationTx(tx, job.id);
    await tx.mediaOperation.updateMany({ where: { id: operationId, ownerEmail, status: { in: [...active] } },
      data: { status: "cancelled", finishedAt: new Date() } });
    await settleDirectEditFailure(tx, operationId, "cancelled");
  });
  return getDirectEdit(ownerEmail, graphId, sourceNodeId, operationId);
}

/** Queue settlement owns its lock. Graph lock serializes autosave and result publication. */
export async function completeDirectEdit(tx: Prisma.TransactionClient, operationId: string, artifacts: GeneratedMediaArtifact[], lease: MediaOperationLease) {
  const row = await tx.mediaOperation.findFirst({ where: { id: operationId, status: "processing", ...mediaOperationLeaseWhere(lease), executionLeaseUntil: undefined } });
  if (!row) throw new MediaOperationLeaseLostError(operationId);
  const s = snapshot(row);
  await tx.$queryRaw`SELECT id FROM "GenerationGraph" WHERE id = ${row.graphId} FOR UPDATE`;
  const graph = row.graphId ? await tx.generationGraph.findFirst({ where: { id: row.graphId, ownerEmail: row.ownerEmail }, include: includeGraph }) : null;
  const source = await tx.mediaAsset.findFirst({ where: { id: s.sourceAssetId, ownerEmail: row.ownerEmail, status: "completed", version: s.sourceVersion } });
  if (!graph || !source || !matchesEditReservation(graph, s)) {
    await tx.mediaOperation.update({ where: { id: row.id }, data: { status: "cancelled", finishedAt: new Date(), errorCode: "EDIT_SOURCE_CHANGED" } });
    await settleDirectEditFailure(tx, row.id, "cancelled");
    await releaseStorageCleanupsForRequest(tx, row.id);
    return "protected" as const;
  }
  const a = artifacts[0], type = editMediaType(s.edit);
  if (artifacts.length !== 1 || !a || a.type !== type || a.storageProvider !== "leemage" || !a.storageObjectId || !a.storageUrl
    || !Number.isSafeInteger(a.bytes) || a.bytes < 1 || a.mimeType !== (type === "image" ? "image/png" : "video/mp4")) throw new DirectEditError("EDIT_OUTPUT_INVALID");
  if (s.edit.kind !== "video.trim" && (a.width !== s.edit.rect.width || a.height !== s.edit.rect.height)) throw new DirectEditError("EDIT_OUTPUT_INVALID");
  const asset = await tx.mediaAsset.create({ data: { ownerEmail: row.ownerEmail, type, status: "completed", origin: "media_operation",
    storageProvider: a.storageProvider, storageObjectId: a.storageObjectId, storageUrl: a.storageUrl,
    imageVariants: parseImageVariants(a.imageVariants) ?? undefined, mimeType: a.mimeType, bytes: BigInt(a.bytes), width: a.width, height: a.height,
    durationMs: a.durationMs, sourceOperationId: row.id } });
  await linkStorageCleanupToAsset(tx, { ownerEmail: row.ownerEmail, requestId: row.id, storageProvider: a.storageProvider,
    storageObjectId: a.storageObjectId, storageUrl: a.storageUrl, reason: "media_operation_output", assetId: asset.id, now: new Date() });
  const result = graph.nodes.find(n => n.id === s.resultNodeId)!;
  const config = objectRecord(result.config), binding = objectRecord(config.resultSource);
  await tx.generationGraphNode.update({ where: { id: result.id }, data: {
    config: { ...config, assetId: asset.id, resultSource: { ...binding, state: "completed" } } as Prisma.InputJsonValue,
    selectedOutputAssetId: asset.id,
  } });
  await tx.mediaOperationOutput.create({ data: { operationId: row.id, portId: editOutputPort(s.edit), sortOrder: 0, assetId: asset.id } });
  await tx.mediaOperation.update({ where: { id: row.id }, data: { status: "completed", progress: 100, finishedAt: new Date(), executionLeaseToken: null, executionLeaseUntil: null } });
  return "succeeded" as const;
}

export async function settleDirectEditFailure(tx: Prisma.TransactionClient, operationId: string, status: "failed" | "cancelled") {
  const row = await tx.mediaOperation.findUnique({ where: { id: operationId } });
  if (!row || !isDirectEditType(row.type)) return;
  const s = snapshot(row), node = await tx.generationGraphNode.findFirst({ where: { id: s.resultNodeId, graphId: row.graphId ?? "", graph: { ownerEmail: row.ownerEmail } } });
  if (!node) return;
  const config = objectRecord(node.config), binding = objectRecord(config.resultSource);
  if (binding.executionId === row.id && binding.state === "pending") await tx.generationGraphNode.update({ where: { id: node.id },
    data: { config: { ...config, resultSource: { ...binding, state: status } } as Prisma.InputJsonValue } });
}
