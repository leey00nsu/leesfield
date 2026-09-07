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

  it.each([24, 240, 1000])("traverses %i records without external reads or growing query windows", async (count) => {
    const rows = Array.from({ length: count }, (_, i) => ({
      requestId: "id-" + String(i).padStart(4, "0"), status: "completed", prompt: "fixture", requestParams: {}, graphNodeId: null, graphNode: null, progress: 100, errorMessage: null,
      createdAt: new Date(1700000000000 + Math.floor(i / 4) * 1000), updatedAt: new Date(1700000005000), images: [{ assetId: "asset-" + i, url: "https://old/" + i }],
    }));
    type Row = typeof rows[number];
    const matches = (row: Row, where: Record<string, unknown>): boolean => Object.entries(where).every(([key, value]) => {
      if (key === "AND") return (value as Record<string, unknown>[]).every(w => matches(row, w));
      if (key === "OR") return (value as Record<string, unknown>[]).some(w => matches(row, w));
      if (key === "createdAt" || key === "requestId") {
        const actual = key === "createdAt" ? row.createdAt.getTime() : row.requestId;
        if (value instanceof Date) return actual === value.getTime();
        const condition = value as { lt?: string | Date; gt?: string | Date };
        const bound = condition.lt ?? condition.gt!;
        const scalar = bound instanceof Date ? bound.getTime() : bound;
        return condition.lt !== undefined ? actual < scalar : actual > scalar;
      }
      return true;
    });
    mocks.imageFindMany.mockImplementation(async ({ where, take }) => rows.filter(row => matches(row, where)).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime() || b.requestId.localeCompare(a.requestId)).slice(0, take));
    mocks.imageCount.mockResolvedValue(count);
    const ids: string[] = []; let cursor: string | null = null;
    do {
      const params = new URLSearchParams({ type: "image", limit: "24" }); if (cursor) params.set("cursor", cursor);
      const page = await getHistory(params, "owner"); ids.push(...page.items.map(item => item.id)); cursor = page.nextCursor ?? null;
    } while (cursor && ids.length <= count);
    expect(ids).toEqual(rows.toReversed().map(row => row.requestId));
    expect(mocks.getAsset).not.toHaveBeenCalled();
    expect(mocks.imageFindMany.mock.calls.every(([args]) => args.take === 25)).toBe(true);
  });

  it("applies owner and status consistently to counts and pages", async () => {
    await getHistory(new URLSearchParams("status=failed"), "owner-b");
    for (const mock of [mocks.imageFindMany, mocks.videoFindMany, mocks.audioFindMany, mocks.imageCount, mocks.videoCount, mocks.audioCount]) {
      expect(mock).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ ownerEmail: "owner-b", status: "failed" }) }));
    }
    expect(mocks.operationFindMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ id: { in: [] } }) }));
    expect(mocks.getAsset).not.toHaveBeenCalled();
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
      images: [{ assetId: "asset-generation", url: "https://permanent.example/generation" }],
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
        storageUrl: "https://permanent.example/edit",
        legacyUrl: null,
      }],
    }]);
    mocks.operationCount.mockResolvedValue(1);

    const result = await getHistory(
      new URLSearchParams("type=image&sort=date_desc&limit=24&offset=0"),
      "owner@example.com",
    );

    expect(mocks.getAsset).not.toHaveBeenCalled();
    expect(result.total).toBe(2);
    expect(result.items.map((item) => item.origin)).toEqual(["edit", "generation"]);
    expect(result.items[0]).toMatchObject({
      id: "operation-1",
      assetId: "asset-edit",
      sourceAssetIds: ["source-2"],
      operation: { type: "edit.image.resize", parameters: { width: 320 } },
      resultUrl: "https://permanent.example/edit",
      thumbnailUrl: "https://permanent.example/edit",
    });
    expect(result.items[1]).toMatchObject({
      graphId: "graph-deleted",
      graphNodeId: "node-deleted",
      sourceAssetIds: ["source-1"],
      resultUrl: "https://permanent.example/generation",
      thumbnailUrl: "https://permanent.example/generation",
    });
    expect(mocks.imageFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ ownerEmail: "owner@example.com" }),
    }));
    expect(mocks.operationFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ ownerEmail: "owner@example.com", status: "completed" }),
    }));
  });
});
