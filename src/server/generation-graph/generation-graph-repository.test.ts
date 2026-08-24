import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const tx = {
    generationGraph: {
      findFirst: vi.fn(),
      updateMany: vi.fn(),
      findUniqueOrThrow: vi.fn(),
    },
    generationGraphNode: {
      findMany: vi.fn(),
      upsert: vi.fn(),
      deleteMany: vi.fn(),
    },
    generationGraphEdge: {
      findMany: vi.fn(),
      upsert: vi.fn(),
      deleteMany: vi.fn(),
    },
    imageGenerationImage: { findMany: vi.fn() },
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
  GenerationGraphNotFoundError,
  GenerationGraphReferenceError,
  GenerationGraphVersionConflictError,
} from "./generation-graph-errors";
import { generationGraphRepository } from "./generation-graph-repository";

const now = new Date("2026-08-24T00:00:00.000Z");
const graphRecord = {
  id: "graph_1",
  ownerEmail: "owner@example.com",
  title: "Graph",
  version: 2,
  createdAt: now,
  updatedAt: now,
  nodes: [],
  edges: [],
};
const input = {
  expectedVersion: 1,
  title: "Graph",
  nodes: [
    {
      id: "node_1",
      type: "imageGeneration" as const,
      position: { x: 1, y: 2 },
      configVersion: 1 as const,
      config: { prompt: "hello", modelKey: null, parameters: {} },
      selectedOutputImageId: null,
    },
  ],
  edges: [],
};

describe("generationGraphRepository", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.prisma.$transaction.mockImplementation(async (callback) => callback(mocks.tx));
    mocks.tx.generationGraphNode.findMany.mockResolvedValue([]);
    mocks.tx.generationGraphEdge.findMany.mockResolvedValue([]);
    mocks.tx.imageGenerationImage.findMany.mockResolvedValue([]);
    mocks.tx.generationGraph.updateMany.mockResolvedValue({ count: 1 });
    mocks.tx.generationGraphNode.deleteMany.mockResolvedValue({ count: 0 });
    mocks.tx.generationGraphEdge.deleteMany.mockResolvedValue({ count: 0 });
    mocks.tx.generationGraphNode.upsert.mockResolvedValue({});
    mocks.tx.generationGraphEdge.upsert.mockResolvedValue({});
    mocks.tx.generationGraph.findUniqueOrThrow.mockResolvedValue(graphRecord);
  });

  it("rejects a stale version before writing", async () => {
    mocks.tx.generationGraph.findFirst.mockResolvedValue({ version: 2 });

    await expect(
      generationGraphRepository.update("owner@example.com", "graph_1", input),
    ).rejects.toBeInstanceOf(GenerationGraphVersionConflictError);
    expect(mocks.tx.generationGraph.updateMany).not.toHaveBeenCalled();
  });

  it("increments the version and keeps node ids inside one transaction", async () => {
    mocks.tx.generationGraph.findFirst.mockResolvedValue({ version: 1 });

    await expect(
      generationGraphRepository.update("owner@example.com", "graph_1", input),
    ).resolves.toEqual(expect.objectContaining({ id: "graph_1", version: 2 }));

    expect(mocks.prisma.$transaction).toHaveBeenCalledOnce();
    expect(mocks.tx.generationGraph.updateMany).toHaveBeenCalledWith({
      where: { id: "graph_1", ownerEmail: "owner@example.com", version: 1 },
      data: { title: "Graph", version: { increment: 1 } },
    });
    expect(mocks.tx.generationGraphNode.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "node_1" },
        create: expect.objectContaining({ id: "node_1", graphId: "graph_1" }),
      }),
    );
  });

  it("turns a concurrent conditional update miss into a conflict", async () => {
    mocks.tx.generationGraph.findFirst.mockResolvedValue({ version: 1 });
    mocks.tx.generationGraph.updateMany.mockResolvedValue({ count: 0 });

    await expect(
      generationGraphRepository.update("owner@example.com", "graph_1", input),
    ).rejects.toBeInstanceOf(GenerationGraphVersionConflictError);
    expect(mocks.tx.generationGraphNode.upsert).not.toHaveBeenCalled();
  });

  it("rejects a node id already owned by another graph", async () => {
    mocks.tx.generationGraph.findFirst.mockResolvedValue({ version: 1 });
    mocks.tx.generationGraphNode.findMany.mockResolvedValue([{ graphId: "graph_other" }]);

    await expect(
      generationGraphRepository.update("owner@example.com", "graph_1", input),
    ).rejects.toBeInstanceOf(GenerationGraphReferenceError);
  });

  it("rejects a selected output that does not belong to the same owner and node", async () => {
    mocks.tx.generationGraph.findFirst.mockResolvedValue({ version: 1 });
    mocks.tx.imageGenerationImage.findMany.mockResolvedValue([
      {
        id: "image_1",
        generation: { ownerEmail: "other@example.com", graphNodeId: "node_1" },
      },
    ]);

    await expect(
      generationGraphRepository.update("owner@example.com", "graph_1", {
        ...input,
        nodes: [{ ...input.nodes[0], selectedOutputImageId: "image_1" }],
      }),
    ).rejects.toMatchObject({ reason: "GRAPH_OUTPUT_INVALID" });
  });

  it("propagates child write errors from the transaction callback", async () => {
    mocks.tx.generationGraph.findFirst.mockResolvedValue({ version: 1 });
    mocks.tx.generationGraphNode.upsert.mockRejectedValue(new Error("write failed"));

    await expect(
      generationGraphRepository.update("owner@example.com", "graph_1", input),
    ).rejects.toThrow("write failed");
    expect(mocks.tx.generationGraph.findUniqueOrThrow).not.toHaveBeenCalled();
  });

  it("does not reveal a graph owned by another user", async () => {
    mocks.prisma.generationGraph.findFirst.mockResolvedValue(null);
    mocks.prisma.generationGraph.deleteMany.mockResolvedValue({ count: 0 });

    await expect(
      generationGraphRepository.get("owner@example.com", "graph_other"),
    ).rejects.toBeInstanceOf(GenerationGraphNotFoundError);
    await expect(
      generationGraphRepository.remove("owner@example.com", "graph_other"),
    ).rejects.toBeInstanceOf(GenerationGraphNotFoundError);
  });
});
