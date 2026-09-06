import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  imageFindMany: vi.fn(),
  imageCount: vi.fn(),
  videoFindMany: vi.fn(),
  videoCount: vi.fn(),
  audioFindMany: vi.fn(),
  audioCount: vi.fn(),
  operationFindMany: vi.fn(),
  operationCount: vi.fn(),
  getAsset: vi.fn(),
}));

vi.mock("@/server/db/prisma", () => ({
  prisma: {
    imageGeneration: { findMany: mocks.imageFindMany, count: mocks.imageCount },
    videoGeneration: { findMany: mocks.videoFindMany, count: mocks.videoCount },
    audioGeneration: { findMany: mocks.audioFindMany, count: mocks.audioCount },
    mediaOperation: { findMany: mocks.operationFindMany, count: mocks.operationCount },
  },
}));
vi.mock("@/server/media-assets/media-asset-service", () => ({
  mediaAssetService: { get: mocks.getAsset },
}));

import { getHistory } from "./get-history";

describe("getHistory durable provenance", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.imageFindMany.mockResolvedValue([]);
    mocks.imageCount.mockResolvedValue(0);
    mocks.videoFindMany.mockResolvedValue([]);
    mocks.videoCount.mockResolvedValue(0);
    mocks.audioFindMany.mockResolvedValue([]);
    mocks.audioCount.mockResolvedValue(0);
    mocks.operationFindMany.mockResolvedValue([]);
    mocks.operationCount.mockResolvedValue(0);
    mocks.getAsset.mockImplementation(async (_owner: string, id: string) => ({
      id,
      url: `https://fresh.example/${id}`,
    }));
  });

  it("unions completed edits and preserves generation Graph provenance after Graph deletion", async () => {
    mocks.imageFindMany.mockResolvedValue([{
      requestId: "generation-1",
      status: "completed",
      prompt: "portrait",
      requestParams: {
        model: "image-model",
        graphId: "graph-deleted",
        graphNodeId: "node-deleted",
        inputAssets: [{ assetId: "source-1", portId: "primary", sortOrder: 0 }],
      },
      graphNodeId: null,
      graphNode: null,
      progress: 100,
      errorMessage: null,
      createdAt: new Date("2026-09-03T10:00:00.000Z"),
      updatedAt: new Date("2026-09-03T10:00:05.000Z"),
      images: [{ assetId: "asset-generation", url: "https://stale.example/generation" }],
    }]);
    mocks.imageCount.mockResolvedValue(1);
    mocks.operationFindMany.mockResolvedValue([{
      id: "operation-1",
      graphId: null,
      graphNodeId: null,
      type: "edit.image.resize",
      configVersion: 1,
      parameters: { width: 320 },
      progress: 100,
      createdAt: new Date("2026-09-03T11:00:00.000Z"),
      updatedAt: new Date("2026-09-03T11:00:02.000Z"),
      inputs: [{ assetId: "source-2" }],
      outputs: [{
        id: "asset-edit",
        type: "image",
        storageUrl: "https://stale.example/edit",
        legacyUrl: null,
      }],
    }]);
    mocks.operationCount.mockResolvedValue(1);

    const result = await getHistory(
      new URLSearchParams("type=image&sort=date_desc&limit=24&offset=0"),
      "owner@example.com",
    );

    expect(result.total).toBe(2);
    expect(result.items.map((item) => item.origin)).toEqual(["edit", "generation"]);
    expect(result.items[0]).toMatchObject({
      id: "operation-1",
      assetId: "asset-edit",
      sourceAssetIds: ["source-2"],
      operation: { type: "edit.image.resize", parameters: { width: 320 } },
      resultUrl: "https://fresh.example/asset-edit",
    });
    expect(result.items[1]).toMatchObject({
      graphId: "graph-deleted",
      graphNodeId: "node-deleted",
      sourceAssetIds: ["source-1"],
      resultUrl: "https://fresh.example/asset-generation",
    });
    expect(mocks.imageFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ ownerEmail: "owner@example.com" }),
    }));
    expect(mocks.operationFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ ownerEmail: "owner@example.com", status: "completed" }),
    }));
  });
});
