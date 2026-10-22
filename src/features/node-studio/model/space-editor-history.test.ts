import { describe, expect, it } from "vitest";

import { applySpaceEditorHistoryEntry, createSpaceEditorHistoryEntry } from "./space-editor-history";
import { createSpaceEditorSession } from "./space-editor-store";
import type { SpaceEditorDocument } from "./space-editor-types";

function fixture(): SpaceEditorDocument {
  return { schemaVersion: 3, title: "History", groups: [], edges: [], nodes: ["a", "b", "c", "d"].map((id) => ({ id, kind: "input.image", position: { x: 0, y: 0 }, configVersion: 1, config: { assetId: null }, selectedOutputAssetId: null })) };
}

describe("field/entity-owned inverse history", () => {
  it("restores adjacent deletions in their exact original array order", () => {
    const before = fixture();
    const after = { ...before, nodes: [before.nodes[0], before.nodes[3]] };
    const entry = createSpaceEditorHistoryEntry(before, after);
    expect(applySpaceEditorHistoryEntry(after, entry, "undo")).toEqual(before);
    expect(applySpaceEditorHistoryEntry(before, entry, "redo")).toEqual(after);
  });

  it("restores deleted entities beside their original neighbors after a system insertion shifts indices", () => {
    const original = fixture(), editor = createSpaceEditorSession({ id: "space", version: 1, document: original });
    editor.dispatch({ type: "nodes.remove", nodeIds: ["b", "c"] });
    editor.applySystemTransaction((document) => ({ ...document, nodes: [{ ...original.nodes[0], id: "system-result", selectedOutputAssetId: "async" }, ...document.nodes] }));
    editor.undo();
    expect(editor.getDocument().nodes.map((node) => node.id)).toEqual(["system-result", "a", "b", "c", "d"]);
    expect(editor.getDocument().nodes[0].selectedOutputAssetId).toBe("async");
    editor.redo();
    expect(editor.getDocument().nodes.map((node) => node.id)).toEqual(["system-result", "a", "d"]);
  });

  it("does not own unrelated fields or resurrect a node deleted by a later system transaction", () => {
    const before = fixture(), moved = { ...before, nodes: before.nodes.map((node) => node.id === "a" ? { ...node, position: { x: 10, y: 20 } } : node) };
    const entry = createSpaceEditorHistoryEntry(before, moved);
    expect(entry.patches).toHaveLength(2);
    const latest = { ...moved, nodes: moved.nodes.filter((node) => node.id !== "a") };
    expect(applySpaceEditorHistoryEntry(latest, entry, "undo")).toBe(latest);
  });

  it("restores node stacking order while retaining a later system node and unchanged entity references", () => {
    const original = fixture(), editor = createSpaceEditorSession({ id: "space", version: 1, document: original });
    editor.dispatch({ type: "nodes.reorder", nodeIds: ["d", "a", "b", "c"] });
    editor.applySystemTransaction((document) => ({ ...document, nodes: [document.nodes[0], { ...original.nodes[0], id: "system", selectedOutputAssetId: "result" }, ...document.nodes.slice(1)] }));
    editor.undo();
    expect(editor.getDocument().nodes.map((node) => node.id)).toEqual(["a", "system", "b", "c", "d"]);
    expect(editor.getDocument().nodes[0]).toBe(original.nodes[0]);
    editor.redo();
    expect(editor.getDocument().nodes.map((node) => node.id)).toEqual(["d", "system", "a", "b", "c"]);
    expect(editor.getDocument().nodes[1].selectedOutputAssetId).toBe("result");
  });

  it("retains a newly added node's completed result on entity undo/redo", () => {
    const editor = createSpaceEditorSession({ id: "space", version: 1, document: fixture() });
    editor.dispatch({ type: "node.add", node: { id: "new", kind: "input.image", position: { x: 0, y: 0 } } });
    editor.applySystemTransaction((document) => ({ ...document, nodes: document.nodes.map((node) => node.id === "new" ? { ...node, config: { assetId: "completed" }, selectedOutputAssetId: "completed" } : node) }));
    editor.undo();
    expect(editor.getDocument().nodes.map((node) => node.id)).toEqual(["a", "b", "c", "d"]);
    editor.redo();
    expect(editor.getDocument().nodes[4]).toMatchObject({ id: "new", config: { assetId: "completed" }, selectedOutputAssetId: "completed" });
  });

  it("owns a newly created nested field without deleting later siblings in its optional container", () => {
    const editor = createSpaceEditorSession({ id: "space", version: 1, document: fixture() });
    editor.dispatch({ type: "node.config.patch", nodeId: "a", patch: { presentation: { customTitle: "User title" } } });
    editor.applySystemTransaction((document) => ({ ...document, nodes: document.nodes.map((node) => node.id === "a" ? {
      ...node, config: { assetId: "server asset", presentation: { customTitle: "User title", comment: "later comment" } },
    } : node) }));
    editor.undo();
    expect(editor.getDocument().nodes[0].config).toEqual({ assetId: "server asset", presentation: { comment: "later comment" } });
    editor.redo();
    expect(editor.getDocument().nodes[0].config).toEqual({ assetId: "server asset", presentation: { comment: "later comment", customTitle: "User title" } });
  });

  it("keeps batch edge/entity inverses atomic when later changes would make undo invalid", () => {
    const editor = createSpaceEditorSession({ id: "space", version: 1, document: fixture() });
    editor.dispatch({ type: "node.add", node: { id: "new", kind: "input.image", position: { x: 0, y: 0 } } });
    editor.applySystemTransaction((document) => ({ ...document, edges: [{ id: "system-wire", sourceNodeId: "new", sourcePortId: "image", targetNodeId: "a", targetPortId: "reference", sortOrder: 0 }] }));
    const latest = editor.getDocument();
    expect(editor.undo()).toMatchObject({ ok: false, code: "INVALID_GRAPH" });
    expect(editor.getDocument()).toBe(latest);
    expect(editor.getSnapshot().history.undo).toHaveLength(1);
  });
});
