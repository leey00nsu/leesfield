// @vitest-environment node
import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { prisma } from "@/server/db/prisma";
import { postgresIntegrationEnabled } from "@/test-utils/postgres-integration";
import { removeFixtureQueueJobs } from "@/test-utils/job-queue-postgres";
import { createImageGenerationRecord } from "@/server/image-generation/image-generation-repository";
import { createVideoGenerationRecord } from "@/server/video-generation/video-generation-repository";
import { createAudioGenerationRecord } from "@/server/audio-generation/audio-generation-repository";
import { generationQueueHandlers } from "./handlers/generation-handler";
import { createQueueRunner } from "./job-queue-runner";
import { queueDatabaseNow, withQueueTransaction } from "./job-queue-transaction";
import { claimPendingGenerationJobs } from "@/server/generation-worker/execution-lease";
import { nodeExecutionRepository } from "@/server/node-executions/node-execution-repository";
import { createStorageCleanupIntent } from "@/server/media-assets/media-cleanup-repository";

const mocks = vi.hoisted(() => ({ resolve: vi.fn() }));
vi.mock("@/server/generation-request/request-snapshot", () => ({
  snapshotRequest: async (_type: string, value: unknown) => value,
  frozenExecutionModel: () => undefined,
}));
vi.mock("@/server/generation-worker/generation-payload", () => {
  const runtime = async () => ({ modelMap: new Map(), modelKeys: [], defaultKey: "test", fallbackDefaults: {} });
  const payload = async (row: { prompt: string; modelKey: string }) => {
    if (row.prompt === "missing-input") throw new Error("GENERATION_INPUT_ASSET_MISSING");
    return { prompt: row.prompt, model: row.modelKey };
  };
  return { getImageRuntimeState: runtime, getVideoRuntimeState: runtime, getAudioRuntimeState: runtime,
    buildImagePayload: payload, buildVideoPayload: payload, buildAudioPayload: payload };
});
vi.mock("@/server/model-catalog/generation-validation", () => {
  const validate = async (data: unknown) => ({ success: true, data });
  return { validateImageGenerationPayload: validate, validateVideoGenerationPayload: validate, validateAudioGenerationPayload: validate };
});
vi.mock("@/server/image-generation/image-generation", () => ({ resolveImageGenerationResult: mocks.resolve }));
vi.mock("@/server/video-generation/video-generation", () => ({ resolveVideoGenerationResult: mocks.resolve }));
vi.mock("@/server/audio-generation/audio-generation", () => ({ resolveAudioGenerationResult: mocks.resolve }));

