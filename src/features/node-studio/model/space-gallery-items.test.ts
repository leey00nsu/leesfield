import { describe, expect, it } from "vitest";
import type { CanonicalEdge, CanonicalNode } from "@/shared/generation-graph/canonical-graph";
import type { GeneratedResultGalleryItem } from "@/shared/generation-graph/node-registry";
import { galleryClearCommand, galleryEntries, galleryRemoveCommand, isGalleryItem } from "./space-gallery-items";
import { SpaceInputResolver, type SpaceInputRuntime } from "./space-editor-inputs";
import { createSpaceEditorSession } from "./space-editor-store";
import type { SpaceEditorDocument } from "./space-editor-types";

function node(id: string, kind: string, config: CanonicalNode["config"]): CanonicalNode {
  return { id, kind, configVersion: 1, config, position: { x: 0, y: 0 }, selectedOutputAssetId: null };
}
function edge(id: string, sourceNodeId: string, sourcePortId = "image", sortOrder = 0): CanonicalEdge {
  return { id, sourceNodeId, sourcePortId, targetNodeId: "gallery", targetPortId: "image", sortOrder };
}
function setup(nodes: CanonicalNode[], edges: CanonicalEdge[], runtime: SpaceInputRuntime = {}) {
  const document: SpaceEditorDocument = { schemaVersion: 3, title: "Gallery identity", nodes, edges, groups: [] };
  const session = createSpaceEditorSession({ id: "space", version: 1, document });
  const current = () => {
    const gallery = session.getDocument().nodes.find(node => node.id === "gallery")!;
    const inputs = new SpaceInputResolver(session.getDocument(), runtime);
    return { gallery, inputs, items: galleryEntries(inputs, "gallery", gallery.config).filter(isGalleryItem) };
  };
  const remove = (index: number) => {
    const { gallery, inputs, items } = current(), command = galleryRemoveCommand(inputs, gallery, items[index]);
    expect(command).not.toBeNull();
    expect(session.dispatch(command!).ok).toBe(true);
  };
  return { session, current, remove, document };
}

