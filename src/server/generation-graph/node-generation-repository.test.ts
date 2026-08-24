const mocks = vi.hoisted(() => ({
  generationGraphNode: { findFirst: vi.fn() },
  imageGeneration: { findMany: vi.fn() },
}));

vi.mock("@/server/db/prisma", () => ({ prisma: mocks }));

import { NodeGenerationNotFoundError } from "./node-generation-errors";
import { nodeGenerationRepository } from "./node-generation-repository";

describe("nodeGenerationRepository", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.generationGraphNode.findFirst.mockResolvedValue({
      id: "node-1",
      type: "imageGeneration",
      configVersion: 1,
      config: { prompt: "hello", modelKey: "model-a", parameters: {} },
      graph: { version: 4 },
      incomingEdges: [],
    });
    mocks.imageGeneration.findMany.mockResolvedValue([]);
  });

  it("loads a Node only through owner, graph and node scope", async () => {
    await nodeGenerationRepository.getOwnedNode(
      "owner@example.com",
      "graph-1",
      "node-1",
    );

    expect(mocks.generationGraphNode.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: "node-1",
          graphId: "graph-1",
          graph: { ownerEmail: "owner@example.com" },
        },
      }),
    );
    expect(mocks.generationGraphNode.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        select: expect.objectContaining({
          incomingEdges: expect.objectContaining({
            orderBy: [{ createdAt: "asc" }, { id: "asc" }],
            select: expect.objectContaining({
              sourceNode: expect.objectContaining({
                select: expect.objectContaining({
                  selectedOutputImageId: true,
                  selectedOutputImage: expect.any(Object),
                }),
              }),
            }),
          }),
        }),
      }),
    );
  });

  it("does not reveal a missing or foreign Node", async () => {
    mocks.generationGraphNode.findFirst.mockResolvedValue(null);
    await expect(
      nodeGenerationRepository.getOwnedNode(
        "other@example.com",
        "graph-1",
        "node-1",
      ),
    ).rejects.toBeInstanceOf(NodeGenerationNotFoundError);
  });

  it("returns only owner and Node scoped Generations newest-first", async () => {
    await nodeGenerationRepository.list(
      "owner@example.com",
      "graph-1",
      "node-1",
      20,
    );

    expect(mocks.imageGeneration.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { ownerEmail: "owner@example.com", graphNodeId: "node-1" },
        orderBy: { createdAt: "desc" },
        take: 20,
      }),
    );
  });
});
