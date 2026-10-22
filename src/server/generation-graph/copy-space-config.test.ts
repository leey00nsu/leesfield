import { describe, expect, it } from "vitest";
import { copySpaceConfig } from "./copy-space-config";
import type { CanonicalNode } from "@/shared/generation-graph/canonical-graph";

const node = (kind: string, config: CanonicalNode["config"]): CanonicalNode => ({
  id: "source", kind, config, configVersion: 1, position: { x: 0, y: 0 }, selectedOutputAssetId: null,
});
describe("Space copy ownership", () => {
  it("remaps Gallery occurrence edges while preserving asset identities and legacy exclusions", () => {
    const source = node("output.gallery", { mediaType: null, excludedAssetIds: ["edge"], legacyExcludedEdgeIds: ["edge", "missing"], excludedOccurrences: [
      { edgeId: "edge", assetId: "edge", occurrence: 1 }, { edgeId: "missing", assetId: "other", occurrence: 0 },
    ] });
    const before = structuredClone(source);
    expect(copySpaceConfig(source, new Map(), () => "new-id", new Map([["edge", "copied-edge"]])))
      .toEqual({ mediaType: null, excludedAssetIds: ["edge"], legacyExcludedEdgeIds: ["copied-edge"], excludedOccurrences: [{ edgeId: "copied-edge", assetId: "edge", occurrence: 1 }] });
    expect(copySpaceConfig(source, new Map(), () => "new-id")).toMatchObject({ excludedOccurrences: [], legacyExcludedEdgeIds: [] });
    expect(source).toEqual(before);
  });
  it.each(["image", "audio", "video"])("copies a fixed %s result without referencing old execution history", type => {
    const source = node(`input.${type}`, {assetId:"asset",resultSource:{nodeId:"producer",executionId:"old-run",portId:type,index:0,state:"completed"}});
    expect(copySpaceConfig(source,new Map([["producer","new-producer"]]),()=>"id")).toMatchObject({assetId:"asset",resultSource:{nodeId:"new-producer",executionId:null,state:"completed"}});
    expect(source.config).toMatchObject({resultSource:{executionId:"old-run"}});
  });
  it("copies ordered Gallery snapshots with fresh slot IDs and no old execution references", () => {
    const slot = { nodeId: "producer", executionId: "old-run", portId: "image", index: 0, outputCount: 4, mediaType: "image" };
    const source = node("output.gallery", { mediaType: "image", excludedAssetIds: ["producer"], resultItems: [
      { ...slot, id: "slot-pending", assetId: null, state: "pending" },
      { ...slot, id: "slot-completed", index: 1, assetId: "producer", state: "completed" },
      { ...slot, id: "slot-failed", index: 2, assetId: "retained-asset", state: "failed" },
      { ...slot, id: "slot-cancelled", nodeId: "missing-producer", index: 3, assetId: null, state: "cancelled" },
    ] });
    const before = structuredClone(source);
    let next = 0;
    const copied = copySpaceConfig(source, new Map([["source", "copied-gallery"], ["producer", "copied-producer"]]), () => `new-slot-${++next}`);
    expect(copied).toEqual({ mediaType: "image", excludedAssetIds: ["producer"], resultItems: [
      { ...slot, id: "new-slot-1", nodeId: "copied-producer", executionId: null, assetId: null, state: "cancelled" },
      { ...slot, id: "new-slot-2", nodeId: "copied-producer", executionId: null, index: 1, assetId: "producer", state: "completed" },
      { ...slot, id: "new-slot-3", nodeId: "copied-producer", executionId: null, index: 2, assetId: "retained-asset", state: "completed" },
      { ...slot, id: "new-slot-4", nodeId: "copied-gallery", executionId: null, index: 3, assetId: null, state: "cancelled" },
    ] });
    expect(source).toEqual(before);
  });
  it("uses the original Gallery fallback when no source or destination node was mapped", () => {
    const item = { id: "slot", nodeId: "outside", executionId: "run", portId: "audio", index: 0,
      mediaType: "audio", assetId: null, state: "failed" };
    const source = node("output.gallery", { mediaType: "audio", resultItems: [item] });
    expect(copySpaceConfig(source, new Map(), () => "new-slot"))
      .toEqual({ mediaType: "audio", resultItems: [{ ...item, id: "new-slot", nodeId: "source", executionId: null, state: "cancelled" }] });
    expect(source.config).toEqual({ mediaType: "audio", resultItems: [item] });
  });
  it("preserves absent and explicitly empty Gallery snapshots during full-space copy", () => {
    const newId = () => { throw new Error("A manual or empty Gallery has no slots to allocate"); };
    const configs: CanonicalNode["config"][] = [{ mediaType: null }, { mediaType: null, resultItems: [] }];
    for (const config of configs) {
      expect(copySpaceConfig(node("output.gallery", config), new Map(), newId)).toEqual(config);
    }
  });
  it("copies preset work metadata and final prompt independently of later source edits", () => {
    const config = { prompt: "편집한 문구", modelKey: "image-model", parameters: { imageCount: 1 },
      promptPreset: { key: "multi-camera-nine-grid", revision: 3, requiredInputs: { referenceImageCount: 1 }, recommendedParameters: { imageCount: 1 } },
      promptPresetState: { name: "멀티 카메라 9 그리드", appliedPrompt: "적용했던 저장본" }, presentation: { customTitle: "시트" } };
    const copy = copySpaceConfig(node("generate.image", config), new Map(), () => "new-id");
    expect(copy).toEqual(config);
    config.prompt = "나중 변경"; config.promptPreset.revision = 4;
    expect(copy).toMatchObject({ prompt: "편집한 문구", promptPreset: { revision: 3 } });
  });
  it.each(["edit.image.gif", "edit.video.stitch"])("preserves reordered %s inputs with copied edge IDs", (kind) => {
    const source = node(kind, { parameters: { clipOrder: ["edge-b", "edge-a"], repeat: 2 } });
    const before = structuredClone(source);
    expect(copySpaceConfig(source, new Map(), () => "id", new Map([["edge-a", "new-a"], ["edge-b", "new-b"]])))
      .toEqual({ parameters: { clipOrder: ["new-b", "new-a"], repeat: 2 } });
    expect(source).toEqual(before);
  });
  it("remaps split membership without changing assets or source config", () => {
    const source = node("edit.image.splitGrid", { materialization: { rows: 1, cols: 1, cells: [{
      baseNodeId: "image", nodeIds: ["image"], group: { id: "group", name: "Cell", position: { x: 20, y: 30 } },
    }] } });
    const before = structuredClone(source);
    const copy = copySpaceConfig(source, new Map([["image", "new-image"]]), () => "new-group");
    expect(copy).toMatchObject({ materialization: { cells: [{ baseNodeId: "new-image", nodeIds: ["new-image"], group: { id: "new-group", name: "Cell", position: { x: 20, y: 30 } } }] } });
    expect(source).toEqual(before);
    expect(copySpaceConfig(node("input.image", { assetId: "asset", splitSource: { nodeId: "split", index: 0 } }), new Map([["split", "new-split"]]), () => "id"))
      .toEqual({ assetId: "asset", splitSource: { nodeId: "new-split", index: 0 } });
  });
  it("does not leave external Split references in a partial copy", () => {
    expect(copySpaceConfig(node("input.image", { assetId: "asset", splitSource: { nodeId: "absent", index: 0 } }), new Map(), () => "id"))
      .toEqual({ assetId: "asset" });
  });

  it("uses the shared v3 group ID map without recreating embedded ownership", () => {
    const source = node("edit.image.splitGrid", { materialization: { rows: 1, cols: 2, cells: [
      { baseNodeId: "image", nodeIds: ["image", "uncopied"], groupId: "group" },
      { baseNodeId: "uncopied", nodeIds: ["uncopied"], groupId: "uncopied-group" },
    ] } });
    const before = structuredClone(source);
    const ids = new Map([["image", "copied-image"]]);
    const newId = () => { throw new Error("Group IDs must come from the shared copy map"); };
    expect(copySpaceConfig(source, ids, newId, new Map(), new Map([["group", "copied-group"]])))
      .toEqual({ materialization: { rows: 1, cols: 2, cells: [
        { baseNodeId: "copied-image", nodeIds: ["copied-image"], groupId: "copied-group" },
      ] } });
    expect(copySpaceConfig(source, ids, newId))
      .toEqual({ materialization: { rows: 1, cols: 2, cells: [
        { baseNodeId: "copied-image", nodeIds: ["copied-image"], groupId: null },
      ] } });
    expect(source).toEqual(before);
  });
});
