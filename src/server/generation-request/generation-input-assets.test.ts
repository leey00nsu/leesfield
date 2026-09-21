import { describe, expect, it, vi } from "vitest";

const mockCreateMany = vi.hoisted(() => vi.fn());

vi.mock("@/server/db/prisma", () => ({
  prisma: { generationInputAsset: { createMany: mockCreateMany } },
}));

import {
  inputAssetRefsFromSnapshot,
  linkGenerationInputAssets,
  normalizeGenerationInputAssetRefs,
  refsForSnapshot,
} from "./generation-input-assets";

describe("generation input asset references", () => {
  it("reads both generic fields and legacy Graph ports", () => {
    expect(inputAssetRefsFromSnapshot("image", {
      inputAssets: [
        { assetId: "asset-a", field: "initImages", sortOrder: 1, multiple: true },
        { assetId: "asset-b", portId: "primary", sortOrder: 0 },
      ],
    })).toEqual([
      { assetId: "asset-a", field: "initImages", sortOrder: 1, multiple: true, generationType: "image" },
      { assetId: "asset-b", field: "primary", sortOrder: 0, multiple: false, generationType: "image" },
    ]);
  });

  it("normalizes invalid positions and drops malformed refs", () => {
    const refs = normalizeGenerationInputAssetRefs("audio", [
      { assetId: "asset-a", field: "inputAudio", sortOrder: -1 },
      { assetId: "asset-b", field: "dynamicParams.reference", sortOrder: 2.5 },
      { assetId: "", field: "inputAudio", sortOrder: 0 },
      { assetId: "asset-c", field: "", sortOrder: 0 },
    ]);
    expect(refs).toEqual([
      { assetId: "asset-a", field: "inputAudio", sortOrder: 0, multiple: false, generationType: "audio" },
      { assetId: "asset-b", field: "dynamicParams.reference", sortOrder: 0, multiple: false, generationType: "audio" },
    ]);
    expect(refsForSnapshot(refs)).toEqual([
      { assetId: "asset-a", field: "inputAudio", sortOrder: 0 },
      { assetId: "asset-b", field: "dynamicParams.reference", sortOrder: 0 },
    ]);
  });

  it("links refs through the supplied transaction client with duplicate-safe insertion", async () => {
    const client = { generationInputAsset: { createMany: mockCreateMany } };
    mockCreateMany.mockResolvedValue({ count: 2 });
    await linkGenerationInputAssets(client, {
      requestId: "request-1",
      generationType: "video",
      ownerEmail: "owner@example.com",
      refs: [{ assetId: "asset-a", field: "initImage", sortOrder: 0 }],
    });
    expect(mockCreateMany).toHaveBeenCalledWith({
      data: [{
        requestId: "request-1",
        generationType: "video",
        ownerEmail: "owner@example.com",
        field: "initImage",
        sortOrder: 0,
        multiple: false,
        assetId: "asset-a",
      }],
      skipDuplicates: true,
    });
  });
});
