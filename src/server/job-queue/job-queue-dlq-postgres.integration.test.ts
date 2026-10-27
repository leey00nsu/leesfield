// @vitest-environment node
import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/server/db/prisma";
import { postgresIntegrationEnabled } from "@/test-utils/postgres-integration";
import { removeFixtureQueueJobs } from "@/test-utils/job-queue-postgres";
import { createQueueRunner } from "./job-queue-runner";
import { claimQueueJob } from "./job-queue-scheduler";
import { enqueueQueueJobTx, queueScopeDigest } from "./job-queue-registration";
import { withQueueTransaction } from "./job-queue-transaction";
import { settleQueueFailure, settleQueueSuccess } from "./job-queue-settlement";
import { requestQueueCancellationTx } from "./job-queue-recovery";
import { generationQueueHandlers } from "./handlers/generation-handler";
import { createStorageCleanupHandler } from "./handlers/storage-cleanup-handler";
import { queueStorageCleanup } from "@/server/media-assets/media-cleanup-repository";
import { operateQueue, cancelClosedQueueGroups } from "./job-queue-operations";
import { purgeResolvedQueueDetails } from "./job-queue-retention";
import { listQueueDeadLetters, getQueueDeadLetter } from "./job-queue-dlq";
import { buildModalModelDraft } from "@/server/modal-comfyui/importer";
import workflows from "@/server/modal-comfyui/fixtures/workflows.json";
import type { QueueHandler } from "./job-queue-handler";
import { assistantQueueHandler } from "./handlers/assistant-handler";
import { mediaOperationQueueHandler } from "./handlers/media-operation-handler";
import { setSubmissionLedgerForTests } from "@/server/generation-admission/submission-ledger";
import { getConsoleCapabilities } from "./job-queue-console-capabilities";
import { Client } from "pg";
import { QUEUE_TRANSACTION_LOCK } from "./contracts";

const remote = vi.hoisted(() => ({ json: vi.fn(), upload: vi.fn(), download: vi.fn(), storage: vi.fn(), paid: vi.fn(), frozen: vi.fn() }));
vi.mock("@/server/generation-request/request-snapshot", async original => ({ ...await original<typeof import("@/server/generation-request/request-snapshot")>(), frozenExecutionModel: remote.frozen }));
vi.mock("@/server/generation-worker/generation-payload", () => {
  const runtime = async () => ({});
  const build = async (row: { modelKey: string; prompt: string }) => ({ model: row.modelKey, prompt: row.prompt, width: 64, height: 64 });
  return { getImageRuntimeState: runtime, getVideoRuntimeState: runtime, getAudioRuntimeState: runtime,
    buildImagePayload: build, buildVideoPayload: build, buildAudioPayload: build };
});
vi.mock("@/server/model-catalog/generation-validation", () => {
  const validate = async (data: unknown) => ({ success: true, data });
  return { validateImageGenerationPayload: validate, validateVideoGenerationPayload: validate, validateAudioGenerationPayload: validate };
});
vi.mock("@/server/model-catalog/model-credential", () => ({ getLlmModelApiKey: async () => "test", decryptModelApiKey: () => "test" }));
vi.mock("@/server/image-generation/image-generation", () => ({ resolveImageGenerationResult: remote.paid }));
vi.mock("@/server/video-generation/video-generation", () => ({ resolveVideoGenerationResult: remote.paid }));
vi.mock("@/server/audio-generation/audio-generation", () => ({ resolveAudioGenerationResult: remote.paid }));
vi.mock("@/server/modal-comfyui/client", async original => ({
  ...await original<typeof import("@/server/modal-comfyui/client")>(),
  createModalClient: () => ({ origin: "https://queue-test.modal.run", json: remote.json, upload: remote.upload, download: remote.download }),
}));
vi.mock("@/server/modal-comfyui/output-metadata", () => ({ modalOutputMetadata: async () => ({ width: 64, height: 64 }) }));
vi.mock("@/server/video-generation/storage/adapters/leemage-storage-adapter", () => ({ leemageVideoStorageAdapter: { uploadVideos: remote.storage } }));

