import { describe, expect, it } from "vitest";
import {
  historyMetadataFromRequest,
  readHistoryMetadata,
} from "./history-metadata";

describe("history metadata projection", () => {
  it("keeps only small list fields and normalizes source asset IDs", () => {
    expect(historyMetadataFromRequest({
      graphId: "graph-1",
      graphNodeId: "node-1",
      referenceText: "  words  ",
      inputAssets: [
        { assetId: "asset-1" },
        { assetId: "asset-1" },
        { assetId: "" },
        { url: "data:image/png;base64,large" },
      ],
      requestParams: { large: "omitted" },
    })).toEqual({
      graphId: "graph-1",
      graphNodeId: "node-1",
      referenceText: "words",
      sourceAssetIds: ["asset-1"],
    });
  });

  it("reads both projected IDs and legacy-shaped input asset entries", () => {
    expect(readHistoryMetadata({
      sourceAssetIds: ["asset-1", "asset-1"],
      inputAssets: [{ assetId: "asset-2" }],
      graphId: "graph-1",
    })).toEqual({
      graphId: "graph-1",
      sourceAssetIds: ["asset-1", "asset-2"],
    });
  });
});
