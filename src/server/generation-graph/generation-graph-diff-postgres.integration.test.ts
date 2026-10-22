// @vitest-environment node

import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it, vi } from "vitest";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/server/db/prisma";
import { generationGraphRepository, type GenerationGraphSnapshot } from "@/server/generation-graph/generation-graph-repository";
import { GenerationGraphVersionConflictError, GenerationGraphActiveExecutionError } from "@/server/generation-graph/generation-graph-errors";
import { updateGenerationGraphSchema, type UpdateGenerationGraphInput } from "@/server/generation-graph/generation-graph-contract";
import { postgresIntegrationEnabled } from "@/test-utils/postgres-integration";
import { temporarilyHiddenEditNodeKinds } from "@/shared/generation-graph/node-availability";
import { defaultConfigForKind } from "@/shared/generation-graph/node-default-config";
import { generationGraphService } from "./generation-graph-service";
import { nodeExecutionService } from "@/server/node-executions/node-execution-service";
import { executeExternalNode, readExternalNodeExecution } from "@/server/external-api/space-executions";
import { mediaAssetRepository } from "@/server/media-assets/media-asset-repository";
import { createMediaAssetService } from "@/server/media-assets/media-asset-service";
import type { CreateMediaOperationInput } from "@/shared/media-assets/media-asset-contract";
import { appendCapturedFrameResult } from "@/features/node-studio/model/generation-result-nodes";
import { nodeOutputService } from "./node-output-service";

const integration = describe.skipIf(!postgresIntegrationEnabled);

type GraphNodeInput = UpdateGenerationGraphInput["nodes"][number];
type GraphEdgeInput = UpdateGenerationGraphInput["edges"][number];

function node(id: string, x: number, kind = "input.prompt", config: Record<string, unknown> = { text: id }): GraphNodeInput {
  return {
    id,
    kind,
    position: { x, y: 0 },
    configVersion: 1,
    config: config as GraphNodeInput["config"],
    selectedOutputAssetId: null,
  };
}

function updateInput(
  graph: { version: number },
  title: string,
  nodes: GraphNodeInput[] | GenerationGraphSnapshot["nodes"],
  edges: GraphEdgeInput[] = [],
) {
  return updateGenerationGraphSchema.parse({
    schemaVersion: 3 as const,
    groups: [],
    expectedVersion: graph.version,
    title,
    nodes,
    edges,
  });
}

