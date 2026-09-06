const mocks = vi.hoisted(() => {
  const tx = {
    imageGeneration: { updateMany: vi.fn(), findUnique: vi.fn() },
    videoGeneration: { updateMany: vi.fn(), findUnique: vi.fn() },
    audioGeneration: { updateMany: vi.fn(), findUnique: vi.fn() },
    imageGenerationImage: { deleteMany: vi.fn(), create: vi.fn() },
    videoGenerationVideo: { deleteMany: vi.fn(), create: vi.fn() },
    audioGenerationAudio: { deleteMany: vi.fn(), create: vi.fn() },
    mediaAsset: { create: vi.fn(), findMany: vi.fn() },
    generationGraphNodeOutput: { deleteMany: vi.fn(), createMany: vi.fn() },
    generationGraphNode: { updateMany: vi.fn() },
  };
  return {
    tx,
    generationGraphNode: { findFirst: vi.fn() },
    mediaAsset: tx.mediaAsset,
    imageGeneration: { findMany: vi.fn(), findFirst: vi.fn(), updateMany: vi.fn(), findUnique: vi.fn() },
    videoGeneration: { findMany: vi.fn(), findFirst: vi.fn(), updateMany: vi.fn(), findUnique: vi.fn() },
    audioGeneration: { findMany: vi.fn(), findFirst: vi.fn(), updateMany: vi.fn(), findUnique: vi.fn() },
    transaction: vi.fn(async (callback: (client: typeof tx) => unknown) => callback(tx)),
  };
});

vi.mock("@/server/db/prisma", () => ({
  prisma: {
    generationGraphNode: mocks.generationGraphNode,
    mediaAsset: mocks.mediaAsset,
    imageGeneration: mocks.imageGeneration,
    videoGeneration: mocks.videoGeneration,
    audioGeneration: mocks.audioGeneration,
    $transaction: mocks.transaction,
  },
}));

import { nodeExecutionRepository } from "./node-execution-repository";

