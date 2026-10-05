// @vitest-environment node

import { randomUUID } from "node:crypto";

import { prisma } from "@/server/db/prisma";
import { mediaAssetRepository } from "@/server/media-assets/media-asset-repository";
import { postgresIntegrationEnabled } from "@/test-utils/postgres-integration";
import { generationGraphRepository } from "@/server/generation-graph/generation-graph-repository";
import { mediaAssetIdsForPort } from "@/shared/generation-graph/media-output";
import { MediaOperationLeaseLostError } from "./media-operation-lease";
import { updateGenerationGraphSchema } from "@/server/generation-graph/generation-graph-contract";
import { createStorageCleanupIntent } from "@/server/media-assets/media-cleanup-repository";
import { processMediaOperationJobs, stopMediaOperationWorker } from "./media-operation-worker";

const worker = vi.hoisted(() => ({ frames: vi.fn(), upload: vi.fn() }));
vi.mock("./ffmpeg-frame-processor", () => ({ processVideoFrameOperation: worker.frames }));
vi.mock("@/server/image-generation/storage/adapters/leemage-storage-adapter", () => ({ uploadMediaOperationImages: worker.upload }));

describe.skipIf(!postgresIntegrationEnabled)("server video operation persistence", () => {
  const suffix = randomUUID();
  const ownerEmail = `video-operation-${suffix}@example.com`;
  const graphId = `video-operation-${suffix}`;
  const stitchId = `stitch-${suffix}`;
  const trimId = `trim-${suffix}`;
  const clipIds = [`clip-a-${suffix}`, `clip-b-${suffix}`];
  const copiedIds: string[] = [];

  afterAll(async () => {
    await stopMediaOperationWorker();
    await prisma.mediaOperation.deleteMany({ where: { ownerEmail } });
    await prisma.generationGraph.deleteMany({ where: { id: { in: [graphId, ...copiedIds] } } });
    await prisma.mediaCleanupTask.deleteMany({ where: { ownerEmail } });
    await prisma.mediaAsset.deleteMany({ where: { ownerEmail } });
  });

  it("links Stitch and Trim video artifacts to Graph outputs and History with lease fencing", async () => {
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
      const operation = await mediaAssetRepository.createOperation(ownerEmail, {
        graphId, graphNodeId: nodeId, type, configVersion: 1,
        parameters, inputs: [...inputs], expectedOutputCount: 1,
      });
      const claimed = await mediaAssetRepository.claimPendingServerOperation(operation.id);
      expect(claimed?.operation.type).toBe(type);
      if (!claimed) throw new Error("operation was not claimed");
      const artifactId = `output-${type}-${suffix}`;
      await mediaAssetRepository.completeServerOperation(ownerEmail, operation.id, [{
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
      const lease = { token: randomUUID(), version: 1 };
      await prisma.mediaOperation.update({ where: { id: operation.id }, data: {
        status: "processing", executionLeaseToken: lease.token, executionLeaseVersion: 1,
        executionLeaseUntil: new Date(Date.now() + 60000),
      } });
      return { operation, lease };
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
    const firstIds = await mediaAssetRepository.completeServerOperation(ownerEmail, first.operation.id, artifacts,
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
    const secondIds = await mediaAssetRepository.completeServerOperation(ownerEmail, second.operation.id,
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
      if (mode === "stale") await prisma.mediaOperation.update({ where: { id: requestId }, data: {
        executionLeaseToken: randomUUID(), executionLeaseVersion: { increment: 1 },
      } });
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
      expect(await prisma.mediaCleanupTask.count({ where: { requestId: operation.id, status: "pending" } })).toBe(failure === "partial" ? 1 : 2);
      expect((await generationGraphRepository.get(ownerEmail, graphId)).outputBindings!.filter(binding => binding.graphNodeId === frameId)).toEqual(originalBindings);
      if (failure === "stale") await mediaAssetRepository.cancelOperation(ownerEmail, operation.id);
    }
  });
});
