// @vitest-environment node
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { prisma } from "@/server/db/prisma";
import { postgresIntegrationEnabled } from "@/test-utils/postgres-integration";
import { externalNodeSubmission, ExternalExecutionReplay } from "./external-node-submission";
import { createAssistantExecution, claimAssistantExecution, settleAssistantExecution, selectAssistantItem, cancelAssistantExecution } from "@/server/assistant-executions/assistant-execution-repository";
import { createImageGenerationRecord } from "@/server/image-generation/image-generation-repository";
import { createVideoGenerationRecord } from "@/server/video-generation/video-generation-repository";
import { createAudioGenerationRecord } from "@/server/audio-generation/audio-generation-repository";
import { mediaAssetRepository } from "@/server/media-assets/media-asset-repository";
import { findNodeDefinition, type CanonicalNodeKind } from "@/shared/generation-graph/node-registry";
import { defaultConfigForKind } from "@/shared/generation-graph/node-default-config";
import { generationGraphRepository } from "@/server/generation-graph/generation-graph-repository";
import type { Prisma } from "@prisma/client";
import { executeExternalNode, listExternalNodeExecutions, readExternalNodeExecution } from "@/server/external-api/space-executions";
// No provider/catalog network calls; actual execution repositories and all DB writes remain real.
vi.mock("@/server/generation-request/request-snapshot", async original => ({
  ...await original<typeof import("@/server/generation-request/request-snapshot")>(),
  snapshotRequest: async (_type: string, payload: Record<string, unknown>) => payload,
}));

