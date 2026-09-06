import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const tx = {
    generationGraph: {
      findFirst: vi.fn(),
      updateMany: vi.fn(),
      findUniqueOrThrow: vi.fn(),
      create: vi.fn(),
    },
    generationGraphNode: { findMany: vi.fn(), upsert: vi.fn(), deleteMany: vi.fn(), create: vi.fn() },
    generationGraphEdge: { findMany: vi.fn(), upsert: vi.fn(), deleteMany: vi.fn(), createMany: vi.fn() },
    generationGraphNodeOutput: { findMany: vi.fn(), createMany: vi.fn() },
    imageGeneration: { count: vi.fn() },
    videoGeneration: { count: vi.fn() },
    audioGeneration: { count: vi.fn() },
    mediaOperation: { count: vi.fn() },
    mediaAsset: { findMany: vi.fn() },
  };
  const prisma = {
    generationGraph: {
      create: vi.fn(),
      findMany: vi.fn(),
      findFirst: vi.fn(),
      deleteMany: vi.fn(),
    },
    $transaction: vi.fn(),
  };
  return { prisma, tx };
});

vi.mock("@/server/db/prisma", () => ({ prisma: mocks.prisma }));

import {
  GenerationGraphActiveExecutionError,
  GenerationGraphNotFoundError,
  GenerationGraphReferenceError,
  GenerationGraphVersionConflictError,
} from "./generation-graph-errors";
import type { UpdateGenerationGraphInput } from "./generation-graph-contract";
import { generationGraphRepository } from "./generation-graph-repository";

const now = new Date("2026-09-04T00:00:00.000Z");
const graphRecord = {
  id: "graph_1",
  ownerEmail: "owner@example.com",
  title: "Graph v2",
  version: 2,
  schemaVersion: 3, groups: [],
  minimumWriterVersion: 3,
  createdAt: now,
  updatedAt: now,
  nodes: [],
  edges: [],
};

const input: UpdateGenerationGraphInput = {
  schemaVersion: 3, groups: [],
  expectedVersion: 1,
  title: "Graph v2",
  nodes: [
    {
      id: "prompt_1",
      kind: "input.prompt",
      position: { x: 5, y: 6 },
      configVersion: 1,
      config: { text: "hello" },
      selectedOutputAssetId: null,
    },
    {
      id: "image_1",
      kind: "generate.image",
      position: { x: 25, y: 6 },
      configVersion: 1,
      config: { prompt: "", modelKey: null, parameters: {} },
      selectedOutputAssetId: null,
    },
  ],
  edges: [{
    id: "edge_1",
    sourceNodeId: "prompt_1",
    sourcePortId: "text",
    targetNodeId: "image_1",
    targetPortId: "prompt",
    sortOrder: 0,
  }],
};

