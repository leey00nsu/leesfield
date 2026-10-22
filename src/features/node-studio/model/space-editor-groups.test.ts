import { describe, expect, it } from "vitest";

import { applySpaceEditorCommand } from "./space-editor-commands";
import type { SpaceEditorCommand } from "./space-editor-command-types";
import { createSpaceEditorSession } from "./space-editor-store";
import type { SpaceEditorDocument } from "./space-editor-types";

function fixture(): SpaceEditorDocument {
  return { schemaVersion: 3, title: "Groups", edges: [], groups: [], nodes: [
    { id: "a", kind: "input.image", configVersion: 1, config: { assetId: null }, selectedOutputAssetId: null, position: { x: 100, y: 200 } },
    { id: "b", kind: "note.memo", configVersion: 1, config: { text: "memo", size: { width: 250, height: 150 } }, selectedOutputAssetId: null, position: { x: 500, y: 350 } },
  ] };
}
function apply(document: SpaceEditorDocument, command: SpaceEditorCommand, measurements = {}) {
  const result = applySpaceEditorCommand(document, command, { measurements });
  if (!result.ok) throw new Error(`${result.code}: ${result.message}`);
  return result.document;
}

describe("canonical groups", () => {
  it("uses measured bounds +20px, Group N and the first unused palette color", () => {
    let document = fixture();
    document = apply(document, { type: "group.create", id: "g1", memberNodeIds: ["a", "b"] }, { a: { width: 100, height: 80 }, b: { width: 200, height: 150 } });
    expect(document.groups).toEqual([{ id: "g1", title: "Group 1", color: "neutral", locked: false, memberNodeIds: ["a", "b"], bounds: { x: 80, y: 180, width: 640, height: 340 } }]);
    document = apply(document, { type: "group.create", id: "g2", memberNodeIds: ["a"] });
    expect(document.groups[0].memberNodeIds).toEqual(["b"]);
    expect(document.groups[1]).toMatchObject({ title: "Group 2", color: "blue", bounds: { x: 80, y: 180, width: 340, height: 340 } });
    document = apply(document, { type: "group.create", id: "g3", memberNodeIds: ["b"] });
    expect(document.groups[2]).toMatchObject({ color: "green", bounds: { x: 480, y: 330, width: 290, height: 190 } });
  });

  it("keeps empty source frames on membership transfer and ungroup", () => {
    let document = apply(fixture(), { type: "group.create", id: "g1", memberNodeIds: ["a"] });
    document = apply(document, { type: "group.create", id: "g2", memberNodeIds: ["a", "b"] });
    expect(document.groups[0].memberNodeIds).toEqual([]);
    document = apply(document, { type: "group.ungroup", nodeIds: ["a", "b"] });
    expect(document.groups.map((group) => group.memberNodeIds)).toEqual([[], []]);
    document = apply(document, { type: "group.members", groupId: "g1", memberNodeIds: ["a"] });
    document = apply(document, { type: "group.members", groupId: "g2", memberNodeIds: ["a"] });
    expect(document.groups.map((group) => group.memberNodeIds)).toEqual([[], ["a"]]);
  });

  it("uses a dragged node's measured center and first containing group, including locked groups", () => {
    const original = fixture();
    original.groups = [
      { id: "first", title: "First", color: "red", locked: true, memberNodeIds: [], bounds: { x: 0, y: 0, width: 300, height: 300 } },
      { id: "second", title: "Second", color: "blue", locked: false, memberNodeIds: ["a"], bounds: { x: 0, y: 0, width: 500, height: 500 } },
    ];
    const document = apply(original, { type: "node.move", nodeId: "a", position: { x: 250, y: 100 } }, { a: { width: 80, height: 100 } });
    expect(document.groups.map((group) => group.memberNodeIds)).toEqual([["a"], []]);
    expect(document.groups[0].locked).toBe(true);
    expect(document.groups[0].bounds).toBe(original.groups[0].bounds);
    const edited = apply(document, { type: "node.config.patch", nodeId: "a", patch: { presentation: { comment: "editable while locked" } } });
    expect(edited.nodes[0].config).toMatchObject({ presentation: { comment: "editable while locked" } });
    expect(edited.groups).toBe(document.groups);
  });

  // 828ea5c9 GroupsOverlay allows header drags and all resize handles while
  // locked; workflowStore.moveGroupNodes always carries the group's members.
  it.each([false, true])("moves frame and members atomically, while resize changes only bounds (locked=%s)", (locked) => {
    const original = apply(fixture(), { type: "group.create", id: "g", memberNodeIds: ["a"], locked });
    const moved = apply(original, { type: "group.move", groupId: "g", delta: { x: 50, y: -20 } });
    expect(moved.nodes[0].position).toEqual({ x: 150, y: 180 });
    expect(moved.nodes[0].config).toBe(original.nodes[0].config);
    expect(moved.nodes[1]).toBe(original.nodes[1]);
    expect(moved.groups[0].bounds).toEqual({ x: 130, y: 160, width: 340, height: 340 });
    const resized = apply(moved, { type: "group.resize", groupId: "g", bounds: { x: 140, y: 150, width: 20, height: 30 } });
    expect(resized.groups[0].bounds).toEqual({ x: 140, y: 150, width: 200, height: 100 });
    expect(resized.nodes).toBe(moved.nodes);
    expect(resized.groups[0]).toMatchObject({ locked, memberNodeIds: ["a"], title: original.groups[0].title, color: original.groups[0].color });
  });

  it("prunes a newly empty frame on node deletion and retains pre-existing empty frames", () => {
    let original = apply(fixture(), { type: "group.create", id: "g", memberNodeIds: ["a"] });
    original = apply(original, { type: "group.create", id: "empty", memberNodeIds: [], bounds: { x: 0, y: 0, width: 200, height: 100 } });
    const deleted = apply(original, { type: "node.remove", nodeId: "a" });
    expect(deleted.groups.map((group) => group.id)).toEqual(["empty"]);
    expect(deleted.groups[0]).toBe(original.groups[1]);
  });

  it("rejects dangling legacy Split group references without rewriting retired config", () => {
    const original = apply(fixture(), { type: "group.create", id: "g", memberNodeIds: ["a"] });
    original.nodes.push({ id: "split", kind: "edit.image.splitGrid", configVersion: 1, position: { x: 800, y: 0 }, selectedOutputAssetId: null,
      config: { parameters: {}, materialization: { rows: 1, cols: 1, cells: [{ baseNodeId: "a", nodeIds: ["a"], groupId: "g" }] } } });
    const config = original.nodes[2].config;
    expect(applySpaceEditorCommand(original, { type: "group.delete", groupId: "g" })).toMatchObject({ ok: false, code: "INVALID_GRAPH" });
    expect(applySpaceEditorCommand(original, { type: "node.remove", nodeId: "a" })).toMatchObject({ ok: false, code: "INVALID_GRAPH" });
    expect(original.nodes[2].config).toBe(config);
    const removedBoth = apply(original, { type: "nodes.remove", nodeIds: ["a", "split"] });
    expect(removedBoth.groups).toEqual([]);
  });

  it.each([false, true])("records one frame gesture and undoes frame/members together (locked=%s)", (locked) => {
    const original = apply(fixture(), { type: "group.create", id: "g", memberNodeIds: ["a", "b"], locked });
    const editor = createSpaceEditorSession({ id: "space", version: 1, document: original });
    const writes: string[] = [];
    editor.subscribeDurable(({ cause }) => writes.push(cause));
    expect(editor.beginGesture({ kind: "group.move", groupId: "g" }).ok).toBe(true);
    for (let x = 1; x <= 10; x++) expect(editor.updateGesture({ delta: { x, y: x } }).ok).toBe(true);
    expect(editor.getDocument()).toBe(original);
    expect(editor.getNodePosition("b")).toEqual({ x: 510, y: 360 });
    expect(writes).toEqual([]);
    expect(editor.commitGesture().ok).toBe(true);
    expect(writes).toEqual(["group.move"]);
    expect(editor.getSnapshot().history.undo).toHaveLength(1);
    expect(editor.getDocument().groups[0].bounds.x).toBe(original.groups[0].bounds.x + 10);
    expect(editor.getDocument().groups[0]).toMatchObject({ locked, memberNodeIds: ["a", "b"] });
    editor.undo();
    expect(editor.getDocument()).toEqual(original);
    editor.redo();
    expect(editor.getDocument().nodes[0].position).toEqual({ x: 110, y: 210 });

    const moved = editor.getDocument();
    const history = editor.getSnapshot().history;
    writes.length = 0;
    expect(editor.beginGesture({ kind: "group.resize", groupId: "g" }).ok).toBe(true);
    editor.updateGesture({ bounds: { x: 20, y: 30, width: 20, height: 30 } });
    editor.cancelGesture();
    expect(editor.getDocument()).toBe(moved);
    expect(editor.getSnapshot().history).toBe(history);
    expect(writes).toEqual([]);

    expect(editor.beginGesture({ kind: "group.resize", groupId: "g" }).ok).toBe(true);
    for (let x = 1; x <= 10; x++) {
      expect(editor.updateGesture({ bounds: { x: 20, y: 30, width: 300 + x, height: 100 + x } }).ok).toBe(true);
    }
    expect(editor.getDocument()).toBe(moved);
    expect(writes).toEqual([]);
    expect(editor.commitGesture().ok).toBe(true);
    expect(writes).toEqual(["group.resize"]);
    expect(editor.getDocument().groups[0].bounds).toEqual({ x: 20, y: 30, width: 310, height: 110 });
    expect(editor.getDocument().nodes).toBe(moved.nodes);
    expect(editor.getSnapshot().history.undo).toHaveLength(2);
    expect(editor.undo().ok).toBe(true);
    expect(editor.getDocument()).toEqual(moved);
    expect(editor.undo().ok).toBe(true);
    expect(editor.getDocument()).toEqual(original);
  });
});