describe("Gallery occurrence edits", () => {
  it("recovers a new connection from four legacy-hidden duplicates without reviving old edges or frozen slots", () => {
    const sources = Array.from({ length: 5 }, (_, i) => node(`input-${i}`, "input.image", { assetId: "same" }));
    const slot = { id: "old-slot", nodeId: "producer", executionId: "old", portId: "image", index: 0,
      state: "completed", mediaType: "image", assetId: "same" };
    const view = setup([node("gallery", "output.gallery", { mediaType: null, excludedAssetIds: ["same"], resultItems: [slot] }), ...sources],
      sources.slice(0, 4).map((source, i) => edge(`edge-${i}`, source.id, "image", i)));
    expect(view.current().items).toEqual([]);
    expect(view.current().gallery.config).toEqual(view.document.nodes[0].config);
    expect(view.session.dispatch({ type: "edge.connect", edge: edge("fresh", "input-4", "image", 4) }).ok).toBe(true);
    expect(view.current().items.map(item => item.edgeId)).toEqual(["fresh"]);
    expect(view.current().gallery.config).toMatchObject({ excludedAssetIds: ["same"], legacyExcludedEdgeIds: ["edge-0", "edge-1", "edge-2", "edge-3"], resultItems: [slot] });
    expect(view.session.getSnapshot().history.undo).toHaveLength(1);
    const saved = JSON.parse(JSON.stringify(view.session.getDocument())) as SpaceEditorDocument;
    expect(galleryEntries(new SpaceInputResolver(saved), "gallery", saved.nodes[0].config).filter(isGalleryItem).map(item => item.edgeId)).toEqual(["fresh"]);
    view.session.undo(); expect(view.session.getDocument()).toEqual(view.document); expect(view.current().items).toEqual([]);
    view.session.redo(); expect(view.current().items).toHaveLength(1);
    view.remove(0); expect(view.current().items).toEqual([]);
    expect(view.session.dispatch({ type: "edge.connect", edge: edge("fresh-again", "input-4", "image", 4) }).ok).toBe(true);
    expect(view.current().items.map(item => item.edgeId)).toEqual(["fresh-again"]);
    expect(view.session.getDocument().edges.slice(0, 4)).toEqual(view.document.edges);
  });

  it("releases a replaced legacy wire while leaving all other hidden connections unchanged", () => {
    const sources = [node("a", "input.image", { assetId: "same" }), node("b", "input.image", { assetId: "same" })];
    const view = setup([node("gallery", "output.gallery", { mediaType: null, excludedAssetIds: ["same"] }), ...sources], [edge("first", "a"), edge("second", "b", "image", 1)]);
    expect(view.current().items).toEqual([]);
    expect(view.session.dispatch({ type: "edge.replace", edgeId: "first", edge: edge("first", "a") }).ok).toBe(true);
    expect(view.current().items.map(item => item.edgeId)).toEqual(["first"]);
    expect(view.current().gallery.config).toMatchObject({ legacyExcludedEdgeIds: ["second"] });
    view.session.undo(); expect(view.current().items).toEqual([]);
  });
  it("disconnects only one of four identical inputs, restores it in one undo, and accepts a fresh reconnection", () => {
    const sources = Array.from({ length: 4 }, (_, i) => node(`input-${i}`, "input.image", { assetId: "same" }));
    const view = setup([node("gallery", "output.gallery", { mediaType: null }), ...sources], sources.map((source, i) => edge(`edge-${i}`, source.id, "image", i)));
    const keys = view.current().items.map(item => item.key);
    expect(new Set(keys).size).toBe(4);
    view.remove(1);
    expect(view.current().items.map(item => item.key)).toEqual([keys[0], keys[2], keys[3]]);
    expect(view.session.getDocument().edges.map(edge => edge.id)).toEqual(["edge-0", "edge-2", "edge-3"]);
    expect(view.session.getDocument().nodes).toEqual(view.document.nodes);
    expect(view.session.getSnapshot().history.undo).toHaveLength(1);
    view.session.undo(); expect(view.session.getDocument()).toEqual(view.document);
    view.session.redo(); expect(view.current().items).toHaveLength(3);
    expect(view.session.dispatch({ type: "edge.connect", edge: edge("reconnected", "input-1", "image", 1) }).ok).toBe(true);
    expect(view.current().items).toHaveLength(4);
    expect(view.current().items[1].key).not.toBe(keys[1]);
    const saved = JSON.parse(JSON.stringify(view.session.getDocument())) as SpaceEditorDocument;
    expect(galleryEntries(new SpaceInputResolver(saved), "gallery", saved.nodes[0].config)).toHaveLength(4);
  });

  it("retains same-edge legacy collection siblings across save/undo and disconnects only after the last occurrence is removed", () => {
    const runtime: SpaceInputRuntime = { mediaOutputs: new Map([["collection", [
      { portId: "images", assetId: "same", sortOrder: 0 }, { portId: "images", assetId: "other", sortOrder: 1 },
      { portId: "images", assetId: "same", sortOrder: 2 },
    ]]]) };
    const view = setup([node("gallery", "output.gallery", { mediaType: null, excludedAssetIds: ["legacy"] }),
      { ...node("collection", "edit.image.splitGrid", { parameters: {} }), selectedOutputAssetId: "same" }], [edge("collection-edge", "collection", "images")], runtime);
    const survivingKey = view.current().items[2].key;
    view.remove(0);
    expect(view.current().items.map(item => item.assetId)).toEqual(["other", "same"]);
    expect(view.current().items[1].key).toBe(survivingKey);
    expect(view.session.getDocument().edges).toEqual(view.document.edges);
    expect(view.current().gallery.config).toMatchObject({ excludedAssetIds: ["legacy"], excludedOccurrences: [{ edgeId: "collection-edge", assetId: "same", occurrence: 0 }] });
    const saved = JSON.parse(JSON.stringify(view.session.getDocument())) as SpaceEditorDocument;
    expect(galleryEntries(new SpaceInputResolver(saved, runtime), "gallery", saved.nodes[0].config).filter(isGalleryItem).map(item => item.assetId)).toEqual(["other", "same"]);
    view.session.undo(); expect(view.current().items).toHaveLength(3);
    view.session.redo(); expect(view.current().items).toHaveLength(2);
    view.remove(0);
    expect(view.current().items.map(item => item.assetId)).toEqual(["same"]);
    expect(view.current().items[0].key).toBe(survivingKey);
    expect(view.session.getDocument().edges).toEqual(view.document.edges);
    view.remove(0);
    expect(view.current().items).toEqual([]);
    expect(view.session.getDocument().edges).toEqual([]);
    expect(view.current().gallery.config).toMatchObject({ excludedOccurrences: [], excludedAssetIds: ["legacy"] });
    // Retained Split nodes stay readable; a Gallery edit cannot bypass their authoring ban.
    expect(view.session.dispatch({ type: "edge.connect", edge: edge("fresh-edge", "collection", "images") })).toMatchObject({ ok: false, code: "RETIRED_NODE" });
    view.session.undo(); expect(view.current().items[0].key).toBe(survivingKey);
  });

  it("removes only a frozen slot, preserves ordinals and the producer reference until its last sibling is gone", () => {
    const slots: GeneratedResultGalleryItem[] = Array.from({ length: 3 }, (_, index) => ({ id: `slot-${index}`, nodeId: "producer", executionId: "old-run",
      portId: "image", index, state: "completed", mediaType: "image", assetId: "same" }));
    const view = setup([node("gallery", "output.gallery", { mediaType: null, resultItems: slots }),
      { ...node("producer", "generate.image", { prompt: "", parameters: {}, modelKey: null }), selectedOutputAssetId: "newest" },
      node("manual", "input.image", { assetId: "same" })], [edge("producer-edge", "producer"), edge("manual-edge", "manual", "image", 1)]);
    view.remove(1);
    expect(view.current().items.map(item => item.resultId ?? item.edgeId)).toEqual(["slot-0", "slot-2", "manual-edge"]);
    expect(view.current().gallery.config).toMatchObject({ resultItems: [slots[0], slots[2]] });
    expect(view.session.getDocument().edges).toEqual(view.document.edges);
    expect(view.session.getSnapshot().history.undo).toHaveLength(1);
    view.remove(0); view.remove(0);
    expect(view.current().items.map(item => item.assetId)).toEqual(["same"]);
    expect(view.session.getDocument().edges.map(edge => edge.id)).toEqual(["manual-edge"]);
    expect(view.session.getDocument().nodes.slice(1)).toEqual(view.document.nodes.slice(1));
    expect(view.session.getSnapshot().history.undo).toHaveLength(3);
    view.session.undo();
    expect(view.current().items.map(item => item.resultId ?? item.edgeId)).toEqual(["slot-2", "manual-edge"]);
    expect(view.session.getDocument().edges).toEqual(view.document.edges);
  });

  it("rejects an old source action after the same edge changes asset or source node", () => {
    const view = setup([node("gallery", "output.gallery", { mediaType: null }), node("input", "input.image", { assetId: "same" }), node("other", "input.image", { assetId: "same" })], [edge("edge", "input")]);
    const clicked = view.current().items[0];
    view.session.dispatch({ type: "node.config.patch", nodeId: "input", patch: { assetId: "changed" } });
    let current = view.current();
    expect(galleryRemoveCommand(current.inputs, current.gallery, clicked)).toBeNull();
    view.session.dispatch({ type: "edge.replace", edgeId: "edge", edge: edge("edge", "other") });
    current = view.current();
    expect(current.items[0].assetId).toBe("same");
    expect(galleryRemoveCommand(current.inputs, current.gallery, clicked)).toBeNull();
  });

  it("clears frozen and pending slots, incoming edges, representative output and legacy exclusions in one undo", () => {
    const slot = { id: "pending", nodeId: "producer", executionId: "run", portId: "image", index: 0, state: "pending", mediaType: "image", assetId: null };
    const view = setup([{ ...node("gallery", "output.gallery", { mediaType: null, resultItems: [slot], excludedAssetIds: ["legacy"] }), selectedOutputAssetId: "old" },
      node("producer", "generate.image", { prompt: "", parameters: {}, modelKey: null })], [edge("producer-edge", "producer")]);
    expect(view.session.dispatch(galleryClearCommand(view.current().inputs, "gallery")).ok).toBe(true);
    expect(view.current().gallery).toMatchObject({ selectedOutputAssetId: null, config: { resultItems: [], excludedAssetIds: [], legacyExcludedEdgeIds: [] } });
    expect(view.session.getDocument().edges).toEqual([]);
    expect(view.session.getDocument().nodes[1]).toEqual(view.document.nodes[1]);
    expect(view.session.getSnapshot().history.undo).toHaveLength(1);
    view.session.undo(); expect(view.session.getDocument()).toEqual(view.document);
    view.session.redo();
    view.session.dispatch({ type: "node.add", node: node("new", "input.image", { assetId: "legacy" }) });
    expect(view.session.dispatch({ type: "edge.connect", edge: edge("new-edge", "new") }).ok).toBe(true);
    expect(view.current().items.map(item => item.assetId)).toEqual(["legacy"]);
  });
});
