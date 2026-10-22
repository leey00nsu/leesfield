import { describe, expect, it } from "vitest";
import { temporarilyHiddenEditNodeKinds, unavailableEditNodeKinds } from "@/shared/generation-graph/node-availability";
import { defaultConfigForKind } from "@/shared/generation-graph/node-default-config";

import { copySpaceEditorSelection, prepareSpaceEditorPaste, remapSpaceEditorClipboardConfig } from "./space-editor-clipboard";
import { applySpaceEditorCommand } from "./space-editor-commands";
import type { SpaceEditorIdMaps } from "./space-editor-command-types";
import { createSpaceEditorSession } from "./space-editor-store";
import type { SpaceEditorDocument } from "./space-editor-types";

function fixture(): SpaceEditorDocument {
  return { schemaVersion: 3, title: "Images", nodes: [
    { id: "v1", kind: "input.image", position: { x: 10, y: 20 }, configVersion: 1, config: { assetId: "asset1" }, selectedOutputAssetId: "asset1" },
    { id: "v2", kind: "input.image", position: { x: 10, y: 400 }, configVersion: 1, config: { assetId: "asset2" }, selectedOutputAssetId: "asset2" },
    { id: "producer", kind: "generate.image", position: { x: 500, y: 100 }, configVersion: 1, config: { prompt: "", modelKey: null, parameters: { seed: 0 } }, selectedOutputAssetId: "output" },
    { id: "result", kind: "input.image", position: { x: 1000, y: 100 }, configVersion: 1, config: { assetId: "output", resultSource: { nodeId: "producer", executionId: "execution", portId: "image", index: 0, outputCount: 1, state: "completed" } }, selectedOutputAssetId: "output" },
  ], edges: [
    { id: "e1", sourceNodeId: "v1", sourcePortId: "image", targetNodeId: "producer", targetPortId: "references", sortOrder: 0, hasPause: false },
    { id: "e2", sourceNodeId: "v2", sourcePortId: "image", targetNodeId: "producer", targetPortId: "references", sortOrder: 1 },
    { id: "e3", sourceNodeId: "producer", sourcePortId: "image", targetNodeId: "result", targetPortId: "reference", sortOrder: 0, hasPause: true },
  ], groups: [
    { id: "g", title: "Inputs", color: "green", locked: true, memberNodeIds: ["v1", "v2"], bounds: { x: -10, y: 0, width: 340, height: 700 } },
  ] };
}
const allocator = () => { let index = 0; return () => `fresh${++index}`; };

