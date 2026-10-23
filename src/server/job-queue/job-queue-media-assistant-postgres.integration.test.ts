// @vitest-environment node
import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { prisma } from "@/server/db/prisma";
import { postgresIntegrationEnabled } from "@/test-utils/postgres-integration";
import { removeFixtureQueueJobs } from "@/test-utils/job-queue-postgres";
import { createAssistantExecution, cancelAssistantExecution } from "@/server/assistant-executions/assistant-execution-repository";
import { mediaAssetRepository } from "@/server/media-assets/media-asset-repository";
import { assistantQueueHandler } from "./handlers/assistant-handler";
import { mediaOperationQueueHandler } from "./handlers/media-operation-handler";
import { createQueueRunner } from "./job-queue-runner";
import { withQueueTransaction } from "./job-queue-transaction";

const stubs = vi.hoisted(() => ({ llm: vi.fn(), frames: vi.fn(), upload: vi.fn() }));
vi.mock("@/server/model-catalog/catalog-service", () => ({ getModelCatalog: async () => [{
  type: "llm", key: "queue-test", isActive: true, providerConfig: { base_url: "https://example.com", model_id: "test", supports_images: true },
}] }));
vi.mock("@/server/model-catalog/model-credential", () => ({ getLlmModelApiKey: async () => "test" }));
vi.mock("@/server/assistant-executions/assistant-provider", async original => ({
  ...await original<typeof import("@/server/assistant-executions/assistant-provider")>(), completeAssistant: stubs.llm,
}));
vi.mock("@/server/media-operations/ffmpeg-frame-processor", () => ({ processVideoFrameOperation: stubs.frames }));
vi.mock("@/server/image-generation/storage/adapters/leemage-storage-adapter", () => ({ uploadMediaOperationImages: stubs.upload }));