describe("nodeExecutionRepository", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.generationGraphNode.findFirst.mockResolvedValue({
      id: "node-1",
      kind: "generate.image",
      configVersion: 1,
      config: {},
      graph: { version: 2, schemaVersion: 2 },
      incomingEdges: [],
    });
  });

  it("loads execution targets through owner and Graph scope", async () => {
    await nodeExecutionRepository.getOwnedNode("owner@example.com", "graph-1", "node-1");
    expect(mocks.generationGraphNode.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "node-1", graphId: "graph-1", graph: { ownerEmail: "owner@example.com" } },
    }));
  });

  it("finds an exact execution through owner and Node scope", async () => {
    mocks.imageGeneration.findFirst.mockResolvedValue({
      requestId: "request-101",
      status: "completed",
      progress: 100,
      errorMessage: null,
      modelKey: "model-a",
      createdAt: new Date("2026-09-03T10:00:00.000Z"),
      images: [{ assetId: "asset-1", url: "https://cdn.example.com/1.webp", width: 512, height: 512 }],
    });

    await expect(
      nodeExecutionRepository.findExecution("owner@example.com", "graph-1", "node-1", "request-101"),
    ).resolves.toEqual(expect.objectContaining({ executionId: "request-101", mediaType: "image" }));
    expect(mocks.imageGeneration.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { requestId: "request-101", ownerEmail: "owner@example.com", graphNodeId: "node-1" },
    }));
  });

  it("cancels a pending execution with a status compare-and-swap", async () => {
    mocks.imageGeneration.findFirst
      .mockResolvedValueOnce({
        requestId: "request-pending",
        status: "pending",
        progress: 0,
        errorMessage: null,
        modelKey: "model-a",
        createdAt: new Date(),
        images: [],
      })
      .mockResolvedValueOnce({
        requestId: "request-pending",
        status: "cancelled",
        progress: 0,
        errorMessage: null,
        modelKey: "model-a",
        createdAt: new Date(),
        images: [],
      });
    mocks.imageGeneration.updateMany.mockResolvedValue({ count: 1 });

    await expect(
      nodeExecutionRepository.cancelExecution("owner@example.com", "graph-1", "node-1", "request-pending"),
    ).resolves.toEqual(expect.objectContaining({ status: "cancelled" }));
    expect(mocks.imageGeneration.updateMany).toHaveBeenCalledTimes(1);
    expect(mocks.imageGeneration.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ status: "pending" }),
      data: expect.objectContaining({ status: "cancelled", cancelRequestedAt: expect.any(Date) }),
    }));
  });

  it("requests cancellation without overwriting a pending-to-processing race", async () => {
    mocks.imageGeneration.findFirst
      .mockResolvedValueOnce({
        requestId: "request-racing",
        status: "pending",
        progress: 0,
        errorMessage: null,
        modelKey: "model-a",
        createdAt: new Date(),
        images: [],
      })
      .mockResolvedValueOnce({
        requestId: "request-racing",
        status: "processing",
        progress: 92,
        errorMessage: null,
        modelKey: "model-a",
        createdAt: new Date(),
        images: [],
      });
    mocks.imageGeneration.updateMany
      .mockResolvedValueOnce({ count: 0 })
      .mockResolvedValueOnce({ count: 1 });

    await expect(
      nodeExecutionRepository.cancelExecution("owner@example.com", "graph-1", "node-1", "request-racing"),
    ).resolves.toEqual(expect.objectContaining({ status: "processing" }));
    expect(mocks.imageGeneration.updateMany).toHaveBeenNthCalledWith(2, expect.objectContaining({
      where: expect.objectContaining({ status: { in: ["processing", "uploading"] } }),
      data: { cancelRequestedAt: expect.any(Date) },
    }));
  });

  it("commits generation, MediaAsset and current NodeOutput in one transaction", async () => {
    mocks.tx.imageGeneration.updateMany.mockResolvedValue({ count: 1 });
    mocks.tx.imageGeneration.findUnique.mockResolvedValue({
      ownerEmail: "owner@example.com",
      graphNodeId: "node-1",
    });
    mocks.tx.mediaAsset.create.mockResolvedValue({ id: "asset-1" });

    const result = await nodeExecutionRepository.completeGeneration("image", "generation-1", [{
      type: "image",
      storageProvider: "leemage",
      storageObjectId: "file-1",
      storageUrl: "https://cdn.example.com/image.webp",
      mimeType: "image/webp",
      bytes: 128,
      width: 512,
      height: 512,
      durationMs: null,
    }]);

    expect(result).toEqual({ status: "completed", assetIds: ["asset-1"] });
    expect(mocks.tx.mediaAsset.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        ownerEmail: "owner@example.com",
        origin: "generation",
        storageObjectId: "file-1",
      }),
    }));
    expect(mocks.tx.imageGenerationImage.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ assetId: "asset-1", generationId: "generation-1" }),
    }));
    expect(mocks.tx.generationGraphNodeOutput.createMany).toHaveBeenCalledWith({
      data: [{ graphNodeId: "node-1", portId: "image", sortOrder: 0, assetId: "asset-1" }],
    });
    expect(mocks.tx.generationGraphNode.updateMany).toHaveBeenCalledWith({
      where: { id: "node-1" },
      data: { selectedOutputAssetId: "asset-1" },
    });
  });

  it("rolls a cancellation request to cancelled without publishing assets", async () => {
    mocks.tx.videoGeneration.updateMany
      .mockResolvedValueOnce({ count: 0 })
      .mockResolvedValueOnce({ count: 1 });

    await expect(nodeExecutionRepository.completeGeneration("video", "generation-1", [{
      type: "video",
      storageProvider: "leemage",
      storageObjectId: "file-1",
      storageUrl: "https://cdn.example.com/video.mp4",
      mimeType: "video/mp4",
      bytes: 512,
      width: 1280,
      height: 720,
      durationMs: 3_000,
    }])).resolves.toEqual({ status: "cancelled", assetIds: [] });
    expect(mocks.tx.mediaAsset.create).not.toHaveBeenCalled();
    expect(mocks.tx.generationGraphNodeOutput.createMany).not.toHaveBeenCalled();
  });
});