describe.skipIf(!postgresIntegrationEnabled)("external node atomic submission", () => {
  const ownerEmail = "external-nodes-" + randomUUID() + "@example.com";
  const apiKeyId = randomUUID();
  const kinds: CanonicalNodeKind[] = ["generate.image", "generate.video", "generate.audio", "generate.assistant", "edit.video.stitch", "edit.video.trim", "edit.video.extractFrames"];
  const graphs: string[] = [], modelKeys: string[] = [];
  let assetId: string;
  beforeAll(async () => {
    await prisma.apiKey.create({ data: { id: apiKeyId, ownerEmail, label: "Atomic test", keyHash: randomUUID(), maskedKey: "test" } });
    const asset = await prisma.mediaAsset.create({ data: { ownerEmail, type: "video", origin: "upload", mimeType: "video/mp4", storageProvider: "s3", storageObjectId: randomUUID(), storageUrl: "https://storage.example/video.mp4", bytes: 200, durationMs: 10_000, width: 128, height: 128 } });
    assetId = asset.id;
  });
  afterAll(async () => {
    await prisma.imageGeneration.deleteMany({ where: { ownerEmail } });
    await prisma.videoGeneration.deleteMany({ where: { ownerEmail } });
    await prisma.audioGeneration.deleteMany({ where: { ownerEmail } });
    await prisma.mediaOperation.deleteMany({ where: { ownerEmail } });
    await prisma.generationGraph.deleteMany({ where: { id: { in: graphs } } });
    await prisma.mediaAsset.deleteMany({ where: { ownerEmail } });
    await prisma.modelCatalog.deleteMany({ where: { key: { in: modelKeys } } });
    await prisma.apiKey.deleteMany({ where: { id: apiKeyId } });
  });
  async function fixture(kind: CanonicalNodeKind) {
    const modelKey = kind.startsWith("generate.") ? "external-model-" + randomUUID() : null;
    if (modelKey) {
      modelKeys.push(modelKey);
      await prisma.modelCatalog.create({ data: { key: modelKey, label: "Atomic test", type: kind === "generate.assistant" ? "llm" : kind === "generate.image" ? "image" : kind === "generate.video" ? "video" : "audio", vendor: "OPENAI", provider: "openai_compatible", providerConfig: {}, parameters: {}, meta: {}, isActive: true } });
    }
    const nodeId = randomUUID();
    const config = defaultConfigForKind(kind);
    const graph = await prisma.generationGraph.create({ data: { ownerEmail, title: "Atomic", nodes: { create: { id: nodeId, kind, configVersion: 1, config: config as Prisma.InputJsonValue, x: 0, y: 0 } } } });
    graphs.push(graph.id);
    const input = { ownerEmail, apiKeyId, graphId: graph.id, nodeId, expectedGraphVersion: 1, idempotencyKey: "once" };
    const snapshot = { kind, assetIds: [assetId] };
    const create = async (tx: Prisma.TransactionClient, id: string) => {
      const payload = { model: modelKey!, prompt: "same" };
      if (kind === "generate.image") await createImageGenerationRecord(id, payload as never, ownerEmail, apiKeyId, nodeId, payload, [], undefined, tx);
      else if (kind === "generate.video") await createVideoGenerationRecord(id, payload as never, ownerEmail, apiKeyId, nodeId, payload, [], undefined, tx);
      else if (kind === "generate.audio") await createAudioGenerationRecord(id, payload as never, ownerEmail, apiKeyId, nodeId, payload, [], tx);
      else if (kind === "generate.assistant") await createAssistantExecution({ ownerEmail, graphId: graph.id, graphNodeId: nodeId, modelKey: modelKey!, snapshot: { instruction: "same", outputMode: "list", text: null, assets: [] } }, { transaction: tx, executionId: id });
      else {
        const definition = findNodeDefinition(kind)!;
        const parsed = definition.configSchema.parse(config) as { parameters: Record<string, unknown> };
        const port = definition.ports.find(port => port.direction === "input" && port.valueType === "video")!;
        await mediaAssetRepository.createOperation(ownerEmail, {
          graphId: graph.id, graphNodeId: nodeId, type: kind as never, configVersion: 1,
          parameters: parsed.parameters as never, expectedOutputCount: kind === "edit.video.extractFrames" ? 2 : 1,
          inputs: Array.from({ length: Math.max(1, port.minConnections) }, (_, sortOrder) => ({ assetId, portId: port.id, sortOrder })),
        }, { transaction: tx, executionId: id });
      }
      return id;
    };
    return { input, graph, nodeId, modelKey, snapshot, create, submit: () => externalNodeSubmission(input).context.commit(snapshot, kind, modelKey, create) };
  }
  it.each(kinds)("commits one %s job for simultaneous retries and replays after graph changes", async kind => {
    const f = await fixture(kind);
    const results = await Promise.all(Array.from({ length: 6 }, async () => {
      try { return { created: true, id: await f.submit() }; }
      catch (error) { if (!(error instanceof ExternalExecutionReplay)) throw error; return { created: false, id: error.executionId }; }
    }));
    expect(results.filter(row => row.created)).toHaveLength(1);
    expect(new Set(results.map(row => row.id)).size).toBe(1);
    expect(await prisma.nodeExecutionSubmission.count({ where: { graphId: f.graph.id } })).toBe(1);
    const id = results[0].id;
    // Durable receipt survives terminal execution and authoring changes.
    if (kind === "generate.image") await prisma.imageGeneration.update({ where: { requestId: id }, data: { status: "cancelled" } });
    else if (kind === "generate.video") await prisma.videoGeneration.update({ where: { requestId: id }, data: { status: "failed" } });
    else if (kind === "generate.audio") await prisma.audioGeneration.update({ where: { requestId: id }, data: { status: "completed" } });
    else if (kind === "generate.assistant") await cancelAssistantExecution(ownerEmail, f.graph.id, f.nodeId, id);
    else await prisma.mediaOperation.update({ where: { id }, data: { status: "cancelled" } });
    await prisma.generationGraph.update({ where: { id: f.graph.id }, data: { version: { increment: 1 } } });
    const restarted = externalNodeSubmission(f.input);
    expect(await restarted.lookup()).toBe(id);
    await expect(restarted.context.commit(f.snapshot, kind, f.modelKey, f.create)).rejects.toMatchObject({ executionId: id });
    await expect(externalNodeSubmission({ ...f.input, expectedGraphVersion: 2 }).lookup()).rejects.toThrow("IDEMPOTENCY_CONFLICT");
    expect(await externalNodeSubmission({ ...f.input, apiKeyId: "another-key" }).lookup()).toBeNull();
    expect(await externalNodeSubmission({ ...f.input, ownerEmail: "another-owner" }).lookup()).toBeNull();
  });
  it("rolls back a job created before a simulated crash, then allows exactly one retry", async () => {
    const f = await fixture("generate.assistant");
    let rolledBackId = "";
    await expect(externalNodeSubmission(f.input).context.commit(f.snapshot, "generate.assistant", f.modelKey, async (tx, id) => {
      rolledBackId = id; await f.create(tx, id); throw new Error("SIMULATED_CRASH");
    })).rejects.toThrow("SIMULATED_CRASH");
    expect(await prisma.assistantExecution.count({ where: { id: rolledBackId } })).toBe(0);
    expect(await prisma.nodeExecutionSubmission.count({ where: { graphId: f.graph.id } })).toBe(0);
    const accepted = await f.submit();
    expect(await externalNodeSubmission(f.input).lookup()).toBe(accepted);
    await cancelAssistantExecution(ownerEmail, f.graph.id, f.nodeId, accepted);
  });
  it.each(kinds)("preserves %s replay, history, cancellation and owner boundaries after kind changes", async kind => {
    const f = await fixture(kind);
    const id = await f.submit();
    // Simulate a persisted authoring change independently of normal active-edit protection.
    await prisma.generationGraphNode.update({ where: { id: f.nodeId }, data: { kind: "note.memo", config: defaultConfigForKind("note.memo") as Prisma.InputJsonValue } });
    await prisma.generationGraph.update({ where: { id: f.graph.id }, data: { version: 2 } });
    const original = await readExternalNodeExecution(ownerEmail, f.graph.id, f.nodeId, id);
    expect(original.executionId).toBe(id);
    expect((await executeExternalNode(ownerEmail, apiKeyId, f.graph.id, f.nodeId, 1, "once")).executionId).toBe(id);
    const page = await listExternalNodeExecutions(ownerEmail, f.graph.id, f.nodeId, { limit: 1 });
    expect(page.items.map(row => row.executionId)).toEqual([id]);
    expect(page.nextCursor).toBeNull();
    expect((await readExternalNodeExecution(ownerEmail, f.graph.id, f.nodeId, id, true)).status).toBe("cancelled");
    await expect(readExternalNodeExecution("another-owner", f.graph.id, f.nodeId, id)).rejects.toThrow();
    await expect(executeExternalNode(ownerEmail, apiKeyId, f.graph.id, f.nodeId, 2, "once")).rejects.toThrow("IDEMPOTENCY_CONFLICT");
    expect(await prisma.nodeExecutionSubmission.count({ where: { graphId: f.graph.id } })).toBe(1);
  });
  it("merges different source kinds with stable keyset pagination", async () => {
    const f = await fixture("generate.image");
    const imageId = await f.submit();
    await prisma.imageGeneration.update({ where: { requestId: imageId }, data: { status: "cancelled" } });
    const audioId = randomUUID();
    const payload = { model: f.modelKey!, prompt: "other source" };
    await createAudioGenerationRecord(audioId, payload as never, ownerEmail, apiKeyId, f.nodeId, payload);
    const page = await listExternalNodeExecutions(ownerEmail, f.graph.id, f.nodeId, { limit: 1 });
    expect(page.items[0].executionId).toBe(audioId);
    expect(page.nextCursor).toBeTruthy();
    await prisma.generationGraphNode.update({ where: { id: f.nodeId }, data: { kind: "note.memo" } });
    const next = await listExternalNodeExecutions(ownerEmail, f.graph.id, f.nodeId, { limit: 1, cursor: page.nextCursor! });
    expect(next.items[0].executionId).toBe(imageId);
    expect(next.nextCursor).toBeNull();
    await readExternalNodeExecution(ownerEmail, f.graph.id, f.nodeId, audioId, true);
  });
  it("rechecks graph versions inside admission and leaves no receipt on stale input", async () => {
    const f = await fixture("generate.assistant");
    await prisma.generationGraph.update({ where: { id: f.graph.id }, data: { version: 2 } });
    await expect(f.submit()).rejects.toThrow("GRAPH_VERSION_CONFLICT");
    expect(await prisma.nodeExecutionSubmission.count({ where: { graphId: f.graph.id } })).toBe(0);
  });
  it("preserves Assistant selection CAS, cancellation and graph deletion protection", async () => {
    const f = await fixture("generate.assistant");
    const id = await f.submit();
    await expect(generationGraphRepository.remove(ownerEmail, f.graph.id)).rejects.toThrow("GRAPH_ACTIVE_EXECUTION");
    const claim = await claimAssistantExecution(id);
    expect(claim).toBeTruthy();
    await settleAssistantExecution(id, claim!.lease, { items: [{ id: id + ":1", text: "first" }, { id: id + ":2", text: "second" }], text: "1. first\n\n2. second" });
    const selection = { action: "select-item", itemId: id + ":2", expectedSelectionVersion: 0 };
    const chosen = await selectAssistantItem(ownerEmail, f.graph.id, f.nodeId, id, selection);
    expect(chosen.selectionVersion).toBe(1);
    await expect(selectAssistantItem(ownerEmail, f.graph.id, f.nodeId, id, selection)).rejects.toThrow("ASSISTANT_SELECTION_CONFLICT");
    await expect(selectAssistantItem("another", f.graph.id, f.nodeId, id, { ...selection, expectedSelectionVersion: 1 })).rejects.toThrow("NODE_EXECUTION_NOT_FOUND");
    expect((await cancelAssistantExecution(ownerEmail, f.graph.id, f.nodeId, id)).status).toBe("completed");
    await generationGraphRepository.remove(ownerEmail, f.graph.id);
    expect(await prisma.nodeExecutionSubmission.count({ where: { graphId: f.graph.id } })).toBe(0);
  });
});
