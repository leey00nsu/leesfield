import { describe, expect, it } from "vitest";
import { createSpaceEditorSession } from "./space-editor-store";
import { createSpaceFlowProjection } from "./space-editor-flow";
import type { SpaceEditorDocument } from "./space-editor-types";
import { temporarilyHiddenEditNodeKinds } from "@/shared/generation-graph/node-availability";
import { SpaceInputResolver } from "./space-editor-inputs";
import { editorDocumentToCanonicalGraph } from "./space-editor-document";

const document = (): SpaceEditorDocument => ({ schemaVersion: 3, title: "Projection", groups: [], nodes: [
  { id: "prompt", kind: "input.prompt", position: { x: 0, y: 0 }, configVersion: 1, config: { text: "one" }, selectedOutputAssetId: null },
  { id: "target", kind: "input.prompt", position: { x: 400, y: 0 }, configVersion: 1, config: { text: "local" }, selectedOutputAssetId: null },
], edges: [{ id: "wire", sourceNodeId: "prompt", sourcePortId: "text", targetNodeId: "target", targetPortId: "text", sortOrder: 0 }] });

describe("native Flow view", () => {
  it.each(temporarilyHiddenEditNodeKinds)("hides %s and incident wires only in Flow while preserving results and the save document", kind => {
    const mediaType = kind === "edit.image.resize" ? "image" : "video";
    const inputPort = kind === "edit.video.stitch" ? "clips" : mediaType;
    const resultSource = { nodeId: "hidden", executionId: "accepted-run", portId: mediaType, index: 0, state: "completed" };
    const draft: SpaceEditorDocument = { ...document(), nodes: [
      ...document().nodes,
      { id: "source", kind: `input.${mediaType}`, configVersion: 1, config: { assetId: "original" }, position: { x: 0, y: 300 }, selectedOutputAssetId: "original" },
      { id: "hidden", kind, configVersion: 1, config: { parameters: {} }, position: { x: 400, y: 300 }, selectedOutputAssetId: "completed-asset" },
      { id: "result", kind: `input.${mediaType}`, configVersion: 1, config: { assetId: "completed-asset", resultSource }, position: { x: 800, y: 300 }, selectedOutputAssetId: "completed-asset" },
      { id: "retired", kind: "edit.image.annotation", configVersion: 1, config: { parameters: {} }, position: { x: 800, y: 600 }, selectedOutputAssetId: null },
    ], edges: [
      ...document().edges,
      { id: "input-wire", sourceNodeId: "source", sourcePortId: mediaType, targetNodeId: "hidden", targetPortId: inputPort, sortOrder: 0 },
      { id: "result-wire", sourceNodeId: "hidden", sourcePortId: mediaType, targetNodeId: "result", targetPortId: mediaType === "image" ? "reference" : mediaType, sortOrder: 0, hasPause: false },
    ] };
    const original = structuredClone(draft);
    const editor = createSpaceEditorSession({ id: "s", version: 1, document: draft }), project = createSpaceFlowProjection();
    editor.select(["hidden", "result"]);
    const view = project(editor.getSnapshot());
    expect(view.nodes.map(node => node.id)).toEqual(["prompt", "target", "source", "result", "retired"]);
    expect(view.nodes.find(node => node.id === "result")?.selected).toBe(true);
    expect(view.edges.map(edge => edge.id)).toEqual(["wire"]);
    expect(new SpaceInputResolver(draft).sourceAssetIds("result", mediaType)).toEqual(["completed-asset"]);
    expect(editor.getDocument()).toBe(draft);
    expect(draft).toStrictEqual(original);
    expect(editorDocumentToCanonicalGraph(draft, { id: "s", version: 1 })).toMatchObject(original);
    editor.hover("result"); editor.patchRuntime("hidden", { submissionPending: false });
    expect(project(editor.getSnapshot())).toBe(view);
    expect(editor.getDocument()).toStrictEqual(original);
  });

  it("keeps the entire Flow snapshot stable for hover, viewport, progress, title and config-only changes", () => {
    const editor = createSpaceEditorSession({ id: "s", version: 1, document: document() }), project = createSpaceFlowProjection();
    const initial = project(editor.getSnapshot());
    editor.hover("prompt"); editor.setViewport({ x: 100, y: 100, zoom: 0.5 }); editor.patchRuntime("prompt", { uploadProgress: 15 });
    expect(project(editor.getSnapshot())).toBe(initial);
    editor.dispatch({ type: "title.set", title: "Renamed" });
    editor.dispatch({ type: "node.config.patch", nodeId: "prompt", patch: { text: "edited" } });
    expect(project(editor.getSnapshot())).toBe(initial);
    expect(initial.nodes[0].data).toEqual({ nodeId: "prompt" });
    expect(initial.edges[0]).toMatchObject({ id: "wire", sourceHandle: '%5B%22output%22%2C%22text%22%2Cnull%5D', targetHandle: '%5B%22input%22%2C%22text%22%2Cnull%5D' });
    expect(editor.getDocument().edges[0].sourcePortId).toBe("text");
  });
  it("updates only selected/moved views and retains stable presenter data through drag/undo", () => {
    const editor = createSpaceEditorSession({ id: "s", version: 1, document: document() }), project = createSpaceFlowProjection();
    const before = project(editor.getSnapshot());
    editor.select(["prompt"]);
    const selected = project(editor.getSnapshot());
    expect(selected.nodes[0]).not.toBe(before.nodes[0]); expect(selected.nodes[1]).toBe(before.nodes[1]); expect(selected.edges).toBe(before.edges);
    editor.beginGesture({ kind: "nodes", nodeIds: ["prompt"] }); editor.updateGesture({ positions: { prompt: { x: 40, y: 50 } } });
    const dragged = project(editor.getSnapshot());
    expect(dragged.nodes[0].position).toEqual({ x: 40, y: 50 }); expect(dragged.nodes[0].data).toBe(before.nodes[0].data);
    expect(dragged.nodes[1]).toBe(before.nodes[1]); expect(editor.getDocument().nodes[0].position).toEqual({ x: 0, y: 0 });
    editor.commitGesture(); editor.undo();
    expect(project(editor.getSnapshot()).nodes[0].position).toEqual({ x: 0, y: 0 });
  });
  it("projects group movement without storing temporary member positions", () => {
    const draft = document();
    draft.groups = [{ id: "group", title: "Group 1", color: "neutral", bounds: { x: -20, y: -20, width: 360, height: 260 }, locked: false, memberNodeIds: ["prompt"] }];
    const editor = createSpaceEditorSession({ id: "s", version: 1, document: draft }), project = createSpaceFlowProjection();
    const before = project(editor.getSnapshot());
    editor.beginGesture({ kind: "group.move", groupId: "group" }); editor.updateGesture({ delta: { x: 80, y: 10 } });
    const next = project(editor.getSnapshot());
    expect(next.nodes[0].position).toEqual({ x: 80, y: 10 }); expect(next.nodes[1]).toBe(before.nodes[1]);
    expect(editor.getDocument()).toBe(draft);
  });

  it("keeps public IDs intact while producing IDs safe for Flow's CSS handle hit testing", () => {
    const draft = document(), sourceId = 'source"[]\\', targetId = 'target%"', edgeId = 'edge"\\';
    draft.nodes[0].id = sourceId; draft.nodes[1].id = targetId;
    draft.edges[0] = { ...draft.edges[0], id: edgeId, sourceNodeId: sourceId, targetNodeId: targetId };
    const editor = createSpaceEditorSession({ id: "s", version: 1, document: draft });
    const view = createSpaceFlowProjection()(editor.getSnapshot());
    expect(view.nodes[0]).toMatchObject({ id: "source%22%5B%5D%5C", data: { nodeId: sourceId } });
    expect(view.edges[0]).toMatchObject({ id: "edge%22%5C", source: view.nodes[0].id, target: view.nodes[1].id, data: { edgeId } });
    const handle = window.document.createElement("div");
    handle.className = "react-flow__handle";
    handle.dataset.id = `1-${view.nodes[0].id}-${view.edges[0].sourceHandle}-source`;
    window.document.body.append(handle);
    try { expect(window.document.querySelector(`.react-flow__handle[data-id="${handle.dataset.id}"]`)).toBe(handle); }
    finally { handle.remove(); }
    expect(editor.getDocument()).toBe(draft);
  });
});
