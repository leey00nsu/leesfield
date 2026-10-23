// @vitest-environment node
import { useSharedQueueFixture, claimFixtureQueueJob, removeFixtureQueueJobs } from "@/test-utils/job-queue-postgres";

import { randomUUID } from "node:crypto";

import { prisma } from "@/server/db/prisma";
import { mediaAssetRepository } from "@/server/media-assets/media-asset-repository";
import { postgresIntegrationEnabled } from "@/test-utils/postgres-integration";
import { generationGraphRepository } from "@/server/generation-graph/generation-graph-repository";
import { mediaAssetIdsForPort } from "@/shared/generation-graph/media-output";
import { MediaOperationLeaseLostError } from "./media-operation-lease";
import { updateGenerationGraphSchema } from "@/server/generation-graph/generation-graph-contract";
import { createStorageCleanupIntent } from "@/server/media-assets/media-cleanup-repository";
import { mediaOperationQueueHandler } from "@/server/job-queue/handlers/media-operation-handler";
import { createStorageCleanupHandler } from "@/server/job-queue/handlers/storage-cleanup-handler";
import { createQueueRunner } from "@/server/job-queue/job-queue-runner";
import { withQueueTransaction } from "@/server/job-queue/job-queue-transaction";
import { enqueueQueueJobTx, queueScopeDigest } from "@/server/job-queue/job-queue-registration";
import { settleQueueSuccess } from "@/server/job-queue/job-queue-settlement";
import type { QueueLease } from "@/server/job-queue/contracts";
import type { GeneratedMediaArtifact } from "@/server/media-assets/generated-media-artifact";

const worker = vi.hoisted(() => ({ frames: vi.fn(), upload: vi.fn() }));
vi.mock("./ffmpeg-frame-processor", () => ({ processVideoFrameOperation: worker.frames }));
vi.mock("@/server/image-generation/storage/adapters/leemage-storage-adapter", async original => ({
  ...await original<typeof import("@/server/image-generation/storage/adapters/leemage-storage-adapter")>(), uploadMediaOperationImages: worker.upload,
}));

