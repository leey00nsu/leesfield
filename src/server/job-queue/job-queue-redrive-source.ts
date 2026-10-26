import { randomUUID } from "node:crypto";
import { Prisma, type QueueJob } from "@prisma/client";
import { queueScopeDigest } from "./job-queue-registration";
import { QueueContractError } from "./contracts";
import { beginSubmission, hashSubmissionPayload } from "@/server/generation-admission/submission-ledger";
import { getLlmModelApiKey, decryptModelApiKey } from "@/server/model-catalog/model-credential";
import { frozenExecutionModel } from "@/server/generation-request/request-snapshot";
import { mediaAssetRepository } from "@/server/media-assets/media-asset-repository";
import { prisma } from "@/server/db/prisma";
import { assistantInputSnapshotSchema } from "./handlers/assistant-handler";
import { validateNodeConfig } from "@/shared/generation-graph/node-registry";
import { buildImagePayload, buildVideoPayload, buildAudioPayload, getImageRuntimeState, getVideoRuntimeState, getAudioRuntimeState } from "@/server/generation-worker/generation-payload";
import { validateImageGenerationPayload, validateVideoGenerationPayload, validateAudioGenerationPayload } from "@/server/model-catalog/generation-validation";

function fail(code: string): never { throw new QueueContractError(code); }
export function versionedSnapshot(snapshot: unknown) {
  return Boolean(snapshot && typeof snapshot === "object" && !Array.isArray(snapshot) &&
    (snapshot as { requestVersion?: unknown }).requestVersion === 3);
}
export function queueGenerationModel(tx: Prisma.TransactionClient | typeof prisma, kind: QueueJob["kind"]) {
  return (kind === "generate_image" ? tx.imageGeneration : kind === "generate_video" ? tx.videoGeneration : tx.audioGeneration) as Prisma.TransactionClient["imageGeneration"];
}