describe.skipIf(!postgresIntegrationEnabled)("DLQ operator persistence", () => {
  const ownerEmail = "queue-dlq-" + randomUUID() + "@example.com";
  const actor = "queue-operator@example.com";
  const digest = () => queueScopeDigest(ownerEmail);
  const modelPrefix = "queue-dlq-" + randomUUID();
  let runner: ReturnType<typeof createQueueRunner> | undefined;
  const image = generationQueueHandlers.find(h => h.kind === "generate_image")!;
  const video = generationQueueHandlers.find(h => h.kind === "generate_video")!;
  beforeEach(() => { remote.frozen.mockReturnValue({ provider: "modal_comfyui" }); });
  beforeAll(async () => {
    setSubmissionLedgerForTests(null);
    await prisma.queueRuntime.update({ where: { id: 1 }, data: { mode: "shared", migrationVerified: true } });
    for (const type of ["image", "video", "audio", "llm"] as const) await prisma.modelCatalog.create({ data: {
      type, key: modelPrefix + type, label: "test", vendor: "test", provider: type === "llm" ? "openai_compatible" : "modal_comfyui",
      providerConfig: { supports_images: true }, parameters: {}, meta: { concurrent_limit: 4 }, isActive: true,
      ...(type === "llm" ? { credential: { create: { ciphertext: "test", iv: "test", tag: "test" } } } : {}),
    } });
  });
  afterEach(async () => {
    await runner?.stop(); runner = undefined;
    const jobs = await prisma.queueJob.findMany({ where: { ownerScopeDigest: digest() } });
    const cleanups = await prisma.mediaCleanupTask.findMany({ where: { ownerEmail } });
    await removeFixtureQueueJobs([...jobs.map(j => j.sourceId), ...cleanups.map(t => t.id)]);
    await prisma.queueOrderGroup.deleteMany({ where: { ownerScopeDigest: digest() } });
    await prisma.queueAdminAction.deleteMany({ where: { actorDigest: queueScopeDigest(actor) } });
    const requests = [
      ...(await prisma.imageGeneration.findMany({ where: { ownerEmail } })).map(r => r.requestId),
      ...(await prisma.videoGeneration.findMany({ where: { ownerEmail } })).map(r => r.requestId),
      ...(await prisma.audioGeneration.findMany({ where: { ownerEmail } })).map(r => r.requestId),
    ];
    await prisma.modalComfyJob.deleteMany({ where: { requestId: { in: requests } } });
    await prisma.generationInputAsset.deleteMany({ where: { ownerEmail } });
    await prisma.imageGeneration.deleteMany({ where: { ownerEmail } });
    await prisma.videoGeneration.deleteMany({ where: { ownerEmail } });
    await prisma.audioGeneration.deleteMany({ where: { ownerEmail } });
    await prisma.assistantExecution.deleteMany({ where: { ownerEmail } });
    await prisma.mediaOperation.deleteMany({ where: { ownerEmail } });
    await prisma.generationGraph.deleteMany({ where: { ownerEmail } });
    await prisma.mediaCleanupTask.deleteMany({ where: { ownerEmail } });
    await prisma.mediaAsset.deleteMany({ where: { ownerEmail } });
    await prisma.generationSubmission.deleteMany({ where: { ownerEmail } });
    await prisma.modelCatalog.updateMany({ where: { key: { startsWith: modelPrefix } }, data: { isActive: true } });
    vi.resetAllMocks();
  });
  afterAll(async () => {
    await prisma.queueResource.deleteMany({ where: { modelKey: { startsWith: modelPrefix } } });
    await prisma.modelCatalog.deleteMany({ where: { key: { startsWith: modelPrefix } } });
    await prisma.queueRuntime.update({ where: { id: 1 }, data: { mode: "paused", migrationVerified: false } });
  });
  function command(version = 0) { return { requestId: randomUUID(), expectedVersion: version, reason: "CAUSE_FIXED" }; }
  async function source(media: "image" | "video" = "image", orderKey?: string) {
    const delegate = (media === "image" ? prisma.imageGeneration : prisma.videoGeneration) as typeof prisma.imageGeneration;
    const row = await delegate.create({ data: { requestId: randomUUID(), ownerEmail, prompt: "private frozen prompt",
      requestParams: { snapshot: true }, modelKey: modelPrefix + media, status: "pending", progress: 0 } });
    const job = await withQueueTransaction(tx => enqueueQueueJobTx(tx, { kind: media === "image" ? "generate_image" : "generate_video",
      source: { type: media === "image" ? "image_generation" : "video_generation", id: row.id },
      snapshotRef: media + ":" + row.id + ":classic", ownerScopeDigest: digest(), orderKey,
      resources: [{ type: "model", key: "model:" + modelPrefix + media, modelType: media, modelKey: modelPrefix + media }] }));
    return { row, job };
  }
  async function fail(handler: QueueHandler, uncertain = false) {
    const claim = await claimQueueJob(randomUUID(), (tx, job, lease) => handler.prepareTx(tx, job, lease));
    expect(claim).not.toBeNull();
    if (!claim) throw new Error("CLAIM_MISSING");
    await settleQueueFailure(claim.lease, handler, { code: "TEST_FAILED", phase: "execute",
      disposition: uncertain ? "reconciliation" : "terminal", executionStopped: !uncertain });
    return prisma.queueDeadLetter.findUniqueOrThrow({ where: { failedAttemptId: claim.attemptId } });
  }
  const artifact = (type: "image" | "video") => ({ type, storageProvider: "leemage" as const,
    storageObjectId: randomUUID(), storageUrl: "https://example.com/output", mimeType: type + (type === "image" ? "/png" : "/mp4"),
    bytes: 16, width: 64, height: 64, durationMs: type === "video" ? 1000 : null });

  it("deduplicates concurrent redrive, keeps original failure/order and resolves only after success", async () => {
    const key = randomUUID(); const first = await source("image", key); const second = await source("image", key);
    const entry = await fail(image);
    expect((await getConsoleCapabilities(entry.id)).redrive.status).toBe("requires_validation");
    const input = command();
    const responses = await Promise.all(Array.from({ length: 8 }, () => operateQueue(actor, "redrive", entry.id, input)));
    expect(new Set(responses.map(r => JSON.stringify(r))).size).toBe(1);
    const requeued = await prisma.queueJob.findUniqueOrThrow({ where: { id: first.job.id } });
    expect(requeued).toMatchObject({ sourceId: first.row.id, sequence: first.job.sequence, cycle: 2, status: "ready" });
    expect(requeued.executionId).not.toBe(first.row.id);
    expect((await prisma.imageGeneration.findUniqueOrThrow({ where: { id: first.row.id } })).status).toBe("failed");
    expect((await prisma.imageGeneration.findUniqueOrThrow({ where: { id: requeued.executionId } })).prompt).toBe(first.row.prompt);
    await expect(operateQueue(actor, "redrive", entry.id, { ...input, reason: "DIFFERENT" })).rejects.toThrow("QUEUE_REQUEST_ID_CONFLICT");
    const starts: string[] = [];
    runner = createQueueRunner([{ ...image, async execute(job) {
      starts.push(job.executionId); return { media: "image", result: { status: "completed", artifacts: [artifact("image")] } };
    } }]);
    for (let i = 0; i < 3; i++) { await runner.pump(); await runner.drain(); }
    expect(starts).toEqual([requeued.executionId, second.row.id]);
    expect((await prisma.queueDeadLetter.findUniqueOrThrow({ where: { id: entry.id } })).state).toBe("resolved");
    expect((await prisma.queueAttempt.findUniqueOrThrow({ where: { id: entry.failedAttemptId } })).outcome).toBe("failed");
  });
  it("preserves rejected request dedupe and refuses changed model/input without creating a new execution", async () => {
    const first = await source(); const entry = await fail(image);
    await prisma.modelCatalog.update({ where: { key: modelPrefix + "image" }, data: { isActive: false } });
    const input = command();
    const response = await operateQueue(actor, "redrive", entry.id, input);
    expect(response).toMatchObject({ outcome: "rejected", result: { code: "QUEUE_REDRIVE_MODEL_UNAVAILABLE" } });
    await prisma.modelCatalog.update({ where: { key: modelPrefix + "image" }, data: { isActive: true } });
    expect(await operateQueue(actor, "redrive", entry.id, input)).toEqual(response);
    expect(await prisma.imageGeneration.count({ where: { ownerEmail } })).toBe(1);
    const asset = await prisma.mediaAsset.create({ data: { ownerEmail, type: "image", origin: "upload", storageProvider: "test", storageObjectId: randomUUID(), mimeType: "image/png", status: "failed" } });
    await prisma.generationInputAsset.create({ data: { ownerEmail, requestId: first.row.requestId, generationType: "image", assetId: asset.id, field: "referenceImages", multiple: true } });
    expect(await operateQueue(actor, "redrive", entry.id, command())).toMatchObject({ outcome: "rejected", result: { code: "QUEUE_REDRIVE_INPUT_MISSING" } });
    expect(await prisma.generationSubmission.count({ where: { ownerEmail } })).toBe(0);
  });
  it("checks Modal evidence with GET, retains running reservations and collects completed work without resubmission", async () => {
    const first = await source("video"); const entry = await fail(video, true);
    expect(await operateQueue(actor, "redrive", entry.id, command())).toMatchObject({ outcome: "rejected", result: { code: "QUEUE_REMOTE_STOP_NOT_CONFIRMED" } });
    const config = buildModalModelDraft(workflows.find(w => w.id === "minimax-h3-pdd-fl2va")).providerConfig;
    await prisma.modalComfyJob.create({ data: { requestId: first.row.requestId, jobId: "known-job", fingerprint: "input",
      submission: JSON.parse(JSON.stringify({ inputs: {}, advanced: {}, execution: { config, values: {}, origin: "https://queue-test.modal.run" } })) } });
    const capabilities=await getConsoleCapabilities(entry.id);
    expect(capabilities.redrive.status).toBe("blocked");
    expect(capabilities.reconcile).toMatchObject({status:"requires_validation",evidenceRef:"modal:"+first.row.requestId});
    expect(remote.json).not.toHaveBeenCalled();expect(remote.paid).not.toHaveBeenCalled();
    remote.json.mockResolvedValue({ id: "known-job", status: "in_progress" });
    const checking = { ...command(), evidenceRef: "modal:" + first.row.requestId };
    expect(await operateQueue(actor, "reconcile", entry.id, checking)).toMatchObject({ outcome: "failed", result: { code: "QUEUE_REMOTE_STILL_UNCONFIRMED" } });
    expect(await prisma.queueReservation.count({ where: { attempt: { jobId: first.job.id }, releasedAt: null } })).toBe(2);
    remote.json.mockImplementation(async (path: string, init?: RequestInit) => {
      if (init?.method && init.method !== "GET") throw new Error("REMOTE_WRITE_FORBIDDEN");
      if (path.endsWith("/assets")) return { job_id: "known-job", assets: [{ id: "output", output_key: "video", media_type: "video" }], pagination: { has_more: false } };
      return { id: "known-job", status: "completed" };
    });
    // Administrative releases use the database clock even on a slower worker.
    try {
      vi.setSystemTime(new Date(Date.now() - 60_000));
      expect(await operateQueue(actor, "reconcile", entry.id, { ...checking, requestId: randomUUID() })).toMatchObject({ outcome: "succeeded" });
    } finally { vi.useRealTimers(); }
    expect(await prisma.queueReservation.count({ where: { attempt: { jobId: first.job.id }, releasedAt: null } })).toBe(0);
    expect(await operateQueue(actor, "redrive", entry.id, command(1))).toMatchObject({ outcome: "succeeded", result: { mode: "collect" } });
    remote.download.mockResolvedValue({ buffer: Buffer.from("video"), contentType: "video/mp4", bytes: 5 });
    remote.storage.mockResolvedValue({ status: "completed", artifacts: [artifact("video")] });
    runner = createQueueRunner([video]); await runner.pump(); await runner.drain();
    expect((await prisma.queueJob.findUniqueOrThrow({ where: { id: first.job.id } })).status).toBe("succeeded");
    expect(remote.paid).not.toHaveBeenCalled(); expect(remote.upload).not.toHaveBeenCalled();
    expect(remote.json.mock.calls.every(([, init]) => !init?.method || init.method === "GET")).toBe(true);
    expect((await prisma.videoGeneration.findUniqueOrThrow({ where: { id: first.row.id } })).status).toBe("failed");
  });
  it("abandon keeps the order blocker and uncertain reservation beyond detail retention", async () => {
    const first = await source("image", randomUUID()); const entry = await fail(image, true);
    await operateQueue(actor, "abandon", entry.id, command());
    await prisma.queueDeadLetter.update({ where: { id: entry.id }, data: { resolvedAt: new Date(Date.now() - 40 * 86_400_000) } });
    await purgeResolvedQueueDetails();
    expect((await prisma.queueDeadLetter.findUniqueOrThrow({ where: { id: entry.id } })).detailPurgedAt).toBeNull();
    expect((await prisma.queueOrderGroup.findUniqueOrThrow({ where: { id: first.job.orderGroupId! } })).blockedByJobId).toBe(first.job.id);
    expect(await prisma.queueReservation.count({ where: { attempt: { jobId: first.job.id }, releasedAt: null } })).toBe(2);
  });
  it("purges resolved details after thirty days but retains identity, attempts and request audit", async () => {
    const first = await source(); const entry = await fail(image); const input = command();
    const response = await operateQueue(actor, "abandon", entry.id, input);
    await prisma.queueDeadLetter.update({ where: { id: entry.id }, data: { resolvedAt: new Date(Date.now() - 31 * 86_400_000) } });
    await purgeResolvedQueueDetails();
    expect(await prisma.queueDeadLetter.findUnique({ where: { id: entry.id } })).toMatchObject({ detail: null, detailPurgedAt: expect.any(Date) });
    expect(await operateQueue(actor, "abandon", entry.id, input)).toEqual(response);
    expect(await prisma.queueAttempt.count({ where: { jobId: first.job.id } })).toBe(1);
    const listed = await listQueueDeadLetters({ kind: "generate_image", state: "abandoned", limit: 1 });
    expect(listed.items[0].id).toBe(entry.id);
    expect(JSON.stringify(await getQueueDeadLetter(entry.id), (_k, v) => typeof v === "bigint" ? v.toString() : v)).not.toContain("private frozen prompt");
  });
  it("redrives cleanup into a new cycle with its lifetime attempts and fresh backoff", async () => {
    const task = await queueStorageCleanup(undefined, { ownerEmail, storageProvider: "leemage", storageObjectId: randomUUID(), reason: "upload_failed" });
    const cleanup = createStorageCleanupHandler();
    const entry = await fail(cleanup);
    expect((await getConsoleCapabilities(entry.id)).redrive.status).toBe("requires_validation");
    expect(await operateQueue(actor, "redrive", entry.id, command())).toMatchObject({ outcome: "succeeded", result: { executionId: task.id, cycle: 2 } });
    const claim = await claimQueueJob(randomUUID(), (tx, job, lease) => cleanup.prepareTx(tx, job, lease));
    await settleQueueFailure(claim!.lease, cleanup, { code: "DELETE_FAILED", phase: "storage.delete", disposition: "retry", executionStopped: true });
    expect((await prisma.mediaCleanupTask.findUniqueOrThrow({ where: { id: task.id } })).attempts).toBe(2);
    const job = await prisma.queueJob.findFirstOrThrow({ where: { sourceId: task.id } });
    expect(job.status).toBe("retry_wait");
    expect(job.availableAt.getTime() - Date.now()).toBeLessThan(65_000);
    expect((await prisma.queueDeadLetter.findUniqueOrThrow({ where: { id: entry.id } })).state).toBe("redriven");
  });
  it("cannot replace an abandoned cleanup intent while its remote deletion remains uncertain", async () => {
    const input = { ownerEmail, storageProvider: "leemage", storageObjectId: randomUUID(), reason: "upload_failed" as const };
    const task = await queueStorageCleanup(undefined, input);
    const entry = await fail(createStorageCleanupHandler(), true);
    await operateQueue(actor, "abandon", entry.id, command());
    await expect(queueStorageCleanup(undefined, input)).rejects.toThrow("QUEUE_CLEANUP_REQUIRES_OPERATOR");
    expect((await prisma.mediaCleanupTask.findUniqueOrThrow({ where: { id: task.id } })).queueRevision).toBe(task.queueRevision);
    expect(await prisma.queueJob.count({ where: { sourceId: task.id } })).toBe(1);
    expect(await prisma.queueReservation.count({ where: { attempt: { jobId: entry.jobId }, releasedAt: null } })).toBe(1);
  });
  it("creates new assistant/media executions while preserving their source snapshots and input relations", async () => {
    const graph = await prisma.generationGraph.create({ data: { ownerEmail, title: "redrive" } });
    const assistantNode = await prisma.generationGraphNode.create({ data: { id: randomUUID(), graphId: graph.id,
      kind: "generate.assistant", configVersion: 1, config: {}, x: 0, y: 0 } });
    const mediaNode = await prisma.generationGraphNode.create({ data: { id: randomUUID(), graphId: graph.id,
      kind: "edit.video.extractFrames", configVersion: 1, config: { parameters: {} }, x: 0, y: 0 } });
    const asset = await prisma.mediaAsset.create({ data: { ownerEmail, type: "video", origin: "upload",
      storageProvider: "leemage", storageObjectId: randomUUID(), mimeType: "video/mp4" } });
    const a = await prisma.assistantExecution.create({ data: { ownerEmail, graphId: graph.id, graphNodeId: assistantNode.id,
      modelKey: modelPrefix + "llm", inputSnapshot: { instruction: "original", text: null,
        assets: [{ assetId: asset.id, type: "video", portId: "reference", sortOrder: 0 }] },
      inputAssets: { create: { assetId: asset.id, portId: "reference", sortOrder: 0 } } } });
    const aJob = await withQueueTransaction(tx => enqueueQueueJobTx(tx, { kind: "assistant",
      source: { type: "assistant_execution", id: a.id }, ownerScopeDigest: digest(), snapshotRef: "assistant:" + a.id }));
    const aEntry = await fail(assistantQueueHandler);
    expect((await getConsoleCapabilities(aEntry.id)).redrive.status).toBe("requires_validation");
    const llm=await prisma.modelCatalog.findUniqueOrThrow({where:{key:modelPrefix+"llm"},select:{id:true}});
    await prisma.modelCredential.delete({where:{modelId:llm.id}});
    expect((await getConsoleCapabilities(aEntry.id)).redrive.reasons).toContain("QUEUE_REDRIVE_CREDENTIAL_REVOKED");
    await prisma.modelCredential.create({data:{modelId:llm.id,ciphertext:"test",iv:"test",tag:"test"}});
    await prisma.generationGraphNode.update({where:{id:assistantNode.id},data:{kind:"changed"}});
    expect((await getConsoleCapabilities(aEntry.id)).redrive.reasons).toContain("QUEUE_REDRIVE_TARGET_CHANGED");
    await prisma.generationGraphNode.update({where:{id:assistantNode.id},data:{kind:"generate.assistant"}});
    const active=await prisma.assistantExecution.create({data:{ownerEmail,graphId:graph.id,graphNodeId:assistantNode.id,modelKey:modelPrefix+"llm",inputSnapshot:{}}});
    expect((await getConsoleCapabilities(aEntry.id)).redrive.reasons).toContain("QUEUE_REDRIVE_NODE_ACTIVE");
    await prisma.assistantExecution.delete({where:{id:active.id}});
    expect(await operateQueue(actor, "redrive", aEntry.id, command())).toMatchObject({ outcome: "succeeded" });
    const nextAssistant = await prisma.queueJob.findUniqueOrThrow({ where: { id: aJob.id } });
    expect(await prisma.assistantExecution.findUnique({ where: { id: nextAssistant.executionId } })).toMatchObject({ inputSnapshot: a.inputSnapshot, status: "pending" });
    expect(await prisma.assistantExecutionInputAsset.count({ where: { executionId: nextAssistant.executionId } })).toBe(1);
    // Keep the assistant parked while independently testing the media source.
    await prisma.queueJob.update({ where: { id: aJob.id }, data: { status: "suspended" } });
    const m = await prisma.mediaOperation.create({ data: { ownerEmail, graphId: graph.id, graphNodeId: mediaNode.id,
      type: "edit.video.extractFrames", configVersion: 1, parameters: {}, expectedOutputCount: 2,
      inputs: { create: { assetId: asset.id, portId: "video", sortOrder: 0 } } } });
    const mJob = await withQueueTransaction(tx => enqueueQueueJobTx(tx, { kind: "media_operation",
      source: { type: "media_operation", id: m.id }, ownerScopeDigest: digest(), snapshotRef: "media-operation:" + m.id }));
    const mEntry = await fail(mediaOperationQueueHandler);
    expect((await getConsoleCapabilities(mEntry.id)).redrive.status).toBe("requires_validation");
    expect(await operateQueue(actor, "redrive", mEntry.id, command())).toMatchObject({ outcome: "succeeded" });
    const nextMedia = await prisma.queueJob.findUniqueOrThrow({ where: { id: mJob.id } });
    expect(nextMedia.executionId).not.toBe(m.id);
    expect(await prisma.mediaOperationInput.count({ where: { operationId: nextMedia.executionId } })).toBe(1);
    expect(await prisma.mediaOperation.findUnique({ where: { id: m.id } })).toMatchObject({ status: "failed" });
  });
  it("keeps an earlier redriven failure unresolved when its replacement fails again", async () => {
    const first = await source(); const original = await fail(image);
    await operateQueue(actor, "redrive", original.id, command());
    const second = await fail(image);
    expect(second.id).not.toBe(original.id);
    expect((await prisma.queueDeadLetter.findUniqueOrThrow({ where: { id: original.id } })).state).toBe("redriven");
    expect(second.state).toBe("open");
    expect(await prisma.queueAttempt.count({ where: { jobId: first.job.id } })).toBe(2);
    expect(await operateQueue(actor, "redrive", second.id, command())).toMatchObject({ outcome: "succeeded" });
    expect(await prisma.imageGeneration.count({ where: { ownerEmail } })).toBe(3);
  });
  it("closes groups before cancelling bounded batches and prevents claims between batches", async () => {
    const key = randomUUID();
    const first = await withQueueTransaction(tx => enqueueQueueJobTx(tx, { kind: "generate_image",
      source: { type: "image_generation", id: randomUUID() }, ownerScopeDigest: digest(), snapshotRef: "group-fixture", orderKey: key }));
    const resources = await prisma.queueJobResource.findMany({ where: { jobId: first.id } });
    // This case tests cancellation across the 100-job boundary. Register one
    // real job, then seed the remaining equivalent rows in bounded SQL work;
    // 105 sequential registrations consumed the fixture's 5-second transaction.
    const remaining = Array.from({ length: 104 }, (_, index) => {
      const sourceId = randomUUID();
      return { id: randomUUID(), kind: first.kind, sourceType: first.sourceType, sourceId,
        sourceRevision: first.sourceRevision, ownerScopeDigest: first.ownerScopeDigest, snapshotRef: first.snapshotRef,
        executionType: first.executionType, executionId: sourceId, orderGroupId: first.orderGroupId,
        sequence: BigInt(index + 2), availableAt: first.availableAt,
        maxAttempts: first.maxAttempts, retryDelayMs: first.retryDelayMs, policyVersion: first.policyVersion };
    });
    await withQueueTransaction(async tx => {
      await tx.queueJob.createMany({ data: remaining });
      await tx.queueJobResource.createMany({ data: remaining.flatMap(job => resources.map(resource => ({ jobId: job.id, resourceKey: resource.resourceKey }))) });
      await tx.queueOrderGroup.update({ where: { id: first.orderGroupId! }, data: { nextSequence: BigInt(106) } });
    });
    expect(await operateQueue(actor, "cancel_group", first.orderGroupId!, command())).toMatchObject({ outcome: "succeeded", result: { requested: 100 } });
    expect(await claimQueueJob(randomUUID())).toBeNull();
    expect(await cancelClosedQueueGroups()).toBe(5);
    expect(await prisma.queueJob.count({ where: { orderGroupId: first.orderGroupId, status: "cancelled" } })).toBe(105);
  });
  it("keeps a cancelled successor as the blocker after its predecessor succeeds", async () => {
    const key = randomUUID(); const first = await source("image", key); const second = await source("image", key); await source("image", key);
    await withQueueTransaction(async tx => {
      await requestQueueCancellationTx(tx, second.job.id);
      await tx.imageGeneration.update({ where: { id: second.row.id }, data: { status: "cancelled" } });
    });
    const claim = await claimQueueJob(randomUUID(), (tx, job, lease) => image.prepareTx(tx, job, lease));
    expect(claim?.job.id).toBe(first.job.id);
    await settleQueueSuccess(claim!.lease, image, { media: "image", result: { status: "completed", artifacts: [artifact("image")] } });
    expect(await prisma.queueOrderGroup.findUnique({ where: { id: first.job.orderGroupId! } })).toMatchObject({ headSequence: BigInt(2), blockedByJobId: second.job.id });
    expect(await claimQueueJob(randomUUID())).toBeNull();
  });
  it("can verify remote termination after abandonment without reactivating its job or group", async () => {
    const first = await source("video", randomUUID()); const entry = await fail(video, true);
    await operateQueue(actor, "abandon", entry.id, command());
    const config = buildModalModelDraft(workflows.find(w => w.id === "minimax-h3-pdd-fl2va")).providerConfig;
    await prisma.modalComfyJob.create({ data: { requestId: first.row.requestId, jobId: "stopped-job", fingerprint: "input",
      submission: JSON.parse(JSON.stringify({ inputs: {}, advanced: {}, execution: { config, values: {}, origin: "https://queue-test.modal.run" } })) } });
    remote.json.mockResolvedValue({ id: "stopped-job", status: "failed" });
    expect((await getConsoleCapabilities(entry.id)).reconcile.status).toBe("requires_validation");
    expect(await operateQueue(actor, "reconcile", entry.id, { ...command(1), evidenceRef: "modal:" + first.row.requestId })).toMatchObject({ outcome: "succeeded" });
    expect((await prisma.queueJob.findUniqueOrThrow({ where: { id: first.job.id } })).status).toBe("abandoned");
    expect((await prisma.queueOrderGroup.findUniqueOrThrow({ where: { id: first.job.orderGroupId! } })).blockedByJobId).toBe(first.job.id);
    expect(await prisma.queueReservation.count({ where: { attempt: { jobId: first.job.id }, releasedAt: null } })).toBe(0);
    expect(remote.paid).not.toHaveBeenCalled();
  });
  it("redrives versioned non-Modal snapshots without requiring a Modal-only executionModel", async () => {
    remote.frozen.mockReturnValue(undefined);
    await prisma.modelCatalog.update({ where: { key: modelPrefix + "image" }, data: { provider: "hf_space" } });
    const first = await source();
    await prisma.imageGeneration.update({ where: { id: first.row.id }, data: { requestParams: { requestVersion: 3, model: modelPrefix + "image", prompt: "original" } } });
    const entry = await fail(image);
    expect(await operateQueue(actor, "redrive", entry.id, command())).toMatchObject({ outcome: "succeeded" });
  });
  it("previews source, owner, model, input, runtime and group failures with safe reasons", async () => {
    const first=await source("image",randomUUID()),entry=await fail(image);
    const reason=async()=> (await getConsoleCapabilities(entry.id)).redrive.reasons;
    await prisma.queueRuntime.update({where:{id:1},data:{mode:"paused"}});expect(await reason()).toContain("QUEUE_PAUSED");
    await prisma.queueRuntime.update({where:{id:1},data:{mode:"shared"}});
    await prisma.queueOrderGroup.update({where:{id:first.job.orderGroupId!},data:{closedAt:new Date()}});expect(await reason()).toContain("QUEUE_GROUP_CLOSED");
    await prisma.queueOrderGroup.update({where:{id:first.job.orderGroupId!},data:{closedAt:null}});
    await prisma.imageGeneration.update({where:{id:first.row.id},data:{ownerEmail:"changed@example.com"}});expect(await reason()).toContain("QUEUE_REDRIVE_OWNER_CHANGED");
    await prisma.imageGeneration.update({where:{id:first.row.id},data:{ownerEmail}});
    await prisma.modelCatalog.update({where:{key:modelPrefix+"image"},data:{isActive:false}});expect(await reason()).toContain("QUEUE_REDRIVE_MODEL_UNAVAILABLE");
    await prisma.modelCatalog.update({where:{key:modelPrefix+"image"},data:{isActive:true}});
    remote.frozen.mockReturnValue(undefined);expect(await reason()).toContain("QUEUE_REDRIVE_SNAPSHOT_MISSING");remote.frozen.mockReturnValue({provider:"modal_comfyui"});
    remote.frozen.mockImplementationOnce(()=>{throw new Error("SECRET_BAD_SNAPSHOT");});expect(await reason()).toContain("QUEUE_REDRIVE_SNAPSHOT_INVALID");
    const asset=await prisma.mediaAsset.create({data:{ownerEmail,type:"image",origin:"upload",storageProvider:"fixture",storageObjectId:randomUUID(),mimeType:"image/png",status:"failed"}});
    await prisma.generationInputAsset.create({data:{ownerEmail,requestId:first.row.requestId,generationType:"image",assetId:asset.id,field:"referenceImages",multiple:true}});
    expect(await reason()).toContain("QUEUE_REDRIVE_INPUT_MISSING");
    await prisma.mediaAsset.update({where:{id:asset.id},data:{status:"completed"}});
    expect((await getConsoleCapabilities(entry.id)).redrive.status).toBe("requires_validation");
    await prisma.generationSubmission.createMany({data:Array.from({length:20},()=>({requestId:randomUUID(),ownerEmail,scope:"fixture",payloadHash:"fixture",state:"preparing",expiresAt:new Date(Date.now()+60000)}))});
    expect(await reason()).toContain("QUEUE_REDRIVE_OWNER_LIMIT");await prisma.generationSubmission.deleteMany({where:{ownerEmail}});
    await prisma.imageGeneration.delete({where:{id:first.row.id}});expect(await reason()).toContain("QUEUE_REDRIVE_SOURCE_MISSING");
    expect(remote.json).not.toHaveBeenCalled();expect(remote.paid).not.toHaveBeenCalled();
  });
  it("previews under queue and asset locks without creating executions, writes or provider calls", async () => {
    const first=await source(),entry=await fail(image);
    const asset=await prisma.mediaAsset.create({data:{ownerEmail,type:"image",origin:"upload",storageProvider:"fixture",storageObjectId:randomUUID(),mimeType:"image/png"}});
    await prisma.generationInputAsset.create({data:{ownerEmail,requestId:first.row.requestId,generationType:"image",assetId:asset.id,field:"referenceImages",multiple:true}});
    const before={job:await prisma.queueJob.findUnique({where:{id:first.job.id}}),entry:await prisma.queueDeadLetter.findUnique({where:{id:entry.id}}),
      sources:await prisma.imageGeneration.count({where:{ownerEmail}}),audit:await prisma.queueAdminAction.count(),admission:await prisma.generationSubmission.count({where:{ownerEmail}})};
    const client=new Client({connectionString:process.env.DATABASE_URL});await client.connect();
    try{
      await client.query("BEGIN");await client.query("SELECT pg_advisory_xact_lock(hashtext($1))",[QUEUE_TRANSACTION_LOCK]);
      await client.query('SELECT id FROM "MediaAsset" WHERE id=$1 FOR UPDATE',[asset.id]);
      const cap=await getConsoleCapabilities(entry.id);expect(cap.redrive.status).toBe("requires_validation");
      expect(JSON.stringify(cap)).not.toContain("private frozen prompt");expect(JSON.stringify(cap)).not.toContain(ownerEmail);
      expect(await prisma.queueJob.findUnique({where:{id:first.job.id}})).toEqual(before.job);
      expect(await prisma.queueDeadLetter.findUnique({where:{id:entry.id}})).toEqual(before.entry);
      expect(await prisma.imageGeneration.count({where:{ownerEmail}})).toBe(before.sources);
      expect(await prisma.queueAdminAction.count()).toBe(before.audit);expect(await prisma.generationSubmission.count({where:{ownerEmail}})).toBe(before.admission);
      expect(remote.json).not.toHaveBeenCalled();expect(remote.upload).not.toHaveBeenCalled();expect(remote.paid).not.toHaveBeenCalled();
    }finally{await client.query("ROLLBACK");await client.end();}
  });
});
