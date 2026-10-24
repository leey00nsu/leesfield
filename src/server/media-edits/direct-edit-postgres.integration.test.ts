// @vitest-environment node
import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it, vi } from "vitest";
const processingMocks = vi.hoisted(() => ({ process: vi.fn(), upload: vi.fn(), inspect: vi.fn() }));
vi.mock("@/server/media-operations/direct-media-edit-processor", () => ({ processDirectMediaEdit: processingMocks.process }));
vi.mock("@/server/image-generation/storage/adapters/leemage-storage-adapter", () => ({ uploadMediaOperationImages: processingMocks.upload }));
vi.mock("./direct-edit-source", () => ({ inspectDirectVideoSource: processingMocks.inspect }));
import { prisma } from "@/server/db/prisma";
import { postgresIntegrationEnabled } from "@/test-utils/postgres-integration";
import { useSharedQueueFixture, claimFixtureQueueJob } from "@/test-utils/job-queue-postgres";
import { mediaOperationQueueHandler } from "@/server/job-queue/handlers/media-operation-handler";
import { withQueueTransaction } from "@/server/job-queue/job-queue-transaction";
import { generationGraphRepository } from "@/server/generation-graph/generation-graph-repository";
import { startDirectEdit, getDirectEdit, completeDirectEdit, cancelDirectEdit } from "./direct-edit-service";
import type { DirectEditRequest } from "@/shared/media-assets/direct-media-edit";