describe("generationGraphRepository", () => {
  it("preserves unsupported v2 Split payloads as read-only instead of interpreting their materialization", async () => {
    const config = { materialization: { opaqueFutureStructure: ["keep", 9] }, future: true };
    const source = { ...graphRecord, schemaVersion: 2, minimumWriterVersion: 2,
      nodes: [{ id: "future_split", kind: "edit.image.splitGrid", x: 7, y: 9,
        configVersion: 9, config, selectedOutputAssetId: null }] };
    const before = structuredClone(source);
    mocks.prisma.generationGraph.findFirst.mockResolvedValue(source);
    const result = await generationGraphRepository.get("owner@example.com", "graph_1");
    expect(result).toMatchObject({ writable: false, readOnlyReason: "UNKNOWN_CONFIG_VERSION",
      nodes: [{ id: "future_split", configVersion: 9, config }] });
    expect(source).toEqual(before);
    expect(mocks.tx.generationGraph.updateMany).not.toHaveBeenCalled();
  });
  it("copies only an owned snapshot with new node and edge identities", async () => {
    const group = { id: "source_group", title: "Retained Frame", color: "purple", locked: true,
      bounds: { x: -20, y: -20, width: 700, height: 400 }, memberNodeIds: input.nodes.map((node) => node.id) };
    mocks.tx.generationGraph.findFirst.mockResolvedValue({ ...graphRecord, groups: [group], nodes: input.nodes.map((node) => ({ ...node, x: node.position.x, y: node.position.y })), edges: input.edges });
    mocks.tx.generationGraph.create.mockResolvedValue({ id: "copy-space" });
    mocks.tx.generationGraphNodeOutput.findMany.mockResolvedValue([]);
    mocks.tx.generationGraph.findUniqueOrThrow.mockResolvedValue({ ...graphRecord, id: "copy-space" });
    await generationGraphRepository.copy("owner@example.com", "graph_1");
    expect(mocks.tx.generationGraph.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "graph_1", ownerEmail: "owner@example.com" } }));
    const nodeWrites = mocks.tx.generationGraphNode.create.mock.calls.map(([call]) => call.data);
    expect(nodeWrites).toHaveLength(2);
    expect(nodeWrites[0]).toMatchObject({ graphId: "copy-space", config: { text: "hello" } });
    expect(nodeWrites[0].id).not.toBe("prompt_1");
    const edge = mocks.tx.generationGraphEdge.createMany.mock.calls[0][0].data[0];
    expect(edge.sourceNodeId).toBe(nodeWrites[0].id);
    expect(edge.targetNodeId).toBe(nodeWrites[1].id);
    expect(edge.id).not.toBe("edge_1");
    const groupWrites = mocks.tx.generationGraph.create.mock.calls[0][0].data.groups;
    expect(groupWrites).toEqual([{ ...group, id: expect.any(String), memberNodeIds: nodeWrites.map((node) => node.id) }]);
    expect(groupWrites[0].id).not.toBe(group.id);
  });
  it("does not create a copy when the owner-scoped source cannot be found", async () => {
    mocks.tx.generationGraph.findFirst.mockResolvedValue(null);
    await expect(generationGraphRepository.copy("other@example.com", "graph_1")).rejects.toBeInstanceOf(GenerationGraphNotFoundError);
    expect(mocks.tx.generationGraph.create).not.toHaveBeenCalled();
  });
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.prisma.$transaction.mockImplementation(async (callback) => callback(mocks.tx));
    mocks.tx.generationGraphNode.findMany.mockResolvedValue([]);
    mocks.tx.generationGraphEdge.findMany.mockResolvedValue([]);
    mocks.tx.imageGeneration.count.mockResolvedValue(0);
    mocks.tx.videoGeneration.count.mockResolvedValue(0);
    mocks.tx.audioGeneration.count.mockResolvedValue(0);
    mocks.tx.mediaOperation.count.mockResolvedValue(0);
    mocks.tx.mediaAsset.findMany.mockResolvedValue([]);
    mocks.tx.generationGraph.updateMany.mockResolvedValue({ count: 1 });
    mocks.tx.generationGraphNode.deleteMany.mockResolvedValue({ count: 0 });
    mocks.tx.generationGraphEdge.deleteMany.mockResolvedValue({ count: 0 });
    mocks.tx.generationGraphNode.upsert.mockResolvedValue({});
    mocks.tx.generationGraphEdge.upsert.mockResolvedValue({});
    mocks.tx.generationGraph.findUniqueOrThrow.mockResolvedValue(graphRecord);
  });

  it("creates every new Graph on the v2-only contract", async () => {
    mocks.prisma.generationGraph.create.mockResolvedValue(graphRecord);

    await expect(generationGraphRepository.create("owner@example.com", "New Graph"))
      .resolves.toMatchObject({ schemaVersion: 3, groups: [], minimumWriterVersion: 3 });
    expect(mocks.prisma.generationGraph.create).toHaveBeenCalledWith({
      data: { ownerEmail: "owner@example.com", title: "New Graph", schemaVersion: 3, groups: [], minimumWriterVersion: 3 },
      include: expect.any(Object),
    });
  });

  it("rejects a stale version before writing", async () => {
    mocks.tx.generationGraph.findFirst.mockResolvedValue({ version: 2, nodes: [] });

    await expect(generationGraphRepository.update("owner@example.com", "graph_1", input))
      .rejects.toBeInstanceOf(GenerationGraphVersionConflictError);
    expect(mocks.tx.generationGraph.updateMany).not.toHaveBeenCalled();
  });

  it("updates canonical nodes and edges in one conditional transaction", async () => {
    mocks.tx.generationGraph.findFirst.mockResolvedValue({ version: 1, nodes: [] });

    await expect(generationGraphRepository.update("owner@example.com", "graph_1", input))
      .resolves.toMatchObject({ id: "graph_1", version: 2 });
    expect(mocks.prisma.$transaction).toHaveBeenCalledOnce();
    expect(mocks.tx.generationGraph.updateMany).toHaveBeenCalledWith({
      where: { id: "graph_1", ownerEmail: "owner@example.com", version: 1 },
      data: {
        title: "Graph v2",
        version: { increment: 1 },
        schemaVersion: 3, groups: [],
        minimumWriterVersion: 3,
      },
    });
    expect(mocks.tx.generationGraphNode.upsert).toHaveBeenCalledWith(expect.objectContaining({
      create: expect.objectContaining({
        id: "prompt_1",
        graphId: "graph_1",
        kind: "input.prompt",
        selectedOutputAssetId: null,
      }),
    }));
    expect(mocks.tx.generationGraphEdge.upsert).toHaveBeenCalledWith(expect.objectContaining({
      create: expect.objectContaining({
        id: "edge_1",
        graphId: "graph_1",
        sourcePortId: "text",
        targetPortId: "prompt",
        sortOrder: 0,
      }),
    }));
  });

  it("rejects future writers before any mutation", async () => {
    mocks.tx.generationGraph.findFirst.mockResolvedValue({ version: 1, schemaVersion: 4, minimumWriterVersion: 4, nodes: [] });
    await expect(generationGraphRepository.update("owner@example.com", "graph_1", input)).rejects.toThrow();
    expect(mocks.tx.generationGraph.updateMany).not.toHaveBeenCalled();
    expect(mocks.tx.generationGraphNode.upsert).not.toHaveBeenCalled();
  });

  it("turns a concurrent conditional update miss into a conflict", async () => {
    mocks.tx.generationGraph.findFirst.mockResolvedValue({ version: 1, nodes: [] });
    mocks.tx.generationGraph.updateMany.mockResolvedValue({ count: 0 });

    await expect(generationGraphRepository.update("owner@example.com", "graph_1", input))
      .rejects.toBeInstanceOf(GenerationGraphVersionConflictError);
    expect(mocks.tx.generationGraphNode.upsert).not.toHaveBeenCalled();
  });

  it("rejects an id already owned by another graph", async () => {
    mocks.tx.generationGraph.findFirst.mockResolvedValue({ version: 1, nodes: [] });
    mocks.tx.generationGraphNode.findMany.mockResolvedValue([{ graphId: "graph_other" }]);

    await expect(generationGraphRepository.update("owner@example.com", "graph_1", input))
      .rejects.toBeInstanceOf(GenerationGraphReferenceError);
  });

  it("rejects an input asset owned by another account", async () => {
    mocks.tx.generationGraph.findFirst.mockResolvedValue({ version: 1, nodes: [] });
    mocks.tx.mediaAsset.findMany.mockResolvedValue([{
      id: "asset_1",
      ownerEmail: "other@example.com",
      type: "image",
      status: "completed",
      graphNodeOutputs: [],
      imageGenerationImage: null,
      videoGenerationVideo: null,
      audioGenerationAudio: null,
    }]);
    const inputWithAsset = {
      ...input,
      nodes: [{
        id: "input_1",
        kind: "input.image",
        position: { x: 0, y: 0 },
        configVersion: 1,
        config: { assetId: "asset_1" },
        selectedOutputAssetId: null,
      }],
      edges: [],
    } satisfies UpdateGenerationGraphInput;

    await expect(generationGraphRepository.update("owner@example.com", "graph_1", inputWithAsset))
      .rejects.toMatchObject({ reason: "GRAPH_OUTPUT_INVALID" });
  });

  it("accepts a completed output asset produced by the same node", async () => {
    mocks.tx.generationGraph.findFirst.mockResolvedValue({ version: 1, nodes: [] });
    mocks.tx.mediaAsset.findMany.mockResolvedValue([{
      id: "asset_1",
      ownerEmail: "owner@example.com",
      type: "image",
      status: "completed",
      graphNodeOutputs: [{ graphNodeId: "image_1" }],
      imageGenerationImage: null,
      videoGenerationVideo: null,
      audioGenerationAudio: null,
    }]);

    await expect(generationGraphRepository.update("owner@example.com", "graph_1", {
      ...input,
      nodes: input.nodes.map((node) => node.id === "image_1"
        ? { ...node, selectedOutputAssetId: "asset_1" }
        : node),
    })).resolves.toMatchObject({ id: "graph_1" });
  });

  it("blocks node removal while an execution is active", async () => {
    mocks.tx.generationGraph.findFirst.mockResolvedValue({
      version: 1,
      nodes: [{ id: "removed_1", kind: "generate.image" }],
    });
    mocks.tx.imageGeneration.count.mockResolvedValue(1);

    await expect(generationGraphRepository.update("owner@example.com", "graph_1", input))
      .rejects.toBeInstanceOf(GenerationGraphActiveExecutionError);
    expect(mocks.tx.generationGraph.updateMany).not.toHaveBeenCalled();
  });

  it("returns unsupported canonical rows unchanged as read-only", async () => {
    mocks.prisma.generationGraph.findFirst.mockResolvedValue({
      ...graphRecord,
      nodes: [{
        id: "future_1",
        graphId: "graph_1",
        kind: "future.node",
        x: 1,
        y: 2,
        configVersion: 9,
        config: { raw: [1, 2, 3] },
        selectedOutputAssetId: null,
        createdAt: now,
        updatedAt: now,
      }],
    });

    await expect(generationGraphRepository.get("owner@example.com", "graph_1"))
      .resolves.toMatchObject({
        writable: false,
        readOnlyReason: "UNKNOWN_NODE_KIND",
        nodes: [{ kind: "future.node", configVersion: 9, config: { raw: [1, 2, 3] } }],
      });
  });

  it("conceals foreign graphs and deletes only the owned Graph root", async () => {
    mocks.prisma.generationGraph.findFirst.mockResolvedValue(null);
    mocks.prisma.generationGraph.deleteMany
      .mockResolvedValueOnce({ count: 0 })
      .mockResolvedValueOnce({ count: 1 });

    await expect(generationGraphRepository.get("owner@example.com", "graph_other"))
      .rejects.toBeInstanceOf(GenerationGraphNotFoundError);
    await expect(generationGraphRepository.remove("owner@example.com", "graph_other"))
      .rejects.toBeInstanceOf(GenerationGraphNotFoundError);
    await expect(generationGraphRepository.remove("owner@example.com", "graph_1"))
      .resolves.toBeUndefined();
    expect(mocks.prisma.generationGraph.deleteMany).toHaveBeenLastCalledWith({
      where: { id: "graph_1", ownerEmail: "owner@example.com" },
    });
  });
});