export async function checkAssets(tx: Prisma.TransactionClient, ownerEmail: string, refs: Array<{ assetId: string }>, lock = true) {
  const ids = [...new Set(refs.map(r => r.assetId))].sort();
  if (!ids.length) return;
  if (lock) await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "MediaAsset" WHERE "id" IN (${Prisma.join(ids)}) ORDER BY "id" FOR SHARE`);
  const count = await tx.mediaAsset.count({ where: { id: { in: ids }, ownerEmail, status: "completed" } });
  if (count !== ids.length) fail("QUEUE_REDRIVE_INPUT_MISSING");
}
export async function checkNode(tx: Prisma.TransactionClient, ownerEmail: string, nodeId: string | null, kind: string, configVersion?: number) {
  if (!nodeId) return;
  const node = await tx.generationGraphNode.findFirst({ where: { id: nodeId, kind, graph: { ownerEmail }, ...(configVersion === undefined ? {} : { configVersion }) }, select: { id: true } });
  if (!node) fail("QUEUE_REDRIVE_TARGET_CHANGED");
  const active = await Promise.all([
    tx.imageGeneration.count({ where: { graphNodeId: nodeId, status: { in: ["pending", "processing", "uploading"] } } }),
    tx.videoGeneration.count({ where: { graphNodeId: nodeId, status: { in: ["pending", "processing", "uploading"] } } }),
    tx.audioGeneration.count({ where: { graphNodeId: nodeId, status: { in: ["pending", "processing", "uploading"] } } }),
    tx.mediaOperation.count({ where: { graphNodeId: nodeId, status: { in: ["pending", "processing", "uploading"] } } }),
    tx.assistantExecution.count({ where: { graphNodeId: nodeId, status: { in: ["pending", "processing"] } } }),
  ]);
  if (active.some(Boolean)) fail("QUEUE_REDRIVE_NODE_ACTIVE");
}
export function assertOwner(job: QueueJob, ownerEmail: string | null): asserts ownerEmail is string {
  if (!ownerEmail || queueScopeDigest(ownerEmail) !== job.ownerScopeDigest) fail("QUEUE_REDRIVE_OWNER_CHANGED");
}

/** Credentials are inspected outside the short queue transaction. */
export async function prepareQueueRedrive(job: QueueJob) {
  if (job.kind === "assistant") {
    const source = await prisma.assistantExecution.findUnique({ where: { id: job.sourceId } });
    if (!source) fail("QUEUE_REDRIVE_SOURCE_MISSING");
    await getLlmModelApiKey(source.modelKey);
  } else if (job.kind.startsWith("generate_")) {
    const source = await queueGenerationModel(prisma, job.kind).findUnique({ where: { id: job.sourceId } });
    if (!source) fail("QUEUE_REDRIVE_SOURCE_MISSING");
    if (job.kind === "generate_image") {
      const runtime = await getImageRuntimeState();
      if (!runtime) fail("QUEUE_REDRIVE_MODEL_UNAVAILABLE");
      const payload = await buildImagePayload(source, runtime);
      const model = frozenExecutionModel(source.requestParams, "image", source.modelKey);
      if ((!model && !versionedSnapshot(source.requestParams)) || !(await validateImageGenerationPayload(payload, undefined, model)).success) fail("QUEUE_REDRIVE_SNAPSHOT_INVALID");
    } else if (job.kind === "generate_video") {
      const runtime = await getVideoRuntimeState();
      if (!runtime) fail("QUEUE_REDRIVE_MODEL_UNAVAILABLE");
      const payload = await buildVideoPayload(source, runtime);
      const model = frozenExecutionModel(source.requestParams, "video", source.modelKey);
      if ((!model && !versionedSnapshot(source.requestParams)) || !(await validateVideoGenerationPayload(payload, undefined, model)).success) fail("QUEUE_REDRIVE_SNAPSHOT_INVALID");
    } else {
      const runtime = await getAudioRuntimeState();
      if (!runtime || !(await validateAudioGenerationPayload(await buildAudioPayload(source, runtime))).success) fail("QUEUE_REDRIVE_SNAPSHOT_INVALID");
    }
  }
}

/** Makes a new business execution; the caller retains the original queue identity/order. */
export async function cloneQueueSourceTx(tx: Prisma.TransactionClient, job: QueueJob) {
  const id = randomUUID();
  if (job.kind === "storage_cleanup") {
    const source = await tx.mediaCleanupTask.findUnique({ where: { id: job.sourceId } });
    if (!source || source.queueRevision !== job.sourceRevision || source.status !== "failed") fail("QUEUE_REDRIVE_SOURCE_CHANGED");
    if (source.assetId) {
      const asset = await tx.mediaAsset.findUnique({ where: { id: source.assetId } });
      if (asset) {
        const usage = await mediaAssetRepository.getAssetUsage(asset.ownerEmail, asset.id, tx);
        if (usage.graphIds.length || usage.operationIds.length || usage.generationRequestIds.length || usage.projectCoverIds.length || asset.status === "completed")
          fail("QUEUE_REDRIVE_ASSET_PROTECTED");
      }
    }
    await tx.mediaCleanupTask.update({ where: { id: source.id }, data: { status: "pending", retryAt: new Date(), lastError: null, leaseToken: null, leaseUntil: null } });
    return source.id;
  }
  if (job.kind === "assistant") {
    const source = await tx.assistantExecution.findUnique({ where: { id: job.sourceId }, include: { inputAssets: true } });
    if (!source || !source.inputSnapshot || source.status !== "failed") fail("QUEUE_REDRIVE_SOURCE_MISSING");
    const snapshot = assistantInputSnapshotSchema.safeParse(source.inputSnapshot);
    if (!snapshot.success || snapshot.data.assets.length !== source.inputAssets.length ||
      snapshot.data.assets.some(ref => !source.inputAssets.some(stored => stored.assetId === ref.assetId && stored.portId === ref.portId && stored.sortOrder === ref.sortOrder)))
      fail("QUEUE_REDRIVE_INPUT_MISSING");
    assertOwner(job, source.ownerEmail);
    await checkNode(tx, source.ownerEmail, source.graphNodeId, "generate.assistant");
    await checkAssets(tx, source.ownerEmail, source.inputAssets);
    const model = await tx.modelCatalog.findFirst({ where: { key: source.modelKey, type: "llm", isActive: true }, include: { credential: true } });
    if (!model || model.provider !== "openai_compatible") fail("QUEUE_REDRIVE_MODEL_UNAVAILABLE");
    if (!model.credential) fail("QUEUE_REDRIVE_CREDENTIAL_REVOKED");
    try { decryptModelApiKey(model.credential); } catch { fail("QUEUE_REDRIVE_CREDENTIAL_REVOKED"); }
    if (snapshot.data.assets.length && !(model.providerConfig as Prisma.JsonObject).supports_images) fail("QUEUE_REDRIVE_MODEL_UNAVAILABLE");
    const admission = await beginSubmission({ requestId: id, ownerEmail: source.ownerEmail, payloadHash: hashSubmissionPayload(source.inputSnapshot), providerKey: source.modelKey, graphNodeId: source.graphNodeId }, tx);
    if (admission.kind !== "created") fail("QUEUE_REDRIVE_ADMISSION_REJECTED");
    await tx.assistantExecution.create({ data: { id, ownerEmail: source.ownerEmail, graphId: source.graphId,
      graphNodeId: source.graphNodeId, modelKey: source.modelKey, inputSnapshot: source.inputSnapshot as Prisma.InputJsonValue,
      inputAssets: { create: source.inputAssets.map(ref => ({ assetId: ref.assetId, portId: ref.portId, sortOrder: ref.sortOrder })) } } });
    await tx.generationSubmission.update({ where: { requestId: id }, data: { state: "submitted" } });
    return id;
  }
  if (job.kind === "media_operation") {
    const source = await tx.mediaOperation.findUnique({ where: { id: job.sourceId }, include: { inputs: true } });
    if (!source || source.status !== "failed" || !source.graphNodeId || !source.graphId) fail("QUEUE_REDRIVE_SOURCE_MISSING");
    if (!validateNodeConfig(source.type, source.configVersion, { parameters: source.parameters }).supported) fail("QUEUE_REDRIVE_SNAPSHOT_INVALID");
    assertOwner(job, source.ownerEmail);
    await checkNode(tx, source.ownerEmail, source.graphNodeId, source.type, source.configVersion);
    await checkAssets(tx, source.ownerEmail, source.inputs);
    const admission = await beginSubmission({ requestId: id, ownerEmail: source.ownerEmail, payloadHash: hashSubmissionPayload(source.parameters), graphNodeId: source.graphNodeId }, tx);
    if (admission.kind !== "created") fail("QUEUE_REDRIVE_ADMISSION_REJECTED");
    await tx.mediaOperation.create({ data: { id, ownerEmail: source.ownerEmail, graphId: source.graphId, graphNodeId: source.graphNodeId,
      type: source.type, configVersion: source.configVersion, parameters: source.parameters as Prisma.InputJsonValue,
      expectedOutputCount: source.expectedOutputCount, inputs: { create: source.inputs.map(r => ({ assetId: r.assetId, portId: r.portId, sortOrder: r.sortOrder })) } } });
    await tx.generationSubmission.update({ where: { requestId: id }, data: { state: "submitted" } });
    return id;
  }
  const media = job.kind === "generate_image" ? "image" : job.kind === "generate_video" ? "video" : "audio";
  const model = queueGenerationModel(tx, job.kind);
  const source = await model.findUnique({ where: { id: job.sourceId } });
  if (!source || source.status !== "failed" || !source.requestParams) fail("QUEUE_REDRIVE_SOURCE_MISSING");
  assertOwner(job, source.ownerEmail);
  if (job.snapshotRef.includes(":node:") && !source.graphNodeId) fail("QUEUE_REDRIVE_TARGET_CHANGED");
  if (!source.modelKey) fail("QUEUE_REDRIVE_SNAPSHOT_MISSING");
  const frozen = frozenExecutionModel(source.requestParams, media, source.modelKey);
  if (!frozen && !versionedSnapshot(source.requestParams)) fail("QUEUE_REDRIVE_SNAPSHOT_MISSING");
  const activeModel = await tx.modelCatalog.findFirst({ where: { key: source.modelKey, type: media, isActive: true } });
  if (!activeModel) fail("QUEUE_REDRIVE_MODEL_UNAVAILABLE");
  if (activeModel.provider === "modal_comfyui" && !frozen) fail("QUEUE_REDRIVE_SNAPSHOT_MISSING");
  await checkNode(tx, source.ownerEmail, source.graphNodeId, "generate." + media);
  if (source.apiKeyId && !await tx.apiKey.findFirst({ where: { id: source.apiKeyId, ownerEmail: source.ownerEmail, status: "active" } }))
    fail("QUEUE_REDRIVE_CREDENTIAL_REVOKED");
  const refs = await tx.generationInputAsset.findMany({ where: { requestId: source.requestId, generationType: media } });
  await checkAssets(tx, source.ownerEmail, refs);
  const admission = await beginSubmission({ requestId: id, ownerEmail: source.ownerEmail, apiKeyId: source.apiKeyId,
    payloadHash: hashSubmissionPayload(source.requestParams), providerKey: source.modelKey, modelKey: source.modelKey, modelType: media, graphNodeId: source.graphNodeId }, tx);
  if (admission.kind !== "created") fail("QUEUE_REDRIVE_ADMISSION_REJECTED");
  // Scalar data only; result relations and the old execution identity are never copied.
  const data = { ...source, id, requestId: id, status: "pending" as const, progress: 0,
    requestParams: source.requestParams as Prisma.InputJsonValue,
    historyMetadata: source.historyMetadata === null ? Prisma.DbNull : source.historyMetadata as Prisma.InputJsonValue,
    errorMessage: null, hiddenAt: null, finishedAt: null, cancelRequestedAt: null,
    executionLeaseToken: null, executionLeaseUntil: null, executionLeaseVersion: 0,
    createdAt: new Date(), updatedAt: new Date() };
  await model.create({ data });
  if (refs.length) await tx.generationInputAsset.createMany({ data: refs.map(ref => ({
    requestId: id, generationType: media, ownerEmail: source.ownerEmail!, assetId: ref.assetId, field: ref.field, multiple: ref.multiple, sortOrder: ref.sortOrder,
  })) });
  await tx.generationSubmission.update({ where: { requestId: id }, data: { state: "submitted" } });
  return id;
}