describe.skipIf(!postgresIntegrationEnabled)("direct edit durable lifecycle", () => {
  const owner = "direct-" + randomUUID() + "@example.com";
  useSharedQueueFixture(() => [owner]);
  afterAll(async () => {
    await prisma.mediaOperation.deleteMany({ where: { ownerEmail: owner } });
    await prisma.generationGraph.deleteMany({ where: { ownerEmail: owner } });
    await prisma.mediaCleanupTask.deleteMany({ where: { ownerEmail: owner } });
    await prisma.mediaAsset.deleteMany({ where: { ownerEmail: owner } });
  });
  async function fixture() {
    const ids = { graph: randomUUID(), source: randomUUID(), result: randomUUID(), edge: randomUUID(), request: randomUUID() };
    const asset = await prisma.mediaAsset.create({ data: { ownerEmail: owner, type: "image", status: "completed", origin: "upload",
      storageProvider: "leemage", storageObjectId: randomUUID(), storageUrl: "https://storage.example/source.png", mimeType: "image/png", width: 200, height: 100, bytes: 3000 } });
    const resultSource = { nodeId: ids.source, executionId: ids.request, portId: "editedImage", index: 0, state: "pending" };
    await prisma.generationGraph.create({ data: { id: ids.graph, title: "Direct edit", ownerEmail: owner, schemaVersion: 3, minimumWriterVersion: 3, groups: [],
      nodes: { create: [{ id: ids.source, kind: "input.image", configVersion: 1, config: { assetId: asset.id }, x: 0, y: 0 },
        { id: ids.result, kind: "input.image", configVersion: 1, config: { assetId: null, resultSource }, x: 620, y: 0 }] },
      edges: { create: { id: ids.edge, sourceNodeId: ids.source, sourcePortId: "editedImage", targetNodeId: ids.result, targetPortId: "reference", sortOrder: 0 } } } });
    const request: DirectEditRequest = { requestId: ids.request, expectedGraphVersion: 1, sourceAssetId: asset.id, sourceVersion: asset.version,
      resultNodeId: ids.result, resultEdgeId: ids.edge, edit: { kind: "image.crop", rect: { x: 10, y: 5, width: 100, height: 50 } } };
    return { ids, asset, request, resultSource };
  }
  const artifact = () => ({ type: "image" as const, storageProvider: "leemage" as const, storageObjectId: randomUUID(), storageUrl: "https://storage.example/cropped.png",
    mimeType: "image/png", bytes: 500, width: 100, height: 50, durationMs: null });
  async function processing(id: string) {
    const lease = { token: randomUUID(), version: 1 };
    await prisma.mediaOperation.update({ where: { id }, data: { status: "processing", executionLeaseToken: lease.token, executionLeaseVersion: 1, executionLeaseUntil: new Date(Date.now() + 60000) } });
    return lease;
  }
  it("dispatches the new direct image type through the shared queue and publishes Edited/History provenance", async () => {
    const { ids, request, asset } = await fixture();
    const accepted = await startDirectEdit(owner, ids.graph, ids.source, request);
    processingMocks.process.mockResolvedValue({ buffer: Buffer.from("tested separately against real decoded pixels"), width: 100, height: 50, durationMs: null });
    processingMocks.upload.mockResolvedValue([artifact()]);
    const claim = await claimFixtureQueueJob(mediaOperationQueueHandler);
    expect(claim.job.executionId).toBe(accepted.id);
    const value = await mediaOperationQueueHandler.execute(claim.job, { lease: claim.lease, signal: new AbortController().signal,
      assertOwned: async () => undefined, recordRemoteEvidence: async () => undefined });
    await withQueueTransaction(tx => mediaOperationQueueHandler.settleTx(tx, claim.job, claim.lease, value));
    const { getHistory } = await import("@/server/history/handlers/get-history");
    const history = await getHistory(new URLSearchParams("type=image&origin=edit"), owner);
    expect(history.items.find(row => row.id === accepted.id)).toMatchObject({ origin: "edit", sourceAssetIds: [asset.id], operation: { type: "direct.image.crop" } });
  });
  it("deduplicates admission and atomically publishes only its own result, preserving a late pending autosave", async () => {
    const { ids, asset, request, resultSource } = await fixture();
    const [one, two] = await Promise.all([startDirectEdit(owner, ids.graph, ids.source, request), startDirectEdit(owner, ids.graph, ids.source, request)]);
    expect(one.id).toBe(two.id);
    expect(await prisma.queueJob.count({ where: { executionId: one.id } })).toBe(1);
    const lease = await processing(one.id);
    await withQueueTransaction(tx => completeDirectEdit(tx, one.id, [artifact()], lease));
    const complete = await getDirectEdit(owner, ids.graph, ids.source, one.id);
    expect(complete.status).toBe("completed"); expect(complete.outputAssetId).toBeTruthy();
    expect(await prisma.mediaAsset.findUnique({ where: { id: complete.outputAssetId! } })).toMatchObject({ origin: "media_operation", sourceOperationId: one.id });
    expect(await prisma.generationGraphNode.findUnique({ where: { id: ids.source } })).toMatchObject({ config: { assetId: asset.id }, selectedOutputAssetId: null });
    const saved = await generationGraphRepository.update(owner, ids.graph, { expectedVersion: 1, title: "Moved", schemaVersion: 3, groups: [], selectionChanges: [],
      nodes: [{ id: ids.source, kind: "input.image", configVersion: 1, config: { assetId: asset.id }, position: { x: 10, y: 20 }, selectedOutputAssetId: null },
        { id: ids.result, kind: "input.image", configVersion: 1, config: { assetId: null, resultSource }, position: { x: 620, y: 0 }, selectedOutputAssetId: null }],
      edges: [{ id: ids.edge, sourceNodeId: ids.source, sourcePortId: "editedImage", targetNodeId: ids.result, targetPortId: "reference", sortOrder: 0 }] });
    expect(saved.nodes.find(n => n.id === ids.result)?.config).toMatchObject({ assetId: complete.outputAssetId, resultSource: { state: "completed" } });
  });
  it("rejects foreign owners, stale versions, altered retries and out-of-bounds rectangles", async () => {
    const { ids, request } = await fixture();
    await expect(startDirectEdit("foreign@example.com", ids.graph, ids.source, request)).rejects.toMatchObject({ status: 404 });
    await expect(startDirectEdit(owner, ids.graph, ids.source, { ...request, expectedGraphVersion: 99 })).rejects.toMatchObject({ code: "GRAPH_VERSION_CONFLICT" });
    await expect(startDirectEdit(owner, ids.graph, ids.source, { ...request, edit: { kind: "image.crop", rect: { x: 190, y: 0, width: 100, height: 50 } } })).rejects.toMatchObject({ code: "EDIT_RANGE_INVALID" });
    await startDirectEdit(owner, ids.graph, ids.source, request);
    await expect(startDirectEdit(owner, ids.graph, ids.source, { ...request, sourceVersion: 999 })).rejects.toMatchObject({ code: "EDIT_REQUEST_CONFLICT" });
  });
  it("measures a legacy uploaded video outside admission and preserves its original nullable metadata", async () => {
    const { ids, asset, request, resultSource } = await fixture();
    await prisma.mediaAsset.update({ where: { id: asset.id }, data: { type: "video", mimeType: "video/mp4", width: null, height: null, durationMs: 4000 } });
    await prisma.generationGraphNode.update({ where: { id: ids.source }, data: { kind: "input.video" } });
    await prisma.generationGraphNode.update({ where: { id: ids.result }, data: { kind: "input.video", config: { assetId: null, resultSource: { ...resultSource, portId: "editedVideo" } } } });
    await prisma.generationGraphEdge.update({ where: { id: ids.edge }, data: { sourcePortId: "editedVideo", targetPortId: "video" } });
    processingMocks.inspect.mockResolvedValue({ width: 200, height: 100, durationMs: 4000 });
    const accepted = await startDirectEdit(owner, ids.graph, ids.source, { ...request, edit: { kind: "video.crop", rect: { x: 20, y: 10, width: 100, height: 50 } } });
    expect(processingMocks.inspect).toHaveBeenCalledWith(owner, asset.id);
    expect(await prisma.mediaOperation.findUnique({ where: { id: accepted.id } })).toMatchObject({ parameters: { width: 200, height: 100, durationMs: 4000 } });
    expect(await prisma.mediaAsset.findUnique({ where: { id: asset.id } })).toMatchObject({ width: null, height: null, version: asset.version });
    await cancelDirectEdit(owner, ids.graph, ids.source, accepted.id);
  });
  it("fences replaced sources and cancellation without creating an output asset", async () => {
    const { ids, request } = await fixture();
    const job = await startDirectEdit(owner, ids.graph, ids.source, request), lease = await processing(job.id);
    await prisma.generationGraphNode.update({ where: { id: ids.source }, data: { config: { assetId: null } } });
    expect(await withQueueTransaction(tx => completeDirectEdit(tx, job.id, [artifact()], lease))).toBe("protected");
    expect(await getDirectEdit(owner, ids.graph, ids.source, job.id)).toMatchObject({ status: "cancelled", outputAssetId: null });
    const next = await fixture(), accepted = await startDirectEdit(owner, next.ids.graph, next.ids.source, next.request);
    expect(await cancelDirectEdit(owner, next.ids.graph, next.ids.source, accepted.id)).toMatchObject({ status: "cancelled", outputAssetId: null });
  });
});
