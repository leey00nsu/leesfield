import { describe, expect, it } from "vitest";
import { copySpaceConfig } from "./copy-space-config";
import type { CanonicalNode } from "@/shared/generation-graph/canonical-graph";

const node = (kind: string, config: CanonicalNode["config"]): CanonicalNode => ({
  id: "source", kind, config, configVersion: 1, position: { x: 0, y: 0 }, selectedOutputAssetId: null,
});
describe("Space copy ownership", () => {
  it.each(["image", "audio", "video"])("copies a fixed %s result without referencing old execution history", type => {
    const source = node(`input.${type}`, {assetId:"asset",resultSource:{nodeId:"producer",executionId:"old-run",portId:type,index:0,state:"completed"}});
    expect(copySpaceConfig(source,new Map([["producer","new-producer"]]),()=>"id")).toMatchObject({assetId:"asset",resultSource:{nodeId:"new-producer",executionId:null,state:"completed"}});
    expect(source.config).toMatchObject({resultSource:{executionId:"old-run"}});
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