describe.skipIf(!postgresIntegrationEnabled)("generation common queue integration", () => {
  const ownerEmail = "queue-generation-test@example.com";
  const modelKey = "queue-generation-" + randomUUID();
  let r: ReturnType<typeof createQueueRunner> | undefined;
  beforeAll(async () => {
    await prisma.queueRuntime.update({ where: { id: 1 }, data: { mode: "shared", migrationVerified: true } });
    for (const type of ["image", "video", "audio"] as const) await prisma.modelCatalog.create({ data: {
      type, key: modelKey + type, label: "test", vendor: "test", provider: "hf_space",
      providerConfig: {}, parameters: {}, meta: { concurrent_limit: 4 }, isActive: true,
    } });
  });
  afterEach(async () => {
    await r?.stop({ drainTimeoutMs: 500 }); r = undefined;
    await removeFixtureQueueJobs((await prisma.mediaCleanupTask.findMany({ where: { ownerEmail }, select: { id: true } })).map(t => t.id));
    const jobs = await prisma.queueJob.findMany({ where: { sourceId: { in: [
      ...(await prisma.imageGeneration.findMany({ where: { ownerEmail }, select: { id: true } })).map(v => v.id),
      ...(await prisma.videoGeneration.findMany({ where: { ownerEmail }, select: { id: true } })).map(v => v.id),
      ...(await prisma.audioGeneration.findMany({ where: { ownerEmail }, select: { id: true } })).map(v => v.id),
    ] } } });
    const ids = jobs.map(j => j.id);
    await withQueueTransaction(async tx => {
      await tx.queueAttempt.updateMany({ where: { jobId: { in: ids }, finishedAt: null }, data: { phase: "ended", outcome: "cancelled", finishedAt: await queueDatabaseNow(tx) } });
      await tx.queueJob.updateMany({ where: { id: { in: ids } }, data: { status: "cancelled", currentAttemptId: null } });
      await tx.queueDeadLetter.deleteMany({ where: { jobId: { in: ids } } });
      await tx.queueReservation.deleteMany({ where: { attempt: { jobId: { in: ids } } } });
      await tx.queueAttempt.deleteMany({ where: { jobId: { in: ids } } });
      await tx.queueJobResource.deleteMany({ where: { jobId: { in: ids } } });
      await tx.queueJob.deleteMany({ where: { id: { in: ids } } });
    });
    await prisma.imageGeneration.deleteMany({ where: { ownerEmail } });
    await prisma.videoGeneration.deleteMany({ where: { ownerEmail } });
    await prisma.audioGeneration.deleteMany({ where: { ownerEmail } });
    await prisma.generationGraph.deleteMany({ where: { ownerEmail } });
    await prisma.mediaCleanupTask.deleteMany({ where: { ownerEmail } });
    await prisma.mediaAsset.deleteMany({ where: { ownerEmail } });
    mocks.resolve.mockReset();
  });
  afterAll(async () => {
    try {
      await prisma.queueResource.deleteMany({ where: { modelKey: { startsWith: modelKey } } });
      await prisma.modelCatalog.deleteMany({ where: { key: { startsWith: modelKey } } });
    } finally {
      await prisma.queueRuntime.update({ where: { id: 1 }, data: { mode: "paused", migrationVerified: false } });
    }
  });
  function artifact(type: "image" | "video" | "audio") {
    return { type, storageProvider: "leemage" as const, storageObjectId: randomUUID(),
      storageUrl: "https://cdn.example.com/output", mimeType: type === "image" ? "image/png" : type === "video" ? "video/mp4" : "audio/wav",
      bytes: 128, width: type === "audio" ? null : 64, height: type === "audio" ? null : 64, durationMs: type === "image" ? null : 1000 };
  }
  it("registers all three sources even without file refs and atomically stores their outputs", async () => {
    const image = await createImageGenerationRecord(randomUUID(), { model: modelKey + "image", prompt: "image" } as never, ownerEmail);
    const video = await createVideoGenerationRecord(randomUUID(), { model: modelKey + "video", prompt: "video" } as never, ownerEmail);
    const audio = await createAudioGenerationRecord(randomUUID(), { model: modelKey + "audio", prompt: "audio" } as never, ownerEmail);
    expect(await prisma.queueJob.count({ where: { sourceId: { in: [image.id, video.id, audio.id] } } })).toBe(3);
    mocks.resolve.mockImplementation(async (payload, _id, lifecycle) => {
      await lifecycle.onUploading();
      const type = payload.model.endsWith("image") ? "image" : payload.model.endsWith("video") ? "video" : "audio";
      return { status: "completed", artifacts: [artifact(type)] };
    });
    r = createQueueRunner(generationQueueHandlers);
    await r.pump(); await r.drain();
    expect(mocks.resolve).toHaveBeenCalledTimes(3);
    expect(await prisma.imageGeneration.findUnique({ where: { id: image.id } })).toMatchObject({ status: "completed" });
    expect(await prisma.videoGeneration.findUnique({ where: { id: video.id } })).toMatchObject({ status: "completed" });
    expect(await prisma.audioGeneration.findUnique({ where: { id: audio.id } })).toMatchObject({ status: "completed" });
    expect(await prisma.mediaAsset.count({ where: { ownerEmail } })).toBe(3);
    expect(await prisma.queueJob.count({ where: { sourceId: { in: [image.id, video.id, audio.id] }, status: "succeeded" } })).toBe(3);
  });

  it("rolls back both source and queue on registration failure and refuses the old scheduler", async () => {
    const id = randomUUID();
    await expect(withQueueTransaction(async tx => {
      await createImageGenerationRecord(id, { model: modelKey + "image", prompt: "rollback" } as never, ownerEmail, null, null, undefined, [], undefined, tx);
      throw new Error("ROLLBACK_SOURCE");
    })).rejects.toThrow("ROLLBACK_SOURCE");
    expect(await prisma.imageGeneration.findUnique({ where: { requestId: id } })).toBeNull();
    const row = await createImageGenerationRecord(randomUUID(), { model: modelKey + "image", prompt: "queued" } as never, ownerEmail);
    expect(await claimPendingGenerationJobs({ mediaType: "image", modelKeys: [modelKey + "image"], defaultKey: modelKey + "image", getModelLimit: () => 4 })).toEqual([]);
    expect((await prisma.imageGeneration.findUnique({ where: { id: row.id } }))?.status).toBe("pending");
  });

  it("does not automatically call the provider again after an ambiguous failure", async () => {
    const row = await createImageGenerationRecord(randomUUID(), { model: modelKey + "image", prompt: "failure" } as never, ownerEmail);
    mocks.resolve.mockResolvedValue({ status: "failed", errorMessage: "safe failure" });
    r = createQueueRunner(generationQueueHandlers);
    await r.pump(); await r.drain(); await r.pump();
    expect(mocks.resolve).toHaveBeenCalledTimes(1);
    const job = await prisma.queueJob.findFirstOrThrow({ where: { sourceId: row.id } });
    expect(job.status).toBe("reconciliation_required");
    expect(await prisma.queueDeadLetter.count({ where: { jobId: job.id, classification: "reconciliation" } })).toBe(1);
    expect((await prisma.imageGeneration.findUnique({ where: { id: row.id } }))?.status).toBe("failed");
  });

  it("releases slots for missing durable input before any provider call", async () => {
    const row = await createImageGenerationRecord(randomUUID(), { model: modelKey + "image", prompt: "missing-input" } as never, ownerEmail);
    r = createQueueRunner(generationQueueHandlers);
    await r.pump(); await r.drain();
    const job = await prisma.queueJob.findFirstOrThrow({ where: { sourceId: row.id } });
    expect(job.status).toBe("dead_letter"); expect(mocks.resolve).not.toHaveBeenCalled();
    expect(await prisma.queueDeadLetter.count({ where: { jobId: job.id, classification: "terminal", safeErrorCode: "QUEUE_INPUT_UNAVAILABLE" } })).toBe(1);
    expect(await prisma.queueReservation.count({ where: { attempt: { jobId: job.id }, releasedAt: null } })).toBe(0);
  });

  it("finishes an admitted upload while paused and keeps cleanup bookkeeping durable without dispatch", async () => {
    const row = await createImageGenerationRecord(randomUUID(), { model: modelKey + "image", prompt: "pause-drain" } as never, ownerEmail);
    mocks.resolve.mockImplementation(async (_payload, requestId, lifecycle) => {
      await prisma.queueRuntime.update({ where: { id: 1 }, data: { mode: "paused" } });
      await lifecycle.onUploading();
      const result = artifact("image");
      await createStorageCleanupIntent(undefined, { ownerEmail, requestId, storageProvider: result.storageProvider,
        storageObjectId: result.storageObjectId, reason: "generation_output" });
      return { status: "completed", artifacts: [result] };
    });
    try {
      r = createQueueRunner(generationQueueHandlers);
      await r.pump(); await r.drain();
      expect((await prisma.imageGeneration.findUniqueOrThrow({ where: { id: row.id } })).status).toBe("completed");
      expect((await prisma.queueJob.findFirstOrThrow({ where: { sourceId: row.id } })).status).toBe("succeeded");
      const task = await prisma.mediaCleanupTask.findFirstOrThrow({ where: { requestId: row.requestId } });
      expect(task.status).toBe("linked");
      expect(await prisma.queueJob.count({ where: { sourceId: task.id } })).toBe(0);
      await expect(createImageGenerationRecord(randomUUID(), { model: modelKey + "image", prompt: "new" } as never, ownerEmail)).rejects.toThrow("QUEUE_PAUSED");
      expect(mocks.resolve).toHaveBeenCalledTimes(1);
    } finally { await prisma.queueRuntime.update({ where: { id: 1 }, data: { mode: "shared" } }); }
  });

  it("commits node output selection with queue completion and cancels pending source/queue together", async () => {
    const nodeId = randomUUID();
    const graph = await prisma.generationGraph.create({ data: {
      ownerEmail, title: "queue graph", nodes: { create: { id: nodeId, kind: "generate.image", x: 0, y: 0, configVersion: 1, config: {} } },
    } });
    const row = await createImageGenerationRecord(randomUUID(), { model: modelKey + "image", prompt: "node" } as never,
      ownerEmail, null, nodeId);
    mocks.resolve.mockImplementation(async (_payload, _id, lifecycle) => {
      await lifecycle.onUploading();
      return { status: "completed", artifacts: [artifact("image")] };
    });
    r = createQueueRunner(generationQueueHandlers);
    await r.pump(); await r.drain();
    const node = await prisma.generationGraphNode.findUniqueOrThrow({ where: { id: nodeId } });
    expect(node.selectedOutputAssetId).toBeTruthy();
    expect(await prisma.generationGraphNodeOutput.count({ where: { graphNodeId: nodeId, assetId: node.selectedOutputAssetId! } })).toBe(1);
    expect((await prisma.queueJob.findFirstOrThrow({ where: { sourceId: row.id } })).status).toBe("succeeded");
    await r.stop();
    const pending = await createImageGenerationRecord(randomUUID(), { model: modelKey + "image", prompt: "cancel" } as never,
      ownerEmail, null, nodeId);
    await nodeExecutionRepository.cancelExecution(ownerEmail, graph.id, nodeId, pending.requestId);
    expect((await prisma.imageGeneration.findUniqueOrThrow({ where: { id: pending.id } })).status).toBe("cancelled");
    expect((await prisma.queueJob.findFirstOrThrow({ where: { sourceId: pending.id } })).status).toBe("cancelled");
  });
});
