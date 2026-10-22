import { describe, expect, it, vi } from "vitest";

import { createSpaceEditorSession, type SpaceEditorDurableEvent } from "./space-editor-store";
import type { SpaceEditorDocument } from "./space-editor-types";

function document(): SpaceEditorDocument {
  return { schemaVersion: 3, title: "Space", groups: [], edges: [], nodes: [
    { id: "a", kind: "generate.image", position: { x: 0, y: 0 }, configVersion: 1, config: { prompt: "original", modelKey: null, parameters: {} }, selectedOutputAssetId: "A" },
    { id: "b", kind: "input.image", position: { x: 600, y: 0 }, configVersion: 1, config: { assetId: null }, selectedOutputAssetId: null },
  ] };
}
const session = (draft = document()) => createSpaceEditorSession({ id: "space", version: 1, document: draft });

describe("scoped editor session", () => {
  it("updates server access without replacing pending local edits/history or trusting unsupported configs", () => {
    const editor = session(); editor.dispatch({ type: "node.config.patch", nodeId: "a", patch: { prompt: "unsaved" } });
    const draft = editor.getDocument(), history = editor.getSnapshot().history;
    editor.beginGesture({ kind: "nodes", nodeIds: ["a"] }); editor.setAccess(false, "OWNER_READ_ONLY");
    expect(editor.getSnapshot()).toMatchObject({ writable: false, readOnlyReason: "OWNER_READ_ONLY", gesture: null });
    expect(editor.dispatch({ type: "title.set", title: "blocked" }).ok).toBe(false);
    expect(editor.getDocument()).toBe(draft); expect(editor.getSnapshot().history).toBe(history);
    editor.setAccess(true); expect(editor.getSnapshot().writable).toBe(true); expect(editor.getDocument()).toBe(draft);
    const unknown = session({ ...document(), nodes: [{ ...document().nodes[0], configVersion: 99 }] });
    unknown.setAccess(true); expect(unknown.getSnapshot().writable).toBe(false);
  });
  it("isolates sessions and node/runtime subscribers with stable unchanged references", () => {
    const editor = session(), other = session();
    const initial = editor.getDocument(), runtime = { uploadProgress: 1 };
    editor.setRuntime("b", runtime);
    const nodeListener = vi.fn(), runtimeListener = vi.fn();
    editor.subscribeSelector((state) => state.nodeById.get("b"), nodeListener);
    editor.subscribeSelector((state) => state.runtimeByNode.get("b"), runtimeListener);
    const actions = editor.actions;
    editor.dispatch({ type: "node.config.patch", nodeId: "a", patch: { prompt: "edited" } });
    editor.patchRuntime("a", { uploadProgress: 25 });
    editor.hover("a");
    expect(editor.actions).toBe(actions);
    expect(editor.getDocument().nodes[1]).toBe(initial.nodes[1]);
    expect(editor.getSnapshot().runtimeByNode.get("b")).toBe(runtime);
    expect(nodeListener).not.toHaveBeenCalled();
    expect(runtimeListener).not.toHaveBeenCalled();
    expect(other.getDocument().nodes[0].config).toMatchObject({ prompt: "original" });
    editor.patchRuntime("b", { uploadProgress: 20 });
    expect(runtimeListener).toHaveBeenCalledTimes(1);
    expect(nodeListener).not.toHaveBeenCalled();
  });

  it("does zero graph serialization, durable events or history work for hover/selection/measurement/runtime/viewport", () => {
    const editor = session(), initial = editor.getDocument();
    const listener = vi.fn();
    editor.subscribeDurable(listener);
    const stringify = vi.spyOn(JSON, "stringify");
    try {
      for (let index = 0; index < 100; index++) {
        editor.hover(index % 2 ? "a" : "b");
        editor.select([index % 2 ? "a" : "b"]);
        editor.measure("a", { width: 400 + index, height: 300 });
        editor.patchRuntime("a", { uploadProgress: index });
        editor.setViewport({ x: index, y: 0, zoom: 1 });
      }
      expect(stringify).not.toHaveBeenCalled();
    } finally { stringify.mockRestore(); }
    expect(editor.getDocument()).toBe(initial);
    expect(editor.getSnapshot().history).toEqual({ undo: [], redo: [] });
    expect(listener).not.toHaveBeenCalled();
  });

  it("commits one drag gesture against the latest document, keeping async outputs", () => {
    const editor = session(), initial = editor.getDocument();
    const listener = vi.fn();
    editor.subscribeDurable(listener);
    expect(editor.beginGesture({ kind: "nodes", nodeIds: ["a", "b"] }).ok).toBe(true);
    for (let x = 1; x <= 50; x++) editor.updateGesture({ positions: { a: { x, y: 0 }, b: { x: 600 + x, y: 0 } } });
    expect(editor.getDocument()).toBe(initial);
    expect(editor.getNodePosition("a")).toEqual({ x: 50, y: 0 });
    expect(listener).not.toHaveBeenCalled();
    editor.applySystemTransaction((current) => ({ ...current, nodes: current.nodes.map((node) => node.id === "a" ? { ...node, selectedOutputAssetId: "async" } : node) }));
    expect(editor.getSnapshot().history.undo).toHaveLength(0);
    listener.mockClear();
    editor.commitGesture();
    expect(listener).toHaveBeenCalledTimes(1);
    expect(editor.getSnapshot().history.undo).toHaveLength(1);
    expect(editor.getSnapshot().gesture).toBeNull();
    expect(editor.getDocument().nodes[0]).toMatchObject({ position: { x: 50, y: 0 }, selectedOutputAssetId: "async" });
    editor.undo();
    expect(editor.getDocument().nodes[0]).toMatchObject({ position: { x: 0, y: 0 }, selectedOutputAssetId: "async" });
    editor.redo();
    expect(editor.getDocument().nodes[0].position.x).toBe(50);
  });

  it("cancels gesture buffers with no durable work", () => {
    const editor = session(), initial = editor.getDocument(), listener = vi.fn();
    editor.subscribeDurable(listener);
    editor.beginGesture({ kind: "nodes", nodeIds: ["a"] });
    editor.updateGesture({ positions: { a: { x: 500, y: 500 } } });
    editor.cancelGesture();
    expect(editor.getNodePosition("a")).toBe(initial.nodes[0].position);
    expect(editor.getDocument()).toBe(initial);
    expect(listener).not.toHaveBeenCalled();
  });

  it("undoes a config field without reverting later system result/asset/provenance fields", () => {
    const editor = session();
    editor.dispatch({ type: "node.config.patch", nodeId: "a", patch: { prompt: "user" } });
    editor.applySystemTransaction((current) => ({ ...current, nodes: current.nodes.map((node) => node.id === "a" ? { ...node, selectedOutputAssetId: "completed-output" } : { ...node, config: { assetId: "completed-input", resultSource: { nodeId: "a", executionId: "exec", portId: "image", index: 0, state: "completed" } } }) }));
    const resultInput = editor.getDocument().nodes[1];
    editor.undo();
    expect(editor.getDocument().nodes[0]).toMatchObject({ config: { prompt: "original" }, selectedOutputAssetId: "completed-output" });
    expect(editor.getDocument().nodes[1]).toBe(resultInput);
    editor.redo();
    expect(editor.getDocument().nodes[0]).toMatchObject({ config: { prompt: "user" }, selectedOutputAssetId: "completed-output" });
    expect(editor.getDocument().nodes[1]).toBe(resultInput);
  });

  it("keeps unrelated nested parameters added by a system transaction through undo/redo", () => {
    const editor = session();
    editor.dispatch({ type: "node.config.patch", nodeId: "a", patch: { parameters: { seed: 7 } } });
    editor.applySystemTransaction((current) => ({ ...current, nodes: current.nodes.map((node) => node.id === "a" ? { ...node, config: { ...node.config as object, parameters: { seed: 7, asyncMetadata: { asset: "kept" } } } } : node) }));
    editor.undo();
    expect(editor.getDocument().nodes[0].config).toMatchObject({ parameters: { asyncMetadata: { asset: "kept" } } });
    editor.redo();
    expect(editor.getDocument().nodes[0].config).toMatchObject({ parameters: { seed: 7, asyncMetadata: { asset: "kept" } } });
  });

  it("sends explicit A→B→A output-selection intent for commands and undo/redo only", () => {
    const editor = session(), events: SpaceEditorDurableEvent[] = [];
    editor.subscribeDurable((event) => events.push(event));
    editor.dispatch({ type: "output.select", nodeId: "a", assetId: "B" });
    editor.dispatch({ type: "output.select", nodeId: "a", assetId: "A" });
    editor.undo();
    editor.redo();
    expect(events.map((event) => [event.document.nodes[0].selectedOutputAssetId, event.selectionNodeIds, event.cause])).toEqual([
      ["B", ["a"], "output.select"], ["A", ["a"], "output.select"], ["B", ["a"], "undo"], ["A", ["a"], "redo"],
    ]);
    editor.applySystemTransaction((current) => ({ ...current, nodes: current.nodes.map((node) => node.id === "a" ? { ...node, selectedOutputAssetId: "system" } : node) }));
    expect(events.at(-1)).toMatchObject({ origin: "system", selectionNodeIds: [] });
  });

  it("emits intent for reselecting A during a pending execution without mutating the graph or history", () => {
    const editor = session(), events: SpaceEditorDurableEvent[] = [], initial = editor.getDocument();
    editor.subscribeDurable((event) => events.push(event));
    const revisionAtExecutionStart = editor.getSnapshot().revision;
    expect(editor.dispatch({ type: "output.select", nodeId: "a", assetId: "A" })).toMatchObject({ ok: true, changed: false, selectionNodeIds: ["a"] });
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ documentChanged: false, selectionNodeIds: ["a"], origin: "user", cause: "output.select", revision: revisionAtExecutionStart + 1 });
    expect(editor.getDocument()).toBe(initial);
    expect(editor.getSnapshot().history).toEqual({ undo: [], redo: [] });
    // Workspace can now preserveSelection even when canonical A stayed A,
    // invalidating an in-flight completion's captured selection revision.
    expect(editor.getSnapshot().revision).not.toBe(revisionAtExecutionStart);
  });

  it("uses the same atomic writer for user transforms and releases result associations", () => {
    const draft = document();
    draft.nodes[1] = { ...draft.nodes[1], config: { assetId: "old", resultSource: { nodeId: "a", executionId: "exec", portId: "image", index: 0, state: "completed" } } };
    const editor = session(draft), events: SpaceEditorDurableEvent[] = [];
    editor.subscribeDurable((event) => events.push(event));
    const transformResult = editor.transact((current) => ({ ...current, nodes: current.nodes.map((node) => node.id === "b" ? { ...node, config: { ...node.config as object, assetId: "replacement" } } : node) }), { origin: "user", label: "attachment.replace" });
    expect(transformResult).toMatchObject({ ok: true, changed: true });
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ origin: "user", cause: "attachment.replace" });
    expect(editor.getDocument().nodes[1].config).toMatchObject({ assetId: "replacement", resultSource: { executionId: null } });
    editor.undo();
    expect(editor.getDocument().nodes[1].config).toEqual(draft.nodes[1].config);
    expect(editor.transact((current) => ({ ...current, edges: [{ id: "invalid", sourceNodeId: "missing", sourcePortId: "image", targetNodeId: "b", targetPortId: "reference", sortOrder: 0 }] }), { origin: "user" })).toMatchObject({ ok: false });
    expect(editor.getDocument().edges).toHaveLength(0);
  });

  it("retains 50 user edits, leaves system changes out, and clears redo on a new edit", () => {
    const editor = session();
    for (let index = 1; index <= 55; index++) editor.dispatch({ type: "title.set", title: `Title ${index}` });
    expect(editor.getSnapshot().history.undo).toHaveLength(50);
    for (let index = 0; index < 50; index++) editor.undo();
    expect(editor.getDocument().title).toBe("Title 5");
    editor.undo();
    expect(editor.getDocument().title).toBe("Title 5");
    editor.dispatch({ type: "title.set", title: "New branch" });
    expect(editor.getSnapshot().history.redo).toHaveLength(0);
  });

  it("acknowledges version/IDs without replacing edits made while a save was in flight", () => {
    const editor = session();
    const captured = editor.getDocument();
    editor.dispatch({ type: "node.config.patch", nodeId: "a", patch: { prompt: "latest local" } });
    const latest = editor.getDocument();
    editor.ack({ id: "space", version: 2, persistedNodeIds: captured.nodes.map((node) => node.id), persistedEdgeIds: [], persistedGroupIds: [] });
    expect(editor.getDocument()).toBe(latest);
    expect(editor.getSnapshot().version).toBe(2);
    editor.ack({ version: 1, persistedNodeIds: ["stale"] });
    editor.ack({ id: "other-space", version: 99, persistedNodeIds: ["wrong-space"] });
    expect(editor.getDocument()).toBe(latest);
    expect(editor.getSnapshot().version).toBe(2);
    expect([...editor.getSnapshot().persistedNodeIds]).toEqual(["a", "b"]);
  });

  it("restores unchanged persisted retired nodes and incident edges before deletion is saved", () => {
    const draft = document();
    draft.nodes.push({ id: "old", kind: "edit.image.annotation", position: { x: 300, y: 50 }, configVersion: 1,
      config: { parameters: {} }, selectedOutputAssetId: "old-output" });
    draft.edges.push({ id: "old-wire", sourceNodeId: "old", sourcePortId: "image", targetNodeId: "b", targetPortId: "reference", sortOrder: 0, hasPause: false });
    const editor = session(draft);
    expect(editor.dispatch({ type: "edge.disconnect", edgeId: "old-wire" }).ok).toBe(true);
    expect(editor.undo().ok).toBe(true);
    expect(editor.getDocument()).toEqual(draft);
    expect(editor.redo().ok).toBe(true);
    expect(editor.getDocument().edges).toEqual([]);
    editor.undo();
    expect(editor.dispatch({ type: "node.remove", nodeId: "old" }).ok).toBe(true);
    expect(editor.undo().ok).toBe(true);
    expect(editor.getDocument()).toEqual(draft);
    expect(editor.redo().ok).toBe(true);
    expect(editor.getDocument().nodes.map((node) => node.id)).toEqual(["a", "b"]);
  });

  it("never resurrects a saved retired deletion or lets it block earlier undo entries", () => {
    const draft = document();
    draft.nodes.push({ id: "old", kind: "edit.image.annotation", position: { x: 0, y: 0 }, configVersion: 1, config: { parameters: {} }, selectedOutputAssetId: null });
    draft.groups.push({ id: "frame", title: "Group 1", color: "neutral", locked: false, bounds: { x: 0, y: 0, width: 400, height: 300 }, memberNodeIds: ["old"] });
    const editor = session(draft);
    editor.dispatch({ type: "title.set", title: "Before removal" });
    editor.dispatch({ type: "node.remove", nodeId: "old" });
    editor.ack({ version: 2, persistedNodeIds: ["a", "b"], persistedEdgeIds: [], persistedGroupIds: [] });
    expect(editor.undo()).toMatchObject({ ok: true, changed: false });
    expect(editor.getDocument().nodes.some((node) => node.id === "old")).toBe(false);
    expect(editor.getDocument().groups).toEqual([]);
    expect(editor.undo().ok).toBe(true);
    expect(editor.getDocument().title).toBe("Space");
  });

  it("keeps a retired node while refusing to restore its disconnected edge after a save ack", () => {
    const draft = document();
    draft.nodes.push({ id: "old", kind: "edit.image.annotation", position: { x: 0, y: 0 }, configVersion: 1, config: { parameters: {} }, selectedOutputAssetId: null });
    draft.edges.push({ id: "old-wire", sourceNodeId: "old", sourcePortId: "image", targetNodeId: "b", targetPortId: "reference", sortOrder: 0 });
    const editor = session(draft);
    editor.dispatch({ type: "edge.disconnect", edgeId: "old-wire" });
    editor.undo();
    editor.ack({ version: 2, persistedNodeIds: ["a", "b", "old"], persistedEdgeIds: [] });
    expect(editor.getDocument().nodes[2]).toBe(draft.nodes[2]);
    expect(editor.getDocument().edges).toEqual([]);
    expect(editor.redo().ok).toBe(true);
    expect(editor.undo()).toMatchObject({ ok: true, changed: false });
    expect(editor.getDocument().edges).toEqual([]);
  });

  it("reconciles a retired deletion ack arriving after local undo without losing unrelated newer edits", () => {
    const draft = document();
    draft.nodes.push({ id: "old", kind: "edit.image.annotation", position: { x: 0, y: 0 }, configVersion: 1, config: { parameters: {} }, selectedOutputAssetId: null });
    draft.edges.push({ id: "old-wire", sourceNodeId: "old", sourcePortId: "image", targetNodeId: "b", targetPortId: "reference", sortOrder: 0 });
    const editor = session(draft);
    editor.dispatch({ type: "node.remove", nodeId: "old" });
    editor.undo();
    editor.dispatch({ type: "node.config.patch", nodeId: "a", patch: { prompt: "newer edit" } });
    editor.applySystemTransaction((current) => ({ ...current, nodes: current.nodes.map((node) => node.id === "a" ? { ...node, selectedOutputAssetId: "late-output" } : node) }));
    editor.ack({ version: 2, persistedNodeIds: ["a", "b"], persistedEdgeIds: [] });
    expect(editor.getDocument().nodes.map((node) => node.id)).toEqual(["a", "b"]);
    expect(editor.getDocument().edges).toEqual([]);
    expect(editor.getDocument().nodes[0]).toMatchObject({ config: { prompt: "newer edit" }, selectedOutputAssetId: "late-output" });
    expect(editor.undo().ok).toBe(true);
    expect(editor.getDocument().nodes[0]).toMatchObject({ config: { prompt: "original" }, selectedOutputAssetId: "late-output" });
  });

  it("rejects new retired content and mutable retired config through the transaction writer", () => {
    const draft = document();
    draft.nodes.push({ id: "old", kind: "edit.image.annotation", position: { x: 0, y: 0 }, configVersion: 1, config: { parameters: {} }, selectedOutputAssetId: null });
    const editor = session(draft);
    expect(editor.transact((current) => ({ ...current, nodes: current.nodes.map((node) => node.id === "old" ? { ...node, config: { parameters: { shapes: [] } } } : node) }), { origin: "user" })).toMatchObject({ ok: false, code: "RETIRED_NODE" });
    editor.dispatch({ type: "node.remove", nodeId: "old" });
    expect(editor.transact(() => draft, { origin: "user" })).toMatchObject({ ok: false, code: "RETIRED_NODE" });
    expect(editor.undo().ok).toBe(true);
    expect(editor.getDocument()).toEqual(draft);
  });

  it("does not publish no-op dispatches or query echoes and reuses echoed entities", () => {
    const editor = session(), listener = vi.fn(), initial = editor.getDocument();
    editor.subscribeDurable(listener);
    editor.dispatch({ type: "title.set", title: initial.title });
    editor.dispatch({ type: "node.move", nodeId: "a", position: initial.nodes[0].position });
    editor.applySystemTransaction((current) => structuredClone(current));
    expect(editor.getDocument()).toBe(initial);
    expect(listener).not.toHaveBeenCalled();
    expect(editor.getSnapshot().history.undo).toHaveLength(0);
  });

  it("protects read-only user writes while permitting safe authoritative updates with unknown JSON intact", () => {
    const draft = document();
    draft.nodes[1] = { ...draft.nodes[1], kind: "future.node", config: { vendor: [0, false, null, { exact: "" }] } };
    const editor = session(draft), unknown = draft.nodes[1];
    expect(editor.getSnapshot().writable).toBe(false);
    expect(editor.dispatch({ type: "node.move", nodeId: "a", position: { x: 10, y: 10 } })).toMatchObject({ ok: false, code: "READ_ONLY" });
    expect(editor.transact((current) => ({ ...current, title: "user denied" }), { origin: "user" })).toMatchObject({ ok: false, code: "READ_ONLY" });
    expect(editor.applySystemTransaction((current) => ({ ...current, nodes: current.nodes.map((node) => node.id === "a" ? { ...node, selectedOutputAssetId: "server" } : node) }))).toMatchObject({ ok: true, changed: true });
    expect(editor.getDocument().nodes[1]).toBe(unknown);
    expect(editor.getSnapshot().writable).toBe(false);
    expect(editor.getSnapshot().history.undo).toHaveLength(0);
  });

  it("reset clears transient/history data and dispose detaches registered listeners", () => {
    const editor = session(), durable = vi.fn(), node = vi.fn();
    editor.subscribeDurable(durable);
    editor.subscribeSelector((state) => state.nodeById.get("a"), node);
    editor.dispatch({ type: "title.set", title: "dirty" });
    editor.select(["a"]);
    editor.patchRuntime("a", { uploadProgress: 25 });
    editor.beginGesture({ kind: "nodes", nodeIds: ["a"] });
    editor.reset({ id: "space2", version: 8, document: document() });
    expect(editor.getSnapshot()).toMatchObject({ id: "space2", version: 8, selectedNodeIds: [], gesture: null, history: { undo: [], redo: [] } });
    expect(editor.getSnapshot().runtimeByNode.size).toBe(0);
    durable.mockClear();
    node.mockClear();
    editor.dispose();
    editor.hover("a");
    editor.patchRuntime("a", { uploadProgress: 100 });
    expect(editor.dispatch({ type: "title.set", title: "after dispose" })).toMatchObject({ ok: false, code: "DISPOSED" });
    expect(durable).not.toHaveBeenCalled();
    expect(node).not.toHaveBeenCalled();
  });
});