integration("generation graph diff writes", () => {
  const ownerEmail = `it-graph-diff-${randomUUID()}@example.com`;
  const graphIds: string[] = [];

  afterAll(async () => {
    await prisma.mediaOperation.deleteMany({ where: { ownerEmail } });
    if (graphIds.length > 0) {
      await prisma.generationGraph.deleteMany({ where: { id: { in: graphIds } } });
    }
    await prisma.mediaCleanupTask.deleteMany({ where: { ownerEmail } });
    await prisma.mediaAsset.deleteMany({ where: { ownerEmail } });
  });

  it.each(["input.video", "output.single"])("persists %s's capture wires and frozen media through copy and source replacement", async kind => {
    const graph = await generationGraphRepository.create(ownerEmail, "Capture results"); graphIds.push(graph.id);
    const assets = await Promise.all(["video", "image", "image"].map((type, index) => prisma.mediaAsset.create({ data: {
      ownerEmail, type: type as "image" | "video", origin: "upload", status: "completed", storageProvider: "leemage", storageObjectId: randomUUID(),
      storageUrl: `https://storage.example/capture-${index}`, mimeType: type === "image" ? "image/png" : "video/mp4",
    } })));
    const videoId = randomUUID(), sourceId = kind === "input.video" ? videoId : randomUUID(), displayId = randomUUID();
    const nodes = [node(videoId, 0, "input.video", { assetId: assets[0].id })];
    const wires: GraphEdgeInput[] = [];
    if (kind === "output.single") {
      nodes.push(node(sourceId, 400, kind, { mediaType: "video" }));
      wires.push({ id: randomUUID(), sourceNodeId: videoId, sourcePortId: "video", targetNodeId: sourceId, targetPortId: "video", sortOrder: 0 });
    }
    const reservation = appendCapturedFrameResult({ schemaVersion: 3, title: graph.title, nodes, edges: wires, groups: [] }, sourceId);
    const pending = await generationGraphService.update(ownerEmail, graph.id, updateInput(graph, graph.title, reservation.draft.nodes, reservation.draft.edges));
    expect(pending.nodes.find(node => node.id === reservation.ids[0])?.config).toMatchObject({ assetId: null,
      resultSource: { nodeId: sourceId, executionId: null, portId: "capturedFrame", state: "pending" } });
    const pendingCopy = await generationGraphService.copy(ownerEmail, graph.id); graphIds.push(pendingCopy.id);
    const cancelledCopy = pendingCopy.nodes.find(node => node.kind === "input.image")!;
    expect(cancelledCopy.config).toMatchObject({ assetId: null, resultSource: { executionId: null, portId: "capturedFrame", state: "cancelled" } });
    expect(pendingCopy.edges).toContainEqual(expect.objectContaining({ targetNodeId: cancelledCopy.id, sourcePortId: "capturedFrame" }));
    const cancelled = await generationGraphService.update(ownerEmail, graph.id, updateInput(pending, graph.title,
      pending.nodes.map(node => node.id === reservation.ids[0] ? { ...node, config: { assetId: null,
        resultSource: { nodeId: sourceId, executionId: null, portId: "capturedFrame", index: 0, state: "cancelled" } } } : node), pending.edges));
    expect(cancelled.nodes.find(node => node.id === reservation.ids[0])?.config).toMatchObject({ assetId: null, resultSource: { state: "cancelled" } });
    const first = { ...reservation, draft: { ...reservation.draft, nodes: reservation.draft.nodes.map(node => node.id === reservation.ids[0]
      ? { ...node, config: { assetId: assets[1].id, resultSource: { nodeId: sourceId, executionId: null, portId: "capturedFrame", index: 0, state: "completed" as const } } } : node) } };
    const second = appendCapturedFrameResult(first.draft, sourceId, assets[2].id);
    const allNodes = [...second.draft.nodes, node(displayId, 2000, "output.single", { mediaType: "image" })];
    const allEdges = [...second.draft.edges, { id: randomUUID(), sourceNodeId: first.ids[0], sourcePortId: "image", targetNodeId: displayId, targetPortId: "image", sortOrder: 0 }];
    let saved = await generationGraphService.update(ownerEmail, graph.id, updateInput(cancelled, graph.title, allNodes, allEdges));
    expect(saved.edges.filter(edge => edge.sourcePortId === "capturedFrame")).toHaveLength(2);
    expect((await generationGraphRepository.get(ownerEmail, graph.id)).nodes.filter(node => node.kind === "input.image").map(node => (node.config as { assetId: string }).assetId)).toEqual(expect.arrayContaining([assets[1].id, assets[2].id]));
    await expect(nodeOutputService.resolve(ownerEmail, graph.id, displayId)).resolves.toMatchObject({ groups: [{ assets: [{ id: assets[1].id, type: "image" }] }] });
    const copy = await generationGraphService.copy(ownerEmail, graph.id); graphIds.push(copy.id);
    const copySource = copy.nodes.find(node => node.kind === kind && (kind !== "output.single" || (node.config as { mediaType?: string }).mediaType === "video"))!;
    const copiedCapture = copy.nodes.find(node => node.kind === "input.image" && (node.config as { assetId: string }).assetId === assets[1].id)!;
    expect(copiedCapture.config).toMatchObject({ resultSource: { nodeId: copySource.id, executionId: null, portId: "capturedFrame", state: "completed" } });
    expect(copy.edges).toContainEqual(expect.objectContaining({ sourceNodeId: copySource.id, sourcePortId: "capturedFrame", targetNodeId: copiedCapture.id, targetPortId: "reference" }));
    saved = await generationGraphService.update(ownerEmail, graph.id, updateInput(saved, saved.title, saved.nodes.map(node => node.id === videoId ? { ...node, config: { assetId: null } } : node), saved.edges));
    await expect(nodeOutputService.resolve(ownerEmail, graph.id, displayId)).resolves.toMatchObject({ groups: [{ assets: [{ id: assets[1].id, type: "image" }] }] });
    const storage = { name: "leemage" as const, assertAvailable: vi.fn(), presign: vi.fn(), confirm: vi.fn(), inspect: vi.fn(), resolveReadUrl: vi.fn(), delete: vi.fn() };
    await expect(createMediaAssetService(mediaAssetRepository, storage).remove(ownerEmail, assets[1].id)).rejects.toMatchObject({ name: "MediaAssetInUseError" });
    expect(storage.delete).not.toHaveBeenCalled();
  });

  it.each<{ mode: string; parameters: Record<string, number>; activePort: string; inactivePort: string }>([
    { mode: "timestamp start", parameters: { timestampMs: 0 }, activePort: "frame", inactivePort: "startFrame" },
    { mode: "timestamp end", parameters: { timestampMs: 1500 }, activePort: "frame", inactivePort: "endFrame" },
    { mode: "legacy", parameters: {}, activePort: "endFrame", inactivePort: "frame" },
  ])("admits only active new $mode connections while preserving old wires, editing and full-space copies", async ({ parameters, activePort, inactivePort }) => {
    const graph = await generationGraphRepository.create(ownerEmail, `Frame connections ${inactivePort}`);
    graphIds.push(graph.id);
    const framesId = randomUUID(), otherFramesId = randomUUID(), galleryId = randomUUID(), otherGalleryId = randomUUID(), compareId = randomUUID();
    const initialParameters: Record<string, number> = inactivePort === "frame" ? { timestampMs: 250 } : {};
    const nodes = [
      node(framesId, 0, "edit.video.extractFrames", { parameters: initialParameters }),
      node(otherFramesId, 100, "edit.video.extractFrames", { parameters }),
      node(galleryId, 600, "output.gallery", { mediaType: "image" }),
      node(otherGalleryId, 800, "output.gallery", { mediaType: "image" }),
      node(compareId, 1000, "inspect.imageCompare", {}),
    ];
    const galleryWire = { id: randomUUID(), sourceNodeId: framesId, sourcePortId: inactivePort, targetNodeId: galleryId, targetPortId: "image", sortOrder: 0 };
    const compareWire = { ...galleryWire, id: randomUUID(), targetNodeId: compareId, targetPortId: "before" };
    const initial = await generationGraphService.update(ownerEmail, graph.id, updateInput(graph, graph.title, nodes, [galleryWire, compareWire]));
    // Changing mode does not invalidate historical wires, their pause/order or later position edits.
    let saved = await generationGraphService.update(ownerEmail, graph.id, updateInput(initial, initial.title,
      initial.nodes.map(node => node.id === framesId ? { ...node, config: { parameters }, position: { x: 500, y: 100 } } : node),
      initial.edges.map(edge => edge.id === galleryWire.id ? { ...edge, sortOrder: 7, hasPause: true } : edge)));
    expect(saved.nodes.find(node => node.id === framesId)).toMatchObject({ config: { parameters }, position: { x: 500, y: 100 } });
    expect(saved.edges).toContainEqual({ ...galleryWire, sortOrder: 7, hasPause: true });
    expect(saved.edges).toContainEqual(compareWire);
    expect(saved.writable).toBe(true);
    const activeWire = { ...galleryWire, id: randomUUID(), sourcePortId: activePort, targetNodeId: otherGalleryId };
    saved = await generationGraphService.update(ownerEmail, graph.id, updateInput(saved, saved.title, saved.nodes, [...saved.edges, activeWire]));
    expect(saved.edges).toContainEqual(activeWire);
    const newFrame = node(randomUUID(), 1200, "edit.video.extractFrames", { parameters });
    const attempts = [
      { nodes: saved.nodes, edges: [...saved.edges, { ...galleryWire, id: randomUUID(), sortOrder: 8 }] },
      { nodes: saved.nodes, edges: saved.edges.map(edge => edge.id === galleryWire.id ? { ...edge, sourceNodeId: otherFramesId } : edge) },
      { nodes: saved.nodes, edges: saved.edges.map(edge => edge.id === galleryWire.id ? { ...edge, targetNodeId: otherGalleryId } : edge) },
      { nodes: saved.nodes, edges: saved.edges.map(edge => edge.id === compareWire.id ? { ...edge, targetPortId: "after" } : edge) },
      { nodes: saved.nodes, edges: saved.edges.map(edge => edge.id === activeWire.id ? { ...edge, sourcePortId: inactivePort } : edge) },
      { nodes: [...saved.nodes, newFrame], edges: [...saved.edges, { ...galleryWire, id: randomUUID(), sourceNodeId: newFrame.id, sortOrder: 8 }] },
    ];
    for (const attempt of attempts) {
      await expect(generationGraphService.update(ownerEmail, graph.id, updateInput(saved, saved.title, attempt.nodes, attempt.edges)))
        .rejects.toMatchObject({ name: "GenerationGraphInputError", details: { graph: "NODE_TYPE_UNAVAILABLE" } });
      expect(await generationGraphRepository.get(ownerEmail, graph.id)).toEqual(saved);
    }
    expect(await prisma.generationGraphNode.findUnique({ where: { id: newFrame.id } })).toBeNull();
    const copy = await generationGraphService.copy(ownerEmail, graph.id);
    graphIds.push(copy.id);
    const idMap = new Map(saved.nodes.map(node => [node.id, copy.nodes.find(copied => copied.position.x === node.position.x)!.id]));
    expect(copy.nodes.every(node => !saved.nodes.some(original => original.id === node.id))).toBe(true);
    expect(copy.edges.every(edge => !saved.edges.some(original => original.id === edge.id))).toBe(true);
    expect(copy.edges.map(({ id, ...edge }) => { void id; return edge; })).toEqual(saved.edges.map(({ id, ...edge }) => {
      void id;
      return { ...edge, sourceNodeId: idMap.get(edge.sourceNodeId), targetNodeId: idMap.get(edge.targetNodeId) };
    }));
    expect(copy.nodes.find(node => node.id === idMap.get(framesId))?.config).toEqual({ parameters });
    const copiedSave = await generationGraphService.update(ownerEmail, copy.id, updateInput(copy, "Copied retained wires", copy.nodes, copy.edges));
    expect(copiedSave.edges).toEqual(copy.edges);
    expect(copiedSave.nodes).toEqual(copy.nodes);
    expect(await generationGraphRepository.get(ownerEmail, graph.id)).toEqual(saved);
  });

  it.each(temporarilyHiddenEditNodeKinds)("rejects new %s authoring and execution while retaining saves, full-space copies and protected result assets", async kind => {
    const graph = await generationGraphRepository.create(ownerEmail, `Retained ${kind}`);
    graphIds.push(graph.id);
    const mediaType = kind === "edit.image.resize" ? "image" : "video";
    const mimeType = mediaType === "image" ? "image/png" : "video/mp4";
    const [original, resultAsset] = await Promise.all(["original", "result"].map(label => prisma.mediaAsset.create({ data: {
      ownerEmail, type: mediaType, origin: "upload", storageProvider: "leemage", storageObjectId: randomUUID(),
      storageUrl: `https://storage.example/${label}`, mimeType,
    } })));
    const inputId = randomUUID(), hiddenId = randomUUID(), resultId = randomUUID(), inputEdgeId = randomUUID();
    const config = defaultConfigForKind(kind);
    if (kind === "edit.video.stitch") config.parameters = { repeat: 2, stripAudio: false, clipOrder: [inputEdgeId] };
    const resultSource = { nodeId: hiddenId, executionId: "previous-run", portId: mediaType, index: 0, state: "completed" };
    await prisma.generationGraphNode.createMany({ data: [
      { id: inputId, graphId: graph.id, kind: `input.${mediaType}`, configVersion: 1, config: { assetId: original.id }, x: 0, y: 0 },
      { id: hiddenId, graphId: graph.id, kind, configVersion: 1, config: config as Prisma.InputJsonValue, selectedOutputAssetId: resultAsset.id, x: 400, y: 0 },
      { id: resultId, graphId: graph.id, kind: `input.${mediaType}`, configVersion: 1, config: { assetId: resultAsset.id, resultSource }, x: 800, y: 0 },
    ] });
    await prisma.generationGraphNodeOutput.create({ data: { graphNodeId: hiddenId, portId: mediaType, assetId: resultAsset.id } });
    await prisma.generationGraphEdge.createMany({ data: [
      { id: inputEdgeId, graphId: graph.id, sourceNodeId: inputId, sourcePortId: mediaType, targetNodeId: hiddenId, targetPortId: kind === "edit.video.stitch" ? "clips" : mediaType, sortOrder: 0, hasPause: true },
      { id: randomUUID(), graphId: graph.id, sourceNodeId: hiddenId, sourcePortId: mediaType, targetNodeId: resultId, targetPortId: mediaType === "image" ? "reference" : mediaType, sortOrder: 0 },
    ] });
    const stored = await generationGraphService.get(ownerEmail, graph.id);
    expect(stored).toMatchObject({ writable: true, readOnlyReason: null });
    const saved = await generationGraphService.update(ownerEmail, graph.id, { ...updateInput(stored, stored.title, stored.nodes, stored.edges), selectionChanges: [] });
    expect(saved.nodes).toEqual(stored.nodes);
    expect(saved.edges).toEqual(stored.edges);
    expect(saved.outputBindings).toEqual(stored.outputBindings);
    const rejectedWrites = [
      { nodes: [...saved.nodes, { ...saved.nodes.find(node => node.id === hiddenId)!, id: randomUUID() }], edges: saved.edges },
      { nodes: saved.nodes.map(node => node.id === hiddenId ? { ...node, config: { ...config, presentation: { customTitle: "Changed hidden settings" } } } : node), edges: saved.edges },
      { nodes: saved.nodes, edges: saved.edges.map(edge => edge.id === inputEdgeId ? { ...edge, hasPause: false } : edge) },
      { nodes: saved.nodes, edges: [...saved.edges, { ...saved.edges[0], id: randomUUID() }] },
    ];
    for (const write of rejectedWrites) await expect(generationGraphRepository.update(ownerEmail, graph.id, updateInput(saved, saved.title, write.nodes, write.edges)))
      .rejects.toMatchObject({ details: { graph: "NODE_TYPE_UNAVAILABLE" } });
    await expect(nodeExecutionService.execute(ownerEmail, graph.id, hiddenId, { expectedGraphVersion: saved.version })).rejects.toMatchObject({ name: "NodeExecutionConfigError", details: { node: ["NODE_TYPE_UNAVAILABLE"] } });
    await expect(executeExternalNode(ownerEmail, "unused-key", graph.id, hiddenId, saved.version, null)).rejects.toMatchObject({ name: "NodeExecutionConfigError", details: { node: [kind === "edit.image.resize" ? "BROWSER_ONLY" : "NODE_TYPE_UNAVAILABLE"] } });
    await expect(mediaAssetRepository.createOperation(ownerEmail, { graphId: graph.id, graphNodeId: hiddenId, type: kind, configVersion: 1,
      parameters: config.parameters as CreateMediaOperationInput["parameters"], expectedOutputCount: 1,
      inputs: [{ assetId: original.id, portId: kind === "edit.video.stitch" ? "clips" : mediaType, sortOrder: 0 }],
    })).rejects.toThrow("MEDIA_OPERATION_TARGET_INVALID");
    expect(await prisma.mediaOperation.count({ where: { graphId: graph.id } })).toBe(0);
    expect(await generationGraphRepository.get(ownerEmail, graph.id)).toEqual(saved);

    const copy = await generationGraphService.copy(ownerEmail, graph.id);
    graphIds.push(copy.id);
    const copiedHidden = copy.nodes.find(node => node.kind === kind)!;
    expect(copiedHidden).toMatchObject({ config: kind === "edit.video.stitch" ? { parameters: { repeat: 2, stripAudio: false, clipOrder: [copy.edges.find(edge => edge.targetNodeId === copiedHidden.id)!.id] } } : config,
      selectedOutputAssetId: resultAsset.id });
    expect(copiedHidden.id).not.toBe(hiddenId);
    const copiedResult = copy.nodes.find(node => node.position.x === 800)!;
    expect(copiedResult.config).toEqual({ assetId: resultAsset.id, resultSource: { ...resultSource, nodeId: copiedHidden.id, executionId: null } });
    expect(copy.edges).toHaveLength(2);
    expect(copy.edges.every(edge => copy.nodes.some(node => node.id === edge.sourceNodeId) && copy.nodes.some(node => node.id === edge.targetNodeId))).toBe(true);
    expect(copy.outputBindings).toContainEqual({ graphNodeId: copiedHidden.id, portId: mediaType, assetId: resultAsset.id, sortOrder: 0 });
    const retained = await generationGraphService.update(ownerEmail, graph.id, { ...updateInput(saved, saved.title, saved.nodes.filter(node => node.id !== hiddenId), []), selectionChanges: [] });
    expect(retained.nodes.find(node => node.id === resultId)?.config).toEqual({ assetId: resultAsset.id, resultSource });
    await generationGraphRepository.remove(ownerEmail, copy.id);
    const storage = { name: "leemage" as const, assertAvailable: vi.fn(), presign: vi.fn(), confirm: vi.fn(), inspect: vi.fn(), resolveReadUrl: vi.fn(), delete: vi.fn() };
    await expect(createMediaAssetService(mediaAssetRepository, storage).remove(ownerEmail, resultAsset.id)).rejects.toMatchObject({ name: "MediaAssetInUseError", graphIds: [graph.id] });
    expect(storage.delete).not.toHaveBeenCalled();
    expect(await prisma.mediaAsset.findUnique({ where: { id: resultAsset.id } })).toEqual(resultAsset);
    expect(await prisma.mediaAsset.findUnique({ where: { id: original.id } })).toEqual(original);
  });

  it.each(["edit.video.trim", "edit.video.stitch"] as const)("allows an already admitted %s operation to complete and remain readable in execution History", async kind => {
    const graph = await generationGraphRepository.create(ownerEmail, `Admitted ${kind}`);
    graphIds.push(graph.id);
    const hiddenId = randomUUID();
    const config = defaultConfigForKind(kind);
    await prisma.generationGraphNode.create({ data: { id: hiddenId, graphId: graph.id, kind, x: 0, y: 0, configVersion: 1, config: config as Prisma.InputJsonValue } });
    // This row represents a request accepted before the temporary availability gate.
    const operation = await prisma.mediaOperation.create({ data: { ownerEmail, graphId: graph.id, graphNodeId: hiddenId, type: kind, configVersion: 1, parameters: config.parameters as Prisma.InputJsonValue, expectedOutputCount: 1 } });
    const claimed = await mediaAssetRepository.claimPendingServerOperation(operation.id);
    expect(claimed).not.toBeNull();
    if (!claimed) throw new Error("The admitted operation was not claimed.");
    const ids = await mediaAssetRepository.completeServerOperation(ownerEmail, operation.id, [{ type: "video", storageProvider: "leemage", storageObjectId: randomUUID(), storageUrl: "https://storage.example/completed.mp4", mimeType: "video/mp4", bytes: 64, width: 16, height: 16, durationMs: 100 }], new Date(), claimed.lease);
    expect(ids).toHaveLength(1);
    expect(await readExternalNodeExecution(ownerEmail, graph.id, hiddenId, operation.id)).toMatchObject({ status: "completed", outputAssetIds: ids });
    expect((await generationGraphRepository.get(ownerEmail, graph.id)).nodes[0]).toMatchObject({ config, selectedOutputAssetId: ids[0] });
  });

  it("preserves retired nodes in copies and prevents deletion while an Assistant is running", async () => {
    const graph = await generationGraphRepository.create(ownerEmail, "Preserved legacy node");
    graphIds.push(graph.id);
    const retiredId = randomUUID();
    await prisma.generationGraphNode.create({ data: { id: retiredId, graphId: graph.id, kind: "edit.image.annotation", configVersion: 1, config: { parameters: {} }, x: 1, y: 2 } });
    const copy = await generationGraphRepository.copy(ownerEmail, graph.id);
    graphIds.push(copy.id);
    expect(copy.nodes).toHaveLength(1);
    expect(copy.nodes[0]).toMatchObject({ kind: "edit.image.annotation", config: { parameters: {} } });
    expect(copy.nodes[0].id).not.toBe(retiredId);
    const assistantNode = await prisma.generationGraphNode.create({ data: { id: randomUUID(), graphId: graph.id, kind: "generate.assistant", configVersion: 1, config: { prompt: "x", modelKey: "fixture" }, x: 0, y: 0 } });
    const execution = await prisma.assistantExecution.create({ data: { ownerEmail, graphId: graph.id, graphNodeId: assistantNode.id, modelKey: "fixture", inputSnapshot: {} } });
    await expect(generationGraphRepository.remove(ownerEmail, graph.id)).rejects.toBeInstanceOf(GenerationGraphActiveExecutionError);
    expect(await prisma.generationGraph.count({ where: { id: graph.id } })).toBe(1);
    await prisma.assistantExecution.update({ where: { id: execution.id }, data: { status: "cancelled", finishedAt: new Date() } });
    await generationGraphRepository.remove(ownerEmail, graph.id);
    expect(await prisma.generationGraph.count({ where: { id: graph.id } })).toBe(0);
  });

  it("keeps unchanged rows intact in a maximum-size Graph update", async () => {
    const graph = await generationGraphRepository.create(ownerEmail, "Maximum Graph");
    graphIds.push(graph.id);
    const nodes = Array.from({ length: 500 }, (_, index) => node(`node-${index}`, index));
    await prisma.generationGraphNode.createMany({
      data: nodes.map((value) => ({
        id: value.id,
        graphId: graph.id,
        kind: value.kind,
        x: value.position.x,
        y: value.position.y,
        configVersion: value.configVersion,
        config: value.config as Prisma.InputJsonValue,
        selectedOutputAssetId: value.selectedOutputAssetId,
      })),
    });
    const before = await prisma.generationGraphNode.findMany({
      where: { graphId: graph.id },
      select: { id: true, x: true, updatedAt: true },
    });
    const changed = nodes.map((value, index) => index === 251
      ? { ...value, position: { x: value.position.x + 1, y: value.position.y } }
      : value);

    const saved = await generationGraphRepository.update(
      ownerEmail,
      graph.id,
      updateInput(graph, "Maximum Graph", changed),
    );
    const after = await prisma.generationGraphNode.findMany({
      where: { graphId: graph.id },
      select: { id: true, x: true, updatedAt: true },
    });
    const beforeById = new Map(before.map((value) => [value.id, value]));

    expect(saved.version).toBe(2);
    expect(after).toHaveLength(500);
    expect(after.find((value) => value.id === "node-251")?.x).toBe(252);
    for (const value of after.filter((row) => row.id !== "node-251")) {
      expect(value.updatedAt).toEqual(beforeById.get(value.id)?.updatedAt);
    }
  });

  it("converges concurrent saves through the existing version CAS", async () => {
    const graph = await generationGraphRepository.create(ownerEmail, "Concurrent Graph");
    graphIds.push(graph.id);
    const first = updateInput(graph, "First", [node("concurrent-node", 1)]);
    const second = updateInput(graph, "Second", [node("concurrent-node", 2)]);

    const results = await Promise.allSettled([
      generationGraphRepository.update(ownerEmail, graph.id, first),
      generationGraphRepository.update(ownerEmail, graph.id, second),
    ]);

    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    const rejected = results.find((result) => result.status === "rejected");
    expect(rejected?.status === "rejected" && rejected.reason).toBeInstanceOf(GenerationGraphVersionConflictError);
    await expect(generationGraphRepository.get(ownerEmail, graph.id)).resolves.toMatchObject({
      version: 2,
      title: expect.stringMatching(/^(First|Second)$/),
    });
  });

  it("updates and removes only the changed edge and node rows", async () => {
    const graph = await generationGraphRepository.create(ownerEmail, "Edge Graph");
    graphIds.push(graph.id);
    const promptA = node("edge-prompt-a", 0);
    const promptB = node("edge-prompt-b", 50);
    const image = node("edge-image", 100, "generate.image", {
      prompt: "",
      modelKey: null,
      parameters: {},
    });
    const edge = {
      id: "edge-1",
      sourceNodeId: promptA.id,
      targetNodeId: image.id,
      sourcePortId: "text",
      targetPortId: "prompt",
      sortOrder: 0,
      hasPause: false,
    } satisfies GraphEdgeInput;

    await generationGraphRepository.update(
      ownerEmail,
      graph.id,
      updateInput(graph, "Edge Graph", [promptA, promptB, image], [edge]),
    );
    await expect(prisma.generationGraphEdge.findMany({
      where: { graphId: graph.id },
      select: { id: true, sourceNodeId: true },
    })).resolves.toEqual([{ id: edge.id, sourceNodeId: promptA.id }]);
    const switchedEdge = { ...edge, sourceNodeId: promptB.id };
    await generationGraphRepository.update(
      ownerEmail,
      graph.id,
      updateInput({ version: 2 }, "Edge Graph", [promptA, promptB, image], [switchedEdge]),
    );
    await generationGraphRepository.update(
      ownerEmail,
      graph.id,
      updateInput({ version: 3 }, "Edge Graph", [promptA, image], [edge]),
    );

    const final = await generationGraphRepository.get(ownerEmail, graph.id);
    expect(final.nodes.map((value) => value.id)).toEqual([promptA.id, image.id]);
    expect(final.edges).toMatchObject([{ id: edge.id, sourceNodeId: promptA.id }]);
  });
});
