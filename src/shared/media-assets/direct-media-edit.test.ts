import { describe, expect, it } from "vitest";
import { directEditSchema, normalizeCrop, validEditGeometry } from "./direct-media-edit";
import { matchesEditReservation, displayedEditAsset, type EditGraph } from "@/server/media-edits/direct-edit-target";

describe("direct editing source and geometry boundaries", () => {
  it("validates integer source rectangles and aligns video output without changing the displayed contract", () => {
    expect(directEditSchema.safeParse({ kind: "image.crop", rect: { x: 0.5, y: 0, width: 10, height: 10 } }).success).toBe(false);
    expect(normalizeCrop({ x: 179, y: 3, width: 121, height: 85 }, 200, 100, true)).toEqual({ x: 80, y: 2, width: 120, height: 84 });
    expect(validEditGeometry({ kind: "video.crop", rect: { x: 0, y: 0, width: 99, height: 50 } }, 200, 100, 4000)).toBe(false);
    expect(validEditGeometry({ kind: "video.trim", startMs: 2000, endMs: 2000 }, 200, 100, 4000)).toBe(false);
    expect(validEditGeometry({ kind: "video.trim", startMs: 500, endMs: 3500 }, 200, 100, 4000)).toBe(true);
  });
  const snapshot = { requestId: "d7c5b319-bb5d-48e1-bf2a-2d22c5764b8d", sourceNodeId: "source", sourceAssetId: "original", sourceVersion: 1,
    resultNodeId: "result", resultEdgeId: "wire", width: 200, height: 100, durationMs: null,
    edit: { kind: "image.crop" as const, rect: { x: 10, y: 5, width: 100, height: 50 } } };
  const graph = (): EditGraph => ({ nodes: [
    { id: "source", kind: "input.image", config: { assetId: "original" }, selectedOutputAssetId: null },
    { id: "result", kind: "input.image", config: { assetId: null, resultSource: { nodeId: "source", executionId: snapshot.requestId,
      portId: "editedImage", index: 0, state: "pending" } }, selectedOutputAssetId: null },
  ], edges: [{ id: "wire", sourceNodeId: "source", sourcePortId: "editedImage", targetNodeId: "result", targetPortId: "reference", sortOrder: 0 }] });
  it("freezes results rather than relaying their provenance wire", () => {
    expect(matchesEditReservation(graph(), snapshot)).toBe(true);
    expect(displayedEditAsset(graph(), "result")).toBe(null);
    const complete = graph(); complete.nodes[1].config = { assetId: "edited", resultSource: { state: "completed" } };
    expect(displayedEditAsset(complete, "result")).toBe("edited");
  });
  it("invalidates replaced sources, removed wires and changed execution bindings", () => {
    const replaced = graph(); replaced.nodes[0].config = { assetId: "replacement" };
    expect(matchesEditReservation(replaced, snapshot)).toBe(false);
    expect(matchesEditReservation({ ...graph(), edges: [] }, snapshot)).toBe(false);
    const rebound = graph(); rebound.nodes[1].config = { assetId: null, resultSource: { nodeId: "source", executionId: "other", portId: "editedImage", state: "pending", index: 0 } };
    expect(matchesEditReservation(rebound, snapshot)).toBe(false);
  });
});