describe.skipIf(!postgresIntegrationEnabled)("media and assistant shared execution", () => {
  const ownerEmail = "queue-media-assistant-" + randomUUID() + "@example.com";
  const graphId = randomUUID();
  const assetId = randomUUID();
  let runner: ReturnType<typeof createQueueRunner> | undefined;
  beforeAll(async () => {
    await prisma.queueRuntime.update({ where: { id: 1 }, data: { mode: "shared", migrationVerified: true } });
    await prisma.generationGraph.create({ data: { id: graphId, ownerEmail, title: "test" } });
    await prisma.mediaAsset.create({ data: { id: assetId, ownerEmail, type: "video", origin: "upload", storageProvider: "test", storageObjectId: assetId, mimeType: "video/mp4" } });
  });
  afterEach(async () => {
    await runner?.stop(); runner = undefined;
    await removeFixtureQueueJobs((await prisma.mediaCleanupTask.findMany({ where: { ownerEmail }, select: { id: true } })).map(t => t.id));
    const sources = [
      ...(await prisma.mediaOperation.findMany({ where: { ownerEmail }, select: { id: true } })).map(r => r.id),
      ...(await prisma.assistantExecution.findMany({ where: { ownerEmail }, select: { id: true } })).map(r => r.id),
    ];
    await withQueueTransaction(async tx => {
      const ids = (await tx.queueJob.findMany({ where: { sourceId: { in: sources } } })).map(j => j.id);
      await tx.queueAttempt.updateMany({ where: { jobId: { in: ids }, finishedAt: null }, data: { phase: "ended", outcome: "cancelled", finishedAt: new Date() } });
      await tx.queueJob.updateMany({ where: { id: { in: ids } }, data: { status: "cancelled", currentAttemptId: null } });
      await tx.queueDeadLetter.deleteMany({ where: { jobId: { in: ids } } });
      await tx.queueReservation.deleteMany({ where: { attempt: { jobId: { in: ids } } } });
      await tx.queueAttempt.deleteMany({ where: { jobId: { in: ids } } });
      await tx.queueJobResource.deleteMany({ where: { jobId: { in: ids } } });
      await tx.queueJob.deleteMany({ where: { id: { in: ids } } });
    });
    await prisma.mediaOperation.deleteMany({ where: { ownerEmail } });
    await prisma.assistantExecution.deleteMany({ where: { ownerEmail } });
    await prisma.generationGraphNode.deleteMany({ where: { graphId } });
    await prisma.mediaCleanupTask.deleteMany({ where: { ownerEmail } });
    await prisma.mediaAsset.deleteMany({ where: { ownerEmail, id: { not: assetId } } });
    vi.resetAllMocks();
  });
  afterAll(async () => {
    await prisma.generationGraph.delete({ where: { id: graphId } });
    await prisma.mediaAsset.delete({ where: { id: assetId } });
    await prisma.queueRuntime.update({ where: { id: 1 }, data: { mode: "paused", migrationVerified: false } });
  });
  async function assistant() {
    const node = await prisma.generationGraphNode.create({ data: { id: randomUUID(), graphId, kind: "generate.assistant", x: 0, y: 0, configVersion: 1, config: {} } });
    return createAssistantExecution({ ownerEmail, graphId, graphNodeId: node.id, modelKey: "queue-test",
      snapshot: { instruction: "list", text: null, assets: [], outputMode: "list" } });
  }
  async function media() {
    const node = await prisma.generationGraphNode.create({ data: { id: randomUUID(), graphId, kind: "edit.video.extractFrames", x: 0, y: 0, configVersion: 1, config: { parameters: {} } } });
    return mediaAssetRepository.createOperation(ownerEmail, { graphId, graphNodeId: node.id, type: "edit.video.extractFrames", configVersion: 1,
      parameters: {}, expectedOutputCount: 2, inputs: [{ assetId, portId: "video", sortOrder: 0 }] });
  }
  function successfulStubs() {
    stubs.llm.mockResolvedValue('{"items":["one","two"]}');
    stubs.frames.mockResolvedValue(["startFrame", "endFrame"].map(outputPortId => ({ outputPortId, buffer: Buffer.from("png"), width: 64, height: 64 })));
    stubs.upload.mockImplementation(async () => ["startFrame", "endFrame"].map(() => ({
      type: "image", storageProvider: "leemage", storageObjectId: randomUUID(),
      storageUrl: "https://example.com/frame.png", mimeType: "image/png", bytes: 10, width: 64, height: 64, durationMs: null,
    })));
  }
  async function run() {
    runner = createQueueRunner([assistantQueueHandler, mediaOperationQueueHandler]);
    await runner.pump(); await runner.drain();
  }
  it("commits assistant list and frame ports with their queue result", async () => {
    successfulStubs(); const a = await assistant(); const m = await media(); await run();
    expect((await prisma.assistantExecution.findUniqueOrThrow({ where: { id: a.id } })).outputListJson).toHaveLength(2);
    expect((await mediaAssetRepository.getOperation(ownerEmail, m.id)).outputBindings.map(b => b.portId)).toEqual(["endFrame", "startFrame"]);
    expect(await prisma.queueJob.count({ where: { sourceId: { in: [a.id, m.id] }, status: "succeeded" } })).toBe(2);
  });
  it("rejects changed media config before processing and records a terminal DLQ", async () => {
    successfulStubs(); const m = await media();
    await prisma.generationGraphNode.update({ where: { id: m.graphNodeId! }, data: { configVersion: 2 } });
    await run();
    expect(stubs.frames).not.toHaveBeenCalled();
    expect(await prisma.queueDeadLetter.findFirst({ where: { job: { sourceId: m.id } } })).toMatchObject({ classification: "terminal", safeErrorCode: "MEDIA_OPERATION_TARGET_INVALID" });
  });
  it("keeps ambiguous assistant work reserved and never resubmits it", async () => {
    stubs.llm.mockRejectedValue(new Error("remote disconnected"));
    const a = await assistant(); await run(); await runner!.pump();
    expect(stubs.llm).toHaveBeenCalledTimes(1);
    const job = await prisma.queueJob.findFirstOrThrow({ where: { sourceId: a.id } });
    expect(job.status).toBe("reconciliation_required");
    expect(await prisma.queueReservation.count({ where: { attempt: { jobId: job.id }, releasedAt: null, disposition: "uncertain" } })).toBe(1);
  });
  it("cancels pending work atomically without provider calls", async () => {
    successfulStubs(); const a = await assistant(); const m = await media();
    await cancelAssistantExecution(ownerEmail, graphId, a.graphNodeId, a.id);
    await mediaAssetRepository.cancelOperation(ownerEmail, m.id);
    await run();
    expect(stubs.llm).not.toHaveBeenCalled(); expect(stubs.frames).not.toHaveBeenCalled();
    expect(await prisma.queueJob.count({ where: { sourceId: { in: [a.id, m.id] }, status: "cancelled" } })).toBe(2);
    expect(await prisma.queueDeadLetter.count({ where: { job: { sourceId: { in: [a.id, m.id] } } } })).toBe(0);
  });
  it("enforces assistant four and media two across independent runners", async () => {
    successfulStubs();
    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    stubs.llm.mockImplementation(async () => { await gate; return '{"items":["one"]}'; });
    stubs.frames.mockImplementation(async () => { await gate; return ["startFrame", "endFrame"].map(outputPortId => ({ outputPortId, buffer: Buffer.from("png"), width: 64, height: 64 })); });
    for (let i = 0; i < 7; i++) { await assistant(); await media(); }
    runner = createQueueRunner([assistantQueueHandler, mediaOperationQueueHandler]);
    const other = createQueueRunner([assistantQueueHandler, mediaOperationQueueHandler]);
    try {
      await Promise.all([runner.pump(), other.pump()]);
      const held = await prisma.queueReservation.groupBy({ by: ["resourceKey"], where: { releasedAt: null }, _count: true });
      expect(held.find(r => r.resourceKey === "assistant")?._count).toBe(4);
      expect(held.find(r => r.resourceKey === "media-operation")?._count).toBe(2);
    } finally { release(); await other.stop(); await runner.drain(); }
  });
});