describe("canonical local clipboard", () => {
  it.each(temporarilyHiddenEditNodeKinds)("allows copying a completed %s result Input independently of its hidden producer", kind => {
    const mediaType = kind === "edit.image.resize" ? "image" : "video";
    const saved = fixture();
    const producer = { ...saved.nodes[2], kind, config: defaultConfigForKind(kind) };
    const resultSource = { nodeId: producer.id, executionId: "accepted-run", portId: mediaType, index: 0, state: "completed" };
    const result = { ...saved.nodes[3], kind: `input.${mediaType}`, config: { assetId: "output", resultSource } };
    const document: SpaceEditorDocument = { ...saved, nodes: [producer, result], edges: [
      { ...saved.edges[2], sourcePortId: mediaType, targetPortId: mediaType === "image" ? "reference" : mediaType },
    ], groups: [] };
    const before = structuredClone(document);
    const copied = prepareSpaceEditorPaste(copySpaceEditorSelection(document, [result.id]), { createId: allocator() });
    expect(copied.fragment.nodes).toEqual([{ ...result, id: "fresh1", position: { x: 1050, y: 150 } }]);
    expect(copied.fragment.edges).toEqual([]);
    expect(copied.fragment.nodes[0].config).toEqual({ assetId: "output", resultSource });
    expect(document).toEqual(before);
  });

  it("keeps the retained Stitch remapper available without admitting the node to clipboard authoring", () => {
    const ids: SpaceEditorIdMaps = { nodes: new Map(), edges: new Map([["e1", "fresh5"], ["e2", "fresh6"]]), groups: new Map() };
    const config = { parameters: { clipOrder: ["e2", "e1"], repeat: 2, stripAudio: false } };
    expect(remapSpaceEditorClipboardConfig("edit.video.stitch", config, ids)).toEqual({ parameters: { clipOrder: ["fresh6", "fresh5"], repeat: 2, stripAudio: false } });
    expect(remapSpaceEditorClipboardConfig("edit.video.stitch", config, { ...ids, edges: new Map([["e1", "fresh4"]]) }))
      .toEqual({ parameters: { clipOrder: ["fresh4"], repeat: 2, stripAudio: false } });
    expect(config.parameters.clipOrder).toEqual(["e2", "e1"]);
  });

  it("keeps collection exclusions only on copied Gallery edges and leaves asset IDs and clipboard unchanged", () => {
    const document = fixture();
    const config = { mediaType: "image", excludedAssetIds: ["e1"], legacyExcludedEdgeIds: ["gallery-edge", "not-copied"], excludedOccurrences: [
      { edgeId: "gallery-edge", assetId: "gallery-edge", occurrence: 1 }, { edgeId: "not-copied", assetId: "other", occurrence: 0 },
    ] };
    document.nodes.push({ ...document.nodes[0], id: "gallery", kind: "output.gallery", config });
    document.edges.push({ id: "gallery-edge", sourceNodeId: "v1", sourcePortId: "image", targetNodeId: "gallery", targetPortId: "reference", sortOrder: 0 });
    const clipboard = copySpaceEditorSelection(document, ["v1", "gallery"]), before = structuredClone(clipboard);
    const copied = prepareSpaceEditorPaste(clipboard, { createId: allocator() });
    expect(copied.fragment.nodes[1].config).toEqual({ ...config, legacyExcludedEdgeIds: [copied.idMaps.edges.get("gallery-edge")], excludedOccurrences: [{ edgeId: copied.idMaps.edges.get("gallery-edge"), assetId: "gallery-edge", occurrence: 1 }] });
    expect(clipboard).toEqual(before);
    const partial = prepareSpaceEditorPaste(copySpaceEditorSelection(document, ["gallery"]), { createId: allocator() });
    expect(partial.fragment.nodes[0].config).toMatchObject({ excludedOccurrences: [], legacyExcludedEdgeIds: [] });
  });
  it("copies selected nodes, internal edges and intersecting groups with restricted members", () => {
    const document = fixture();
    const clipboard = copySpaceEditorSelection(document, ["v1", "producer", "result"]);
    expect(clipboard.nodes.map((node) => node.id)).toEqual(["v1", "producer", "result"]);
    expect(clipboard.edges.map((edge) => edge.id)).toEqual(["e1", "e3"]);
    expect(clipboard.groups[0].memberNodeIds).toEqual(["v1"]);
    expect(clipboard.groups[0].bounds).toEqual(document.groups[0].bounds);
    expect(clipboard.groups[0].bounds).not.toBe(document.groups[0].bounds);
    document.nodes[0].config = { assetId: "later" };
    expect(clipboard.nodes[0].config).toEqual({ assetId: "asset1" });
  });

  it("allocates every ID before remapping result provenance and group ownership", () => {
    const clipboard = copySpaceEditorSelection(fixture(), ["v1", "v2", "producer", "result"]);
    const { fragment, idMaps } = prepareSpaceEditorPaste(clipboard, { createId: allocator(), offset: { x: 50, y: 75 } });
    expect(fragment.nodes.map((node) => node.id)).toEqual(["fresh1", "fresh2", "fresh3", "fresh4"]);
    expect(fragment.edges.map((edge) => edge.id)).toEqual(["fresh5", "fresh6", "fresh7"]);
    expect(fragment.groups[0]).toEqual({ id: "fresh8", title: "Inputs", color: "green", locked: true, memberNodeIds: ["fresh1", "fresh2"], bounds: { x: 40, y: 75, width: 340, height: 700 } });
    expect(fragment.nodes[2].config).toEqual({ prompt: "", modelKey: null, parameters: { seed: 0 } });
    expect(fragment.nodes[3].config).toEqual({ assetId: "output", resultSource: { nodeId: "fresh3", executionId: "execution", portId: "image", index: 0, outputCount: 1, state: "completed" } });
    expect(fragment.nodes[0]).toMatchObject({ position: { x: 60, y: 95 }, config: { assetId: "asset1" }, selectedOutputAssetId: "asset1" });
    expect(fragment.edges.map((edge) => [edge.sortOrder, Object.hasOwn(edge, "hasPause"), edge.hasPause])).toEqual([[0, true, false], [1, false, undefined], [0, true, true]]);
    expect(idMaps.edges.get("e2")).toBe("fresh6");
    expect(clipboard.nodes[2].config).toEqual({ prompt: "", modelKey: null, parameters: { seed: 0 } });
  });

  it("drops non-copied edges while local execution/source association survives", () => {
    const clipboard = copySpaceEditorSelection(fixture(), ["v1", "producer", "result"]);
    const { fragment } = prepareSpaceEditorPaste(clipboard, { createId: allocator() });
    expect(fragment.edges.map(edge => edge.id)).toEqual(["fresh4", "fresh5"]);
    expect(fragment.nodes[1].config).toEqual({ prompt: "", modelKey: null, parameters: { seed: 0 } });
    expect(fragment.nodes[2].config).toMatchObject({ resultSource: { nodeId: "fresh2", executionId: "execution" } });
    const onlyResult = prepareSpaceEditorPaste(copySpaceEditorSelection(fixture(), ["result"]), { createId: allocator() });
    expect(onlyResult.fragment.nodes[0].config).toMatchObject({ resultSource: { nodeId: "producer", executionId: "execution" } });
  });

  it("allocates Gallery slot identities separately while keeping frozen assets and execution provenance", () => {
    const document = fixture();
    const resultItems = [
      { id: "slot-1", nodeId: "producer", executionId: "execution", portId: "image", index: 0, outputCount: 2,
        mediaType: "image", assetId: "producer", state: "completed" },
      { id: "slot-2", nodeId: "outside", executionId: "pending-execution", portId: "image", index: 1, outputCount: 2,
        mediaType: "image", assetId: null, state: "pending" },
    ];
    const config = { mediaType: "image", excludedAssetIds: ["producer"], resultItems };
    document.nodes.push({ ...document.nodes[3], id: "gallery", kind: "output.gallery", config, selectedOutputAssetId: null });
    const clipboard = copySpaceEditorSelection(document, ["producer", "gallery"]);
    const before = structuredClone(clipboard);
    const createId = allocator();
    const first = prepareSpaceEditorPaste(clipboard, { createId });
    expect(first.fragment.nodes[1].config).toEqual({ ...config, resultItems: [
      { ...resultItems[0], id: "fresh3", nodeId: "fresh1" },
      { ...resultItems[1], id: "fresh4" },
    ] });
    expect(first.idMaps.nodes.has("slot-1")).toBe(false);
    const second = prepareSpaceEditorPaste(clipboard, { createId });
    expect(second.fragment.nodes[1].config).toEqual({ ...config, resultItems: [
      { ...resultItems[0], id: "fresh7", nodeId: "fresh5" },
      { ...resultItems[1], id: "fresh8" },
    ] });
    expect(clipboard).toEqual(before);
    expect(document.nodes.at(-1)?.config).toEqual(config);
  });

  it.each([
    { label: "a copied producer", executionId: "accepted-run", remapProducer: true },
    { label: "an unaccepted reservation", executionId: null, remapProducer: false },
  ])("cancels a copied pending Gallery slot with $label instead of leaving it waiting forever", ({ executionId, remapProducer }) => {
    const item = { id: "original-slot", nodeId: "producer", executionId, portId: "image", index: 0,
      mediaType: "image", assetId: null, state: "pending" };
    const config = { mediaType: "image", resultItems: [item] };
    const ids: SpaceEditorIdMaps = { nodes: new Map(remapProducer ? [["producer", "copied-producer"]] : []), edges: new Map(), groups: new Map() };
    expect(remapSpaceEditorClipboardConfig("output.gallery", config, ids, () => "copied-slot")).toEqual({
      ...config, resultItems: [{ ...item, id: "copied-slot", nodeId: remapProducer ? "copied-producer" : "producer", executionId: null, state: "cancelled" }],
    });
    expect(config.resultItems[0]).toEqual(item);
    expect(item.state).toBe("pending");
  });

  it("creates UUID slot IDs for direct Gallery clipboard remaps and retains an uncopied source", () => {
    const item = { id: "slot", nodeId: "outside", executionId: "run", portId: "audio", index: 0,
      mediaType: "audio", assetId: "outside", state: "completed" };
    const config = { mediaType: "audio", resultItems: [item] };
    const ids: SpaceEditorIdMaps = { nodes: new Map(), edges: new Map(), groups: new Map() };
    const copied = remapSpaceEditorClipboardConfig("output.gallery", config, ids);
    expect(copied).toEqual({ ...config, resultItems: [{ ...item, id: expect.stringMatching(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i) }] });
    expect(copied).not.toEqual(config);
    expect(config).toEqual({ mediaType: "audio", resultItems: [item] });
  });

  it("explicitly remaps retained Split/GIF metadata without touching template-local IDs or asset strings", () => {
    const idMaps: SpaceEditorIdMaps = { nodes: new Map([["split", "newsplit"], ["base", "newbase"]]), edges: new Map([["edge", "newedge"]]), groups: new Map([["group", "newgroup"]]) };
    expect(remapSpaceEditorClipboardConfig("edit.image.gif", { parameters: { clipOrder: ["edge", "external"], fps: 8 } }, idMaps)).toEqual({ parameters: { clipOrder: ["newedge"], fps: 8 } });
    const split = remapSpaceEditorClipboardConfig("edit.image.splitGrid", {
      parameters: {}, template: { baseNodeId: "base", nodes: [{ id: "base" }], edges: [{ id: "edge" }] },
      materialization: { rows: 1, cols: 2, cells: [
        { baseNodeId: "base", nodeIds: ["base", "notcopied"], groupId: "group" },
        { baseNodeId: "notcopied", nodeIds: ["notcopied"], groupId: "outside" },
      ] },
    }, idMaps);
    expect(split).toEqual({ parameters: {}, template: { baseNodeId: "base", nodes: [{ id: "base" }], edges: [{ id: "edge" }] }, materialization: { rows: 1, cols: 2, cells: [{ baseNodeId: "newbase", nodeIds: ["newbase"], groupId: "newgroup" }] } });
    expect(remapSpaceEditorClipboardConfig("input.image", { assetId: "base", templateSource: { nodeId: "split", localNodeId: "base", index: 0 }, splitSource: { nodeId: "split", index: 0 } }, idMaps)).toEqual({ assetId: "base", templateSource: { nodeId: "newsplit", localNodeId: "base", index: 0 }, splitSource: { nodeId: "newsplit", index: 0 } });
    expect(remapSpaceEditorClipboardConfig("input.image", { assetId: "asset", templateSource: { nodeId: "absent", localNodeId: "local", index: 0 }, splitSource: { nodeId: "absent", index: 0 } }, idMaps)).toEqual({ assetId: "asset" });
  });

  it.each(unavailableEditNodeKinds)("rejects %s node copy and externally supplied clipboard paste", kind => {
    const document = fixture();
    const retired = { ...document.nodes[0], kind, config: defaultConfigForKind(kind) };
    document.nodes = [retired];
    document.edges = [];
    document.groups = [];
    expect(() => copySpaceEditorSelection(document, [retired.id])).toThrow("RETIRED_NODE");
    expect(() => prepareSpaceEditorPaste({ version: 1, nodes: [retired], edges: [], groups: [] })).toThrow("RETIRED_NODE");
  });

  it("publishes one atomic duplicate selection and undoes nodes, edges and groups together", () => {
    const original = fixture();
    const editor = createSpaceEditorSession({ id: "space", version: 1, document: original }, { createId: allocator() });
    const result = editor.dispatch({ type: "nodes.duplicate", nodeIds: ["v1", "v2", "producer", "result"], offset: { x: 100, y: 100 } });
    expect(result).toMatchObject({ ok: true, changed: true, selectedNodeIds: ["fresh1", "fresh2", "fresh3", "fresh4"] });
    expect(editor.getSnapshot().selectedNodeIds).toEqual(["fresh1", "fresh2", "fresh3", "fresh4"]);
    expect(editor.getSnapshot().history.undo).toHaveLength(1);
    expect(editor.getDocument().nodes).toHaveLength(8);
    editor.undo();
    expect(editor.getDocument()).toEqual(original);
    editor.redo();
    expect(editor.getDocument().nodes).toHaveLength(8);
    expect(editor.getDocument().edges).toHaveLength(6);
    expect(editor.getDocument().groups).toHaveLength(2);
  });

  it("rejects the full pasted edge count before any nodes/groups/selection can be published", () => {
    const node = { id: "source", kind: "input.image", configVersion: 1, position: { x: 0, y: 0 }, config: { assetId: null }, selectedOutputAssetId: null };
    const gallery = { ...node, id: "gallery", kind: "output.gallery", config: { mediaType: "image" } };
    const document: SpaceEditorDocument = { schemaVersion: 3, title: "Full", nodes: [node, gallery], groups: [], edges: Array.from({ length: 2000 }, (_, index) => ({ id: `e${index}`, sourceNodeId: "source", sourcePortId: "image", targetNodeId: "gallery", targetPortId: "image", sortOrder: index })) };
    const clipboard = { version: 1 as const, nodes: [node, gallery], groups: [], edges: [document.edges[0]] };
    expect(applySpaceEditorCommand(document, { type: "clipboard.paste", clipboard }, { createId: allocator() })).toMatchObject({ ok: false, code: "EDGE_LIMIT" });
    expect(document.nodes).toHaveLength(2);
    expect(document.edges).toHaveLength(2000);
  });
});