describe.skipIf(!postgresIntegrationEnabled)("server video operation persistence", () => {
  const suffix = randomUUID();
  const ownerEmail = `video-operation-${suffix}@example.com`;
  useSharedQueueFixture(() => [ownerEmail]);
  const graphId = `video-operation-${suffix}`;
  const stitchId = `stitch-${suffix}`;
  const trimId = `trim-${suffix}`;
  const clipIds = [`clip-a-${suffix}`, `clip-b-${suffix}`];
  const copiedIds: string[] = [];
  afterEach(async () => {
    const jobs = await prisma.queueJob.findMany({ where: { ownerScopeDigest: queueScopeDigest(ownerEmail) }, select: { sourceId: true } });
    await removeFixtureQueueJobs(jobs.map(j => j.sourceId));
  });

  async function claimOperation(id: string) {
    const operation = await mediaAssetRepository.getOperation(ownerEmail, id);
    await withQueueTransaction(tx => enqueueQueueJobTx(tx, { kind: "media_operation", source: { type: "media_operation", id },
      ownerScopeDigest: queueScopeDigest(ownerEmail), snapshotRef: "media-operation:" + id }));
    const claimed = await claimFixtureQueueJob(mediaOperationQueueHandler);
    expect(claimed.job.executionId).toBe(id);
    return { operation, lease: claimed.lease };
  }
  async function completeOperation(owner: string, id: string, artifacts: GeneratedMediaArtifact[], now: Date, lease: QueueLease) {
    let ids: string[] = [];
    await settleQueueSuccess(lease, { ...mediaOperationQueueHandler, async settleTx(tx) {
      ids = await mediaAssetRepository.completeServerOperation(owner, id, artifacts, now, lease, tx);
      return "succeeded";
    } }, artifacts);
    return ids;
  }
  async function processMediaOperationJobs() {
    const runner = createQueueRunner([mediaOperationQueueHandler, createStorageCleanupHandler({ name: "leemage", delete: async () => {} } as never)]);
    try { await runner.pump(); await runner.drain(); } finally { await runner.stop(); }
  }
  afterAll(async () => {
    await prisma.mediaOperation.deleteMany({ where: { ownerEmail } });
    await prisma.generationGraph.deleteMany({ where: { id: { in: [graphId, ...copiedIds] } } });
    await prisma.mediaCleanupTask.deleteMany({ where: { ownerEmail } });
    await prisma.mediaAsset.deleteMany({ where: { ownerEmail } });
  });

  it("completes already-accepted Stitch and Trim artifacts with History and lease fencing after temporary hiding", async () => {
    await prisma.generationGraph.create({
      data: {
        id: graphId, ownerEmail, title: "Video operation integration", schemaVersion: 2,
        minimumWriterVersion: 2,
        nodes: { create: [
          { id: stitchId, kind: "edit.video.stitch", x: 0, y: 0, configVersion: 1,
            config: { parameters: { repeat: 1, stripAudio: false, clipOrder: [] } } },
          { id: trimId, kind: "edit.video.trim", x: 300, y: 0, configVersion: 1,
            config: { parameters: { startMs: 0, endMs: 500, stripAudio: false } } },
        ] },
      },
    });
    for (const id of clipIds) {
      await prisma.mediaAsset.create({ data: {
        id, ownerEmail, type: "video", status: "completed", origin: "upload",
        storageProvider: "leemage", storageObjectId: id,
        storageUrl: `https://storage.example/${id}.mp4`, mimeType: "video/mp4",
        bytes: BigInt(1024), width: 320, height: 180, durationMs: 600,
      } });
    }
    const cases: Array<[
      string,
      "edit.video.stitch" | "edit.video.trim",
      Record<string, number | boolean | string[]>,
      Array<{ assetId: string; portId: string; sortOrder: number }>,
    ]> = [
      [stitchId, "edit.video.stitch", { repeat: 1, stripAudio: false, clipOrder: [] }, [
        { assetId: clipIds[0], portId: "clips", sortOrder: 0 },
        { assetId: clipIds[1], portId: "clips", sortOrder: 1 },
      ]],
      [trimId, "edit.video.trim", { startMs: 0, endMs: 500, stripAudio: false }, [
        { assetId: clipIds[0], portId: "video", sortOrder: 0 },
      ]],
    ];
    for (const [nodeId, type, parameters, inputs] of cases) {
      // These jobs were accepted before temporary hiding; new admission stays blocked.
      const operation = await prisma.mediaOperation.create({ data: {
        ownerEmail, graphId, graphNodeId: nodeId, type, configVersion: 1,
        parameters, inputs: { create: inputs }, expectedOutputCount: 1,
      } });
      const claimed = await claimOperation(operation.id);
      expect(claimed?.operation.type).toBe(type);
      if (!claimed) throw new Error("operation was not claimed");
      const artifactId = `output-${type}-${suffix}`;
      await completeOperation(ownerEmail, operation.id, [{
        type: "video", storageProvider: "leemage", storageObjectId: artifactId,
        storageUrl: `https://storage.example/${artifactId}.mp4`, mimeType: "video/mp4",
        bytes: 2048, width: 320, height: 180, durationMs: type === "edit.video.trim" ? 500 : 1200,
      }], new Date(), claimed.lease);
      const output = await prisma.generationGraphNodeOutput.findFirst({
        where: { graphNodeId: nodeId, portId: "video" }, include: { asset: true },
      });
      expect(output?.asset).toMatchObject({
        origin: "media_operation", type: "video", sourceOperationId: operation.id,
      });
      expect((await mediaAssetRepository.listAssets(ownerEmail, { type: "video", category: "edited", limit: 20 }))
        .some((asset) => asset.id === output?.assetId)).toBe(true);
      expect((await prisma.mediaOperation.findUnique({ where: { id: operation.id } }))?.status).toBe("completed");
    }
  });

  it("publishes two named ports atomically, restores History, copies bindings and preserves missing slots", async () => {
    const frameId = `frames-${suffix}`;
    await prisma.generationGraphNode.create({ data: {
      id: frameId, graphId, kind: "edit.video.extractFrames", configVersion: 1,
      config: { parameters: {} }, x: 600, y: 0,
    } });
    const artifacts = ["startFrame", "endFrame"].map((outputPortId, index) => ({
      outputPortId, sortOrder: 0, type: "image" as const, storageProvider: "leemage" as const,
      storageObjectId: `frame-${index}-${randomUUID()}`, storageUrl: `https://storage.example/${index}.png`,
      mimeType: "image/png", bytes: 100, width: 320, height: 180, durationMs: null,
    }));
    const create = async () => {
      const operation = await mediaAssetRepository.createOperation(ownerEmail, {
        graphId, graphNodeId: frameId, type: "edit.video.extractFrames", configVersion: 1,
        parameters: {}, expectedOutputCount: 2, inputs: [{ assetId: clipIds[0], portId: "video", sortOrder: 0 }],
      });
      return claimOperation(operation.id);
    };
    const first = await create();
    for (const invalid of [
      artifacts.slice(0, 1), artifacts.map(a => ({ ...a, outputPortId: undefined })),
      artifacts.map(a => ({ ...a, outputPortId: "startFrame" })),
      artifacts.map(a => ({ ...a, type: "video" as const })),
    ]) {
      await expect(mediaAssetRepository.completeServerOperation(ownerEmail, first.operation.id, invalid,
        new Date(), first.lease)).rejects.toThrow("MEDIA_OPERATION_TARGET_INVALID");
      expect(await prisma.mediaAsset.count({ where: { sourceOperationId: first.operation.id } })).toBe(0);
    }
    const firstIds = await completeOperation(ownerEmail, first.operation.id, artifacts,
      new Date(), first.lease);
    expect(firstIds).toHaveLength(2);
    const firstBindings = (await mediaAssetRepository.getOperation(ownerEmail, first.operation.id)).outputBindings;
    expect(firstBindings).toEqual(expect.arrayContaining([
      { portId: "startFrame", sortOrder: 0, assetId: firstIds[0] },
      { portId: "endFrame", sortOrder: 0, assetId: firstIds[1] },
    ]));
    const second = await create();
    // The second insert hits the storage object unique constraint; the first insert and state roll back too.
    await expect(mediaAssetRepository.completeServerOperation(ownerEmail, second.operation.id,
      [{ ...artifacts[0], storageObjectId: randomUUID() }, artifacts[1]], new Date(), second.lease)).rejects.toThrow();
    expect(await prisma.mediaAsset.count({ where: { sourceOperationId: second.operation.id } })).toBe(0);
    expect((await mediaAssetRepository.getOperation(ownerEmail, second.operation.id)).status).toBe("processing");
    expect((await generationGraphRepository.get(ownerEmail, graphId)).outputBindings!.filter(b => b.graphNodeId === frameId)
      .map(b => b.assetId).sort()).toEqual([...firstIds].sort());
    const secondIds = await completeOperation(ownerEmail, second.operation.id,
      artifacts.map(a => ({ ...a, storageObjectId: randomUUID() })), new Date(), second.lease);
    const graph = await generationGraphRepository.get(ownerEmail, graphId);
    const history = await generationGraphRepository.update(ownerEmail, graphId, updateGenerationGraphSchema.parse({
      schemaVersion: 3, expectedVersion: graph.version, title: graph.title, groups: graph.groups,
      edges: graph.edges, selectionChanges: [frameId], nodes: graph.nodes.map(node =>
        node.id === frameId ? { ...node, selectedOutputAssetId: firstIds[1] } : node),
    }));
    const bindings = history.outputBindings!.filter(binding => binding.graphNodeId === frameId);
    expect(mediaAssetIdsForPort("edit.video.extractFrames", "startFrame", firstIds[1], bindings)).toEqual([firstIds[0]]);
    expect(mediaAssetIdsForPort("edit.video.extractFrames", "endFrame", firstIds[1], bindings)).toEqual([firstIds[1]]);
    const copy = await generationGraphRepository.copy(ownerEmail, graphId);
    copiedIds.push(copy.id);
    const copiedNode = copy.nodes.find(node => node.kind === "edit.video.extractFrames")!;
    expect(copy.outputBindings!.filter(binding => binding.graphNodeId === copiedNode.id).map(binding => binding.assetId).sort())
      .toEqual([...firstIds].sort());
    const late = await create();
    await mediaAssetRepository.cancelOperation(ownerEmail, late.operation.id);
    await expect(mediaAssetRepository.completeServerOperation(ownerEmail, late.operation.id, artifacts,
      new Date(), late.lease)).rejects.toThrow();
    const stale = await create();
    await expect(mediaAssetRepository.completeServerOperation(ownerEmail, stale.operation.id, artifacts,
      new Date(), { ...stale.lease, token: "wrong" })).rejects.toBeInstanceOf(MediaOperationLeaseLostError);
    expect((await generationGraphRepository.get(ownerEmail, graphId)).outputBindings!.filter(b => b.graphNodeId === frameId))
      .toEqual(bindings);
    await mediaAssetRepository.cancelOperation(ownerEmail, stale.operation.id);
    // Existing deletion policy requires graph references to be detached first.
    await prisma.generationGraphNodeOutput.deleteMany({ where: { assetId: firstIds[0] } });
    await prisma.mediaAsset.delete({ where: { id: firstIds[0] } });
    const missing = (await mediaAssetRepository.getOperation(ownerEmail, first.operation.id)).outputBindings;
    expect(missing.find(binding => binding.portId === "startFrame")?.assetId).toBeNull();
    expect(mediaAssetIdsForPort("edit.video.extractFrames", "startFrame", firstIds[1], missing)).toEqual([]);
    expect(mediaAssetIdsForPort("edit.video.extractFrames", "endFrame", firstIds[1], missing)).toEqual([firstIds[1]]);
    expect(secondIds.every(id => !missing.some(binding => binding.assetId === id))).toBe(true);
    const latest = await generationGraphRepository.get(ownerEmail, graphId);
    const cleared = await generationGraphRepository.update(ownerEmail, graphId, updateGenerationGraphSchema.parse({
      schemaVersion: 3, expectedVersion: latest.version, title: latest.title, groups: latest.groups,
      edges: latest.edges, selectionChanges: [frameId],
      nodes: latest.nodes.map(node => node.id === frameId ? { ...node, selectedOutputAssetId: null } : node),
    }));
    expect(cleared.outputBindings!.filter(binding => binding.graphNodeId === frameId)).toEqual([]);
  });
  it("the frame worker publishes two uploads together and releases partial or cancelled uploads", async () => {
    const frameId = `worker-frames-${suffix}`;
    await prisma.generationGraphNode.create({ data: {
      id: frameId, graphId, kind: "edit.video.extractFrames", configVersion: 1, config: { parameters: {} }, x: 900, y: 0,
    } });
    worker.frames.mockResolvedValue(["startFrame", "endFrame"].map(outputPortId => ({
      outputPortId, buffer: Buffer.from(outputPortId), width: 160, height: 90,
    })));
    const create = () => mediaAssetRepository.createOperation(ownerEmail, {
      graphId, graphNodeId: frameId, type: "edit.video.extractFrames", configVersion: 1,
      parameters: {}, expectedOutputCount: 2, inputs: [{ assetId: clipIds[0], portId: "video", sortOrder: 0 }],
    });
    let mode: "success" | "partial" | "cancelled" | "stale" = "success";
    worker.upload.mockImplementation(async (requestId: string, images: Array<{ dataUrl: string; width: number; height: number }>) => {
      expect(images.map(image => image.dataUrl)).toEqual(["startFrame", "endFrame"].map(port => `data:image/png;base64,${Buffer.from(port).toString("base64")}`));
      expect(images.every(image => image.width === 160 && image.height === 90)).toBe(true);
      const artifacts = [];
      for (let index = 0; index < images.length; index++) {
        const storageObjectId = randomUUID();
        await createStorageCleanupIntent(undefined, { ownerEmail, requestId, storageProvider: "leemage", storageObjectId, reason: "media_operation_output" });
        artifacts.push({ type: "image", storageProvider: "leemage", storageObjectId, storageUrl: `https://storage.example/${storageObjectId}.png`, mimeType: "image/png", bytes: 100, width: 160, height: 90, durationMs: null });
        if (mode === "partial") throw new Error("SECOND_UPLOAD_FAILED");
      }
      if (mode === "cancelled") await mediaAssetRepository.cancelOperation(ownerEmail, requestId);
      if (mode === "stale") await prisma.queueAttempt.updateMany({ where: { executionId: requestId, finishedAt: null }, data: { leaseToken: randomUUID(), leaseVersion: { increment: 1 } } });
      return artifacts;
    });
    const initial = await create();
    await processMediaOperationJobs();
    const completed = await mediaAssetRepository.getOperation(ownerEmail, initial.id);
    expect(completed.status).toBe("completed");
    expect(completed.outputBindings.map(binding => binding.portId).sort()).toEqual(["endFrame", "startFrame"]);
    expect(new Set(completed.outputs.map(asset => asset.id)).size).toBe(2);
    const originalBindings = (await generationGraphRepository.get(ownerEmail, graphId)).outputBindings!.filter(binding => binding.graphNodeId === frameId);
    expect(await prisma.mediaCleanupTask.count({ where: { requestId: initial.id, status: "linked" } })).toBe(2);
    for (const failure of ["partial", "cancelled", "stale"] as const) {
      mode = failure;
      const operation = await create();
      await processMediaOperationJobs();
      const current = await mediaAssetRepository.getOperation(ownerEmail, operation.id);
      expect(current.status).toBe(failure === "partial" ? "failed" : failure === "cancelled" ? "cancelled" : "processing");
      expect(current.outputs).toEqual([]);
      expect(await prisma.mediaAsset.count({ where: { sourceOperationId: operation.id } })).toBe(0);
      expect(await prisma.mediaCleanupTask.count({ where: { requestId: operation.id, status: { in: ["pending", "uploading", "completed"] } } })).toBe(failure === "partial" ? 1 : 2);
      expect((await generationGraphRepository.get(ownerEmail, graphId)).outputBindings!.filter(binding => binding.graphNodeId === frameId)).toEqual(originalBindings);
      if (failure === "stale") await mediaAssetRepository.cancelOperation(ownerEmail, operation.id);
    }
  });

  it("persists one named frame and frozen point parameters without replacing legacy ports or owner/input snapshots", async () => {
    const frameId = `point-frames-${suffix}`, sourceId = `point-source-${suffix}`;
    await prisma.generationGraphNode.createMany({ data: [
      { id: frameId, graphId, kind: "edit.video.extractFrames", configVersion: 1, config: { parameters: {} }, x: 1200, y: 0 },
      { id: sourceId, graphId, kind: "input.video", configVersion: 1, config: { assetId: clipIds[0] }, x: 1000, y: 0 },
    ] });
    await prisma.generationGraphEdge.create({ data: {
      id: `point-wire-${suffix}`, graphId, sourceNodeId: sourceId, sourcePortId: "video",
      targetNodeId: frameId, targetPortId: "video", sortOrder: 0,
    } });
    const input = { graphId, graphNodeId: frameId, type: "edit.video.extractFrames" as const, configVersion: 1,
      inputs: [{ assetId: clipIds[0], portId: "video", sortOrder: 0 }] };
    const artifact = (outputPortId: string) => ({ outputPortId, sortOrder: 0, type: "image" as const, storageProvider: "leemage" as const,
      storageObjectId: randomUUID(), storageUrl: `https://storage.example/${randomUUID()}.png`, mimeType: "image/png", bytes: 100, width: 160, height: 90, durationMs: null });
    const legacy = await mediaAssetRepository.createOperation(ownerEmail, { ...input, parameters: {}, expectedOutputCount: 2 });
    const legacyClaim = await claimOperation(legacy.id);
    if (!legacyClaim) throw new Error("legacy operation was not claimed");
    await completeOperation(ownerEmail, legacy.id, [artifact("startFrame"), artifact("endFrame")], new Date(), legacyClaim.lease);
    const legacyBindings = (await generationGraphRepository.get(ownerEmail, graphId)).outputBindings!.filter(binding => binding.graphNodeId === frameId);
    const points: Array<{ operationId: string; assetId: string; timestampMs: number }> = [];
    for (const timestampMs of [0, 1250]) {
      await prisma.generationGraphNode.update({ where: { id: frameId }, data: { config: { parameters: { timestampMs } } } });
      await prisma.generationGraphNode.update({ where: { id: sourceId }, data: { config: { assetId: clipIds[0] } } });
      await expect(mediaAssetRepository.createOperation(ownerEmail, { ...input, parameters: { timestampMs }, expectedOutputCount: 2 }))
        .rejects.toThrow("MEDIA_OPERATION_TARGET_INVALID");
      await expect(mediaAssetRepository.createOperation(`other-${ownerEmail}`, { ...input, parameters: { timestampMs }, expectedOutputCount: 1 }))
        .rejects.toThrow("MEDIA_OPERATION_TARGET_INVALID");
      const operation = await mediaAssetRepository.createOperation(ownerEmail, { ...input, parameters: { timestampMs }, expectedOutputCount: 1 });
      const claimed = await claimOperation(operation.id);
      if (!claimed) throw new Error("point operation was not claimed");
      // Live edits after acceptance cannot change the operation's input or extraction mode.
      await prisma.generationGraphNode.update({ where: { id: frameId }, data: { config: { parameters: {} } } });
      await prisma.generationGraphNode.update({ where: { id: sourceId }, data: { config: { assetId: clipIds[1] } } });
      for (const invalid of [[], [artifact("frame"), artifact("frame")], [artifact("startFrame")], [artifact("endFrame")],
        [{ ...artifact("frame"), outputPortId: undefined }], [{ ...artifact("frame"), sortOrder: 1 }], [{ ...artifact("frame"), mimeType: "image/webp" }]]) {
        await expect(mediaAssetRepository.completeServerOperation(ownerEmail, operation.id, invalid, new Date(), claimed.lease))
          .rejects.toThrow("MEDIA_OPERATION_TARGET_INVALID");
        expect(await prisma.mediaAsset.count({ where: { sourceOperationId: operation.id } })).toBe(0);
        expect((await mediaAssetRepository.getOperation(ownerEmail, operation.id)).status).toBe("processing");
      }
      await expect(mediaAssetRepository.completeServerOperation(`other-${ownerEmail}`, operation.id, [artifact("frame")], new Date(), claimed.lease))
        .rejects.toBeInstanceOf(MediaOperationLeaseLostError);
      const assetIds = await completeOperation(ownerEmail, operation.id, [artifact("frame")], new Date(), claimed.lease);
      expect(assetIds).toHaveLength(1);
      points.push({ operationId: operation.id, assetId: assetIds[0], timestampMs });
      const history = await mediaAssetRepository.getOperation(ownerEmail, operation.id);
      expect(history).toMatchObject({ parameters: { timestampMs }, expectedOutputCount: 1, status: "completed",
        inputs: [{ assetId: clipIds[0], portId: "video", sortOrder: 0 }], outputBindings: [{ portId: "frame", sortOrder: 0, assetId: assetIds[0] }] });
      expect((await prisma.mediaAsset.findUnique({ where: { id: assetIds[0] } }))?.ownerEmail).toBe(ownerEmail);
      const graph = await generationGraphRepository.get(ownerEmail, graphId), bindings = graph.outputBindings!.filter(binding => binding.graphNodeId === frameId);
      expect(bindings.filter(binding => binding.portId !== "frame")).toEqual(legacyBindings);
      expect(bindings.filter(binding => binding.assetId === assetIds[0])).toEqual([expect.objectContaining({ portId: "frame", sortOrder: 0 })]);
      expect(graph.nodes.find(node => node.id === frameId)?.config).toEqual({ parameters: {} });
      expect(graph.nodes.find(node => node.id === sourceId)?.config).toEqual({ assetId: clipIds[1] });
    }
    const selectHistory = async (assetId: string, parameters: Record<string, number>) => {
      const graph = await generationGraphRepository.get(ownerEmail, graphId);
      return generationGraphRepository.update(ownerEmail, graphId, updateGenerationGraphSchema.parse({
        schemaVersion: 3, expectedVersion: graph.version, title: graph.title, groups: graph.groups,
        edges: graph.edges, selectionChanges: [frameId], nodes: graph.nodes.map(node =>
          node.id === frameId ? { ...node, config: { parameters }, selectedOutputAssetId: assetId } : node),
      }));
    };
    // History ports follow the selected operation even when its mode differs from the current node config.
    const oldPoint = await selectHistory(points[0].assetId, {});
    expect(oldPoint.nodes.find(node => node.id === frameId)?.config).toEqual({ parameters: {} });
    expect(oldPoint.outputBindings!.filter(binding => binding.graphNodeId === frameId))
      .toEqual([{ graphNodeId: frameId, portId: "frame", sortOrder: 0, assetId: points[0].assetId }]);
    const oldLegacy = await selectHistory(legacyBindings.find(binding => binding.portId === "endFrame")!.assetId, { timestampMs: 5000 });
    expect(oldLegacy.nodes.find(node => node.id === frameId)?.config).toEqual({ parameters: { timestampMs: 5000 } });
    expect(oldLegacy.outputBindings!.filter(binding => binding.graphNodeId === frameId)).toEqual(legacyBindings);
    const latestPoint = await selectHistory(points[1].assetId, {});
    expect(latestPoint.outputBindings!.filter(binding => binding.graphNodeId === frameId))
      .toEqual([{ graphNodeId: frameId, portId: "frame", sortOrder: 0, assetId: points[1].assetId }]);
    for (const point of points) expect(await mediaAssetRepository.getOperation(ownerEmail, point.operationId))
      .toMatchObject({ parameters: { timestampMs: point.timestampMs }, expectedOutputCount: 1,
        outputBindings: [{ portId: "frame", sortOrder: 0, assetId: point.assetId }] });
    expect((await mediaAssetRepository.getOperation(ownerEmail, legacy.id)).parameters).toEqual({});
  });

  it("the point worker requires one frame PNG and rejects wrong named/count processor or upload results", async () => {
    const frameId = `worker-point-${suffix}`;
    await prisma.generationGraphNode.create({ data: {
      id: frameId, graphId, kind: "edit.video.extractFrames", configVersion: 1, config: { parameters: { timestampMs: 750 } }, x: 1500, y: 0,
    } });
    const create = () => mediaAssetRepository.createOperation(ownerEmail, {
      graphId, graphNodeId: frameId, type: "edit.video.extractFrames", configVersion: 1,
      parameters: { timestampMs: 750 }, expectedOutputCount: 1, inputs: [{ assetId: clipIds[0], portId: "video", sortOrder: 0 }],
    });
    const frame = { outputPortId: "frame", buffer: Buffer.from("chosen"), width: 160, height: 90 };
    worker.frames.mockResolvedValue([frame]);
    worker.upload.mockImplementation(async (requestId: string, images: Array<{ dataUrl: string }>) => {
      expect(images).toHaveLength(1);
      expect(images[0].dataUrl).toBe(`data:image/png;base64,${Buffer.from("chosen").toString("base64")}`);
      const storageObjectId = randomUUID();
      await createStorageCleanupIntent(undefined, { ownerEmail, requestId, storageProvider: "leemage", storageObjectId, reason: "media_operation_output" });
      return [{ type: "image", storageProvider: "leemage", storageObjectId, storageUrl: `https://storage.example/${storageObjectId}.png`, mimeType: "image/png", bytes: 100, width: 160, height: 90, durationMs: null }];
    });
    const operation = await create();
    await prisma.generationGraphNode.update({ where: { id: frameId }, data: { config: { parameters: { timestampMs: 999 } } } });
    await processMediaOperationJobs();
    const completed = await mediaAssetRepository.getOperation(ownerEmail, operation.id);
    expect(completed).toMatchObject({ status: "completed", parameters: { timestampMs: 750 }, expectedOutputCount: 1,
      inputs: [{ assetId: clipIds[0], portId: "video", sortOrder: 0 }] });
    expect(completed.outputs).toHaveLength(1);
    expect(completed.outputBindings).toEqual([{ portId: "frame", sortOrder: 0, assetId: completed.outputs[0].id }]);
    expect(worker.frames).toHaveBeenCalledWith(expect.objectContaining({ ownerEmail, parameters: { timestampMs: 750 },
      inputs: [expect.objectContaining({ assetId: clipIds[0], portId: "video", sortOrder: 0 })] }), expect.any(AbortSignal));
    expect(await prisma.mediaCleanupTask.count({ where: { requestId: operation.id, status: "linked" } })).toBe(1);
    const bindings = (await generationGraphRepository.get(ownerEmail, graphId)).outputBindings!.filter(binding => binding.graphNodeId === frameId);
    for (const frames of [[], [{ ...frame, outputPortId: "endFrame" }], [frame, frame]]) {
      worker.frames.mockResolvedValueOnce(frames);
      worker.upload.mockClear();
      const invalid = await create();
      await processMediaOperationJobs();
      expect(worker.upload).not.toHaveBeenCalled();
      expect(await mediaAssetRepository.getOperation(ownerEmail, invalid.id)).toMatchObject({ status: "failed", errorCode: "VIDEO_OUTPUT_INVALID", outputs: [] });
      expect((await generationGraphRepository.get(ownerEmail, graphId)).outputBindings!.filter(binding => binding.graphNodeId === frameId)).toEqual(bindings);
    }
    worker.frames.mockResolvedValue([frame]);
    worker.upload.mockResolvedValueOnce([]);
    const empty = await create();
    await processMediaOperationJobs();
    expect(await mediaAssetRepository.getOperation(ownerEmail, empty.id)).toMatchObject({ status: "failed", errorCode: "VIDEO_OUTPUT_INVALID", outputs: [] });
  });
});
