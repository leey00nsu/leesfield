import { act, render, cleanup } from "@testing-library/react";
import { useEffect } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createSpaceEditorSession } from "../model/space-editor-store";
import { defaultConfigForKind } from "@/shared/generation-graph/node-default-config";
import type { SpaceEditorDocument } from "../model/space-editor-types";
import { createSpaceEditorScope, SpaceEditorProvider, useSpaceSelector } from "./space-editor-provider";
import { captureSpaceAttachmentExpectation, spaceAttachmentExpectationMatches, spaceGenerationAttachmentSlots } from "../model/space-editor-attachments";
import { mappedReferenceImageModelFixture } from "@/test-utils/fixtures/runtime-model-catalog";
import { createSpaceFlowProjection, spaceFlowId } from "../model/space-editor-flow";

afterEach(cleanup);
const document = (): SpaceEditorDocument => ({ schemaVersion: 3, title: "Scope", groups: [], edges: [], nodes: ["a", "b"].map((id, index) => ({ id, kind: "input.image", configVersion: 1, position: { x: index * 400, y: 0 }, config: { assetId: "asset-A" }, selectedOutputAssetId: null })) });
const memoDocument = (size?: { width: number; height: number }): SpaceEditorDocument => ({ ...document(), nodes: [
  { id: "memo-resize", kind: "note.memo", configVersion: 1, position: { x: 100, y: 80 }, config: { text: "Keep this text", ...(size ? { size } : {}) }, selectedOutputAssetId: null },
  ...document().nodes,
] });
const memoId = "memo-resize";

describe("native editor React scope", () => {
  it("shares a live player without graph writes and ignores stale cleanup after a replacement", () => {
    const session = createSpaceEditorSession({ id: "space", version: 1, document: document() }), scope = createSpaceEditorScope(session), other = createSpaceEditorScope(session);
    const before = session.getDocument(), video = window.document.createElement("video");
    const releaseOld = scope.registerNodeVideoPreview("a", { getVideo: () => null });
    const releaseLatest = scope.registerNodeVideoPreview("a", { getVideo: () => video });
    releaseOld(); video.currentTime = 2.5;
    expect(scope.view.getState().videoPreviewByNode.get("a")?.getVideo()?.currentTime).toBe(2.5);
    expect(other.view.getState().videoPreviewByNode.size).toBe(0);
    expect(session.getDocument()).toBe(before); expect(session.getSnapshot().history.undo).toHaveLength(0);
    releaseLatest(); expect(scope.view.getState().videoPreviewByNode.size).toBe(0);
  });
  it.each(["reset", "delete", "dispose", "stop"])("releases player references on %s without reviving a previous registration", condition => {
    const session = createSpaceEditorSession({ id: "space", version: 1, document: document() }), scope = createSpaceEditorScope(session), stop = scope.start();
    scope.registerNodeVideoPreview("a", { getVideo: () => window.document.createElement("video") });
    if (condition === "reset") session.reset({ id: "other", version: 1, document: document() });
    if (condition === "delete") session.dispatch({ type: "node.remove", nodeId: "a" });
    if (condition === "dispose") session.dispose();
    if (condition === "stop") stop();
    expect(scope.view.getState().videoPreviewByNode.size).toBe(0);
    if (condition === "delete") { session.undo(); expect(scope.view.getState().videoPreviewByNode.size).toBe(0); }
    if (condition === "dispose") { scope.registerNodeVideoPreview("b", { getVideo: () => null }); expect(scope.view.getState().videoPreviewByNode.size).toBe(0); }
    stop();
  });
  it("prepares the latest node run once and ignores cleanup from a replaced registration", () => {
    const session = createSpaceEditorSession({ id: "space", version: 1, document: document() }), scope = createSpaceEditorScope(session);
    const old = vi.fn(() => true), latest = vi.fn(() => true);
    const releaseOld = scope.registerNodeRunPreparation("a", old);
    const releaseLatest = scope.registerNodeRunPreparation("a", latest);
    releaseOld();
    expect(scope.prepareNodeRun("a")).toBe(true);
    expect(old).not.toHaveBeenCalled(); expect(latest).toHaveBeenCalledOnce();
    releaseLatest(); expect(scope.prepareNodeRun("a")).toBe(true);
    expect(latest).toHaveBeenCalledOnce();
    expect(scope.prepareNodeRun("missing")).toBe(false);
  });
  it("rejects a previous Space's preparation and cannot revive one after deletion or disposal", () => {
    const session = createSpaceEditorSession({ id: "space", version: 1, document: document() }), scope = createSpaceEditorScope(session), stop = scope.start();
    const prepare = vi.fn(() => true); scope.registerNodeRunPreparation("a", prepare);
    session.reset({ id: "other-space", version: 1, document: document() });
    expect(scope.prepareNodeRun("a")).toBe(false); expect(prepare).not.toHaveBeenCalled();
    scope.registerNodeRunPreparation("a", prepare);
    session.dispatch({ type: "nodes.remove", nodeIds: ["a"] });
    expect(scope.prepareNodeRun("a")).toBe(false);
    session.undo(); expect(scope.prepareNodeRun("a")).toBe(true); expect(prepare).not.toHaveBeenCalled();
    session.setAccess(false, "READ_ONLY"); expect(scope.prepareNodeRun("a")).toBe(false);
    session.dispose(); expect(scope.prepareNodeRun("b")).toBe(false); stop();
  });
  it("does not rerender unrelated node presenters for interaction or another node's content", () => {
    const editor = createSpaceEditorSession({ id: "space", version: 1, document: document() }), counts = { a: 0, b: 0 };
    function Node({ id }: { id: "a" | "b" }) { const node = useSpaceSelector(state => state.nodeById.get(id)); useEffect(() => { counts[id]++; }); return <span>{node?.id}</span>; }
    render(<SpaceEditorProvider session={editor}><Node id="a" /><Node id="b" /></SpaceEditorProvider>);
    const before = { ...counts };
    act(() => { for (let index = 0; index < 20; index++) { editor.hover(index % 2 ? "a" : "b"); editor.setViewport({ x: index, y: 0, zoom: 1 }); editor.patchRuntime("a", { uploadProgress: index }); } });
    expect(counts).toEqual(before);
    act(() => { editor.dispatch({ type: "node.config.patch", nodeId: "a", patch: { assetId: "new" } }); });
    expect(counts.a).toBeGreaterThan(before.a); expect(counts.b).toBe(before.b);
  });
  it("updates input tokens synchronously even when A→B→A changes are batched before React renders", () => {
    const draft = document();
    draft.nodes.push({ id: "generation", kind: "generate.image", configVersion: 1, position: { x: 800, y: 0 }, config: { prompt: "", modelKey: mappedReferenceImageModelFixture.key, parameters: {} }, selectedOutputAssetId: null });
    draft.edges.push({ id: "wire", sourceNodeId: "a", sourcePortId: "image", targetNodeId: "generation", targetPortId: "image-field-refs", sortOrder: 0 });
    const editor = createSpaceEditorSession({ id: "s", version: 1, document: draft }), scope = createSpaceEditorScope(editor), stop = scope.start();
    const slots = spaceGenerationAttachmentSlots(mappedReferenceImageModelFixture), expected = captureSpaceAttachmentExpectation(scope.inputs, "generation", slots[0], slots);
    editor.dispatch({ type: "node.config.patch", nodeId: "a", patch: { assetId: "asset-B" } });
    editor.dispatch({ type: "node.config.patch", nodeId: "a", patch: { assetId: "asset-A" } });
    expect(spaceAttachmentExpectationMatches(editor.getDocument(), "generation", slots[0], expected, slots, {}, scope.inputs)).toBe(false);
    const current = captureSpaceAttachmentExpectation(scope.inputs, "generation", slots[0], slots);
    editor.dispatch({ type: "node.move", nodeId: "b", position: { x: 500, y: 0 } });
    expect(spaceAttachmentExpectationMatches(editor.getDocument(), "generation", slots[0], current, slots, {}, scope.inputs)).toBe(true);
    stop();
  });
  it("keeps media height through settings expand, resize, collapse and reopen without durable writes", () => {
    const editor = createSpaceEditorSession({ id: "s", version: 1, document: document() }), scope = createSpaceEditorScope(editor);
    scope.setPanelHeight("a", 200); expect(editor.getSnapshot().geometryByNode.a).toEqual({ width: 300, height: 500 });
    scope.resize("a", { width: 400, height: 600 }, true); scope.setPanelHeight("a", 0);
    expect(editor.getSnapshot().geometryByNode.a).toEqual({ width: 400, height: 400 });
    scope.setPanelHeight("a", 200); expect(editor.getSnapshot().geometryByNode.a).toEqual({ width: 400, height: 600 });
    expect(editor.getSnapshot().history.undo).toHaveLength(0);
    expect(editor.getDocument().nodes[0].config).toEqual({ assetId: "asset-A" });
    editor.dispatch({ type: "node.add", node: { id: "memo", kind: "note.memo", position: { x: 0, y: 0 }, config: defaultConfigForKind("note.memo") } });
    scope.resize("memo", { width: 350, height: 300 }, false);
    expect(editor.getSnapshot().history.undo).toHaveLength(1);
    scope.resize("memo", { width: 350, height: 300 }, true);
    expect(editor.getDocument().nodes.at(-1)?.config).toMatchObject({ size: { width: 350, height: 300 } });
    expect(editor.getSnapshot().history.undo).toHaveLength(2);
  });

  it("initializes the frame timeline within its resize bounds before a gesture without changing the graph", () => {
    const frames = { ...document().nodes[0], id: "frames", kind: "edit.video.extractFrames" as const,
      config: defaultConfigForKind("edit.video.extractFrames"), position: { x: 0, y: 0 } };
    const draft = { ...document(), nodes: [frames] };
    const editor = createSpaceEditorSession({ id: "s", version: 1, document: draft });
    const scope = createSpaceEditorScope(editor), project = createSpaceFlowProjection(), durable = vi.fn();
    editor.subscribeDurable(durable);
    const stop = scope.start();
    expect(project(editor.getSnapshot()).nodes[0]).toMatchObject({ width: 420, height: 420 });
    expect(scope.beginResize(frames.id)).toBe(true);
    expect(project(editor.getSnapshot()).nodes[0]).toMatchObject({ width: 420, height: 420 });
    scope.resize(frames.id, { width: 424, height: 424 }, false);
    expect(project(editor.getSnapshot()).nodes[0]).toMatchObject({ width: 424, height: 424 });
    scope.resize(frames.id, { width: 459, height: 459 }, true);
    expect(project(editor.getSnapshot()).nodes[0]).toMatchObject({ width: 459, height: 459 });
    expect(editor.getDocument()).toBe(draft);
    expect(durable).not.toHaveBeenCalled();
    expect(editor.getSnapshot().history.undo).toHaveLength(0);

    editor.dispatch({ type: "node.add", node: { ...frames, id: "new-frames", position: { x: 600, y: 0 } } });
    expect(project(editor.getSnapshot()).nodes.find(node => node.id === "new-frames")).toMatchObject({ width: 420, height: 420 });
    // An unrelated graph edit keeps the user's transient resize intact.
    expect(project(editor.getSnapshot()).nodes[0]).toMatchObject({ width: 459, height: 459 });
    editor.reset({ id: "s", version: 2, document: draft });
    expect(project(editor.getSnapshot()).nodes[0]).toMatchObject({ width: 420, height: 420 });
    stop();
  });

  it("refreshes derived edge contacts when restarted and releases deleted node view state", () => {
    const editor = createSpaceEditorSession({ id: "s", version: 1, document: document() }), scope = createSpaceEditorScope(editor);
    const stop = scope.start(); stop();
    editor.dispatch({ type: "edge.connect", edge: { id: "wire", sourceNodeId: "a", sourcePortId: "image", targetNodeId: "b", targetPortId: "reference" } });
    const restart = scope.start();
    expect(scope.view.getState().edgeById.has("wire")).toBe(true);
    expect(scope.view.getState().portRevisionByNode.get("a")).toBe(1);
    scope.toggleExpanded("a"); scope.setPanelHeight("a", 200);
    editor.dispatch({ type: "node.remove", nodeId: "a" });
    expect(scope.view.getState().edgeById.size).toBe(0);
    expect(scope.view.getState().expandedNodeIds.has("a")).toBe(false);
    expect(scope.view.getState().panelHeightByNode.has("a")).toBe(false);
    expect(scope.view.getState().bodyHeightByNode.has("a")).toBe(false);
    restart();
  });

  it("reconciles Memo resize undo/redo into controlled Flow geometry without replacing other node sizes", () => {
    const editor = createSpaceEditorSession({ id: "s", version: 1, document: memoDocument() });
    const scope = createSpaceEditorScope(editor), stop = scope.start(), project = createSpaceFlowProjection(), durable = vi.fn();
    editor.subscribeDurable(durable);
    scope.resize("a", { width: 510, height: 450 }, true);
    const unrelated = project(editor.getSnapshot()).nodes.find(node => node.id === "a");
    scope.resize(memoId, { width: 420, height: 320 }, false);
    expect(editor.getDocument().nodes[0].config).toEqual({ text: "Keep this text" });
    expect(project(editor.getSnapshot()).nodes[0]).toMatchObject({ width: 420, height: 320 });
    scope.resize(memoId, { width: 420, height: 320 }, true);
    expect(editor.getDocument().nodes[0].config).toEqual({ text: "Keep this text", size: { width: 420, height: 320 } });
    expect(editor.getSnapshot().history.undo).toHaveLength(1);
    expect(durable).toHaveBeenCalledTimes(1);
    editor.undo();
    expect(project(editor.getSnapshot()).nodes[0]).toMatchObject({ id: spaceFlowId(memoId), width: 300, height: 220, position: { x: 100, y: 80 } });
    expect(scope.view.getState().bodyHeightByNode.get(memoId)).toBe(220);
    expect(editor.getDocument().nodes[0].config).toEqual({ text: "Keep this text" });
    editor.redo();
    const redone = project(editor.getSnapshot());
    expect(redone.nodes[0]).toMatchObject({ width: 420, height: 320, position: { x: 100, y: 80 } });
    expect(scope.view.getState().bodyHeightByNode.get(memoId)).toBe(320);
    expect(redone.nodes.find(node => node.id === "a")).toBe(unrelated);
    stop();
  });

  it("commits northwest origin and Memo size as one history entry using the session position buffer", () => {
    const editor = createSpaceEditorSession({ id: "s", version: 1, document: memoDocument({ width: 360, height: 280 }) });
    const scope = createSpaceEditorScope(editor), stop = scope.start(), project = createSpaceFlowProjection(), durable = vi.fn();
    editor.subscribeDurable(durable);
    expect(scope.beginResize(memoId)).toBe(true);
    expect(scope.isResizing(memoId)).toBe(true);
    expect(scope.isResizing("a")).toBe(false);
    scope.resize(memoId, { width: 480, height: 360, x: -20, y: 0 }, false);
    expect(project(editor.getSnapshot()).nodes[0]).toMatchObject({ width: 480, height: 360, position: { x: -20, y: 0 } });
    expect(editor.getDocument().nodes[0]).toMatchObject({ position: { x: 100, y: 80 }, config: { size: { width: 360, height: 280 } } });
    expect(durable).not.toHaveBeenCalled();
    // Canvas can buffer Flow position changes even when dragging is absent/false.
    editor.updateGesture({ positions: { [memoId]: { x: -30, y: -10 } } });
    scope.resize(memoId, { width: 490, height: 370 }, true);
    expect(editor.getSnapshot().gesture).toBeNull();
    expect(scope.isResizing(memoId)).toBe(false);
    expect(editor.getSnapshot().history.undo).toHaveLength(1);
    expect(durable).toHaveBeenCalledTimes(1);
    expect(editor.getDocument().nodes[0]).toMatchObject({ position: { x: -30, y: -10 }, config: { text: "Keep this text", size: { width: 490, height: 370 } } });
    expect(editor.commitGesture()).toMatchObject({ ok: false, code: "NO_GESTURE" });
    editor.undo();
    expect(project(editor.getSnapshot()).nodes[0]).toMatchObject({ width: 360, height: 280, position: { x: 100, y: 80 } });
    editor.redo();
    expect(project(editor.getSnapshot()).nodes[0]).toMatchObject({ width: 490, height: 370, position: { x: -30, y: -10 } });
    expect(editor.getSnapshot().history.undo).toHaveLength(1);
    stop();
  });

  it("applies the active size to selected nodes while only Memo sizes become durable", () => {
    const draft = memoDocument();
    draft.nodes.push({ ...draft.nodes[0], id: "memo-2", position: { x: 700, y: 80 } });
    const editor = createSpaceEditorSession({ id: "s", version: 1, document: draft });
    const scope = createSpaceEditorScope(editor), stop = scope.start(), project = createSpaceFlowProjection();
    editor.select([memoId, "memo-2", "a"]);
    expect(scope.beginResize(memoId)).toBe(true);
    expect(scope.isResizing("a")).toBe(true);
    expect(scope.isResizing("memo-2")).toBe(true);
    scope.resize(memoId, { width: 410, height: 330, x: 70, y: 40 }, true);
    expect(editor.getSnapshot().history.undo).toHaveLength(1);
    for (const node of project(editor.getSnapshot()).nodes.filter(node => node.selected)) expect(node).toMatchObject({ width: 410, height: 330 });
    expect(editor.getDocument().nodes.filter(node => node.kind === "note.memo").map(node => node.config)).toEqual([
      { text: "Keep this text", size: { width: 410, height: 330 } }, { text: "Keep this text", size: { width: 410, height: 330 } },
    ]);
    expect(editor.getDocument().nodes.find(node => node.id === "a")?.config).toEqual({ assetId: "asset-A" });
    expect(editor.getDocument().nodes.find(node => node.id === memoId)?.position).toEqual({ x: 70, y: 40 });
    expect(editor.getDocument().nodes.find(node => node.id === "memo-2")?.position).toEqual({ x: 700, y: 80 });
    expect(editor.getDocument().nodes.find(node => node.id === "a")?.position).toEqual({ x: 0, y: 0 });
    editor.undo();
    expect(project(editor.getSnapshot()).nodes[0]).toMatchObject({ width: 300, height: 220 });
    expect(editor.getSnapshot().geometryByNode.a).toEqual({ width: 410, height: 330 });
    const reloaded = createSpaceEditorSession({ id: "s", version: 1, document: editor.getDocument() });
    expect(project(reloaded.getSnapshot()).nodes.find(node => node.id === "a")).toMatchObject({ width: 300, height: 300 });
    stop();
  });

  it("synchronizes explicit Memo size edits, removed size and reset while keeping panel body height stable", () => {
    const editor = createSpaceEditorSession({ id: "s", version: 1, document: memoDocument({ width: 360, height: 280 }) });
    const scope = createSpaceEditorScope(editor), stop = scope.start(), project = createSpaceFlowProjection();
    scope.setPanelHeight(memoId, 100);
    expect(editor.getSnapshot().geometryByNode[memoId]).toEqual({ width: 360, height: 380 });
    expect(editor.dispatch({ type: "node.config.patch", nodeId: memoId, patch: { size: { width: 440, height: 400 } } })).toMatchObject({ ok: true, changed: true });
    expect(scope.view.getState().bodyHeightByNode.get(memoId)).toBe(300);
    scope.setPanelHeight(memoId, 0);
    expect(project(editor.getSnapshot()).nodes[0]).toMatchObject({ width: 440, height: 300 });
    scope.setPanelHeight(memoId, 100);
    expect(project(editor.getSnapshot()).nodes[0]).toMatchObject({ width: 440, height: 400 });
    editor.dispatch({ type: "node.config.replace", nodeId: memoId, config: { text: "New text" } });
    expect(project(editor.getSnapshot()).nodes[0]).toMatchObject({ width: 300, height: 220 });
    scope.resize(memoId, { width: 500, height: 430 }, false);
    scope.cancelResize();
    expect(project(editor.getSnapshot()).nodes[0]).toMatchObject({ width: 300, height: 220 });
    editor.measure(memoId, { width: 999, height: 999 });
    editor.reset({ id: "s", version: 2, document: memoDocument() });
    expect(project(editor.getSnapshot()).nodes[0]).toMatchObject({ width: 300, height: 220 });
    expect(scope.view.getState().bodyHeightByNode.get(memoId)).toBe(120);
    stop();
  });

  it("restores transient resize state on cancellation, invalid final size, read-only transition and scope release", () => {
    const editor = createSpaceEditorSession({ id: "s", version: 1, document: memoDocument() });
    const onError = vi.fn(), scope = createSpaceEditorScope(editor, { services: { onError } }), stop = scope.start();
    const project = createSpaceFlowProjection();
    const begin = () => { scope.beginResize(memoId); scope.resize(memoId, { width: 450, height: 350, x: 0, y: 0 }, false); };
    begin(); editor.cancelGesture();
    expect(scope.isResizing(memoId)).toBe(false);
    expect(project(editor.getSnapshot()).nodes[0]).toMatchObject({ width: 300, height: 220, position: { x: 100, y: 80 } });
    begin(); scope.resize(memoId, { width: 210, height: 130 }, true);
    expect(editor.getSnapshot().gesture).toBeNull();
    expect(editor.getSnapshot().history.undo).toHaveLength(0);
    expect(onError).toHaveBeenCalledOnce();
    expect(project(editor.getSnapshot()).nodes[0]).toMatchObject({ width: 300, height: 220 });
    begin(); editor.reset({ id: "s", version: 2, document: memoDocument(), writable: false });
    expect(scope.isResizing(memoId)).toBe(false);
    expect(scope.beginResize(memoId)).toBe(false);
    expect(project(editor.getSnapshot()).nodes[0]).toMatchObject({ width: 300, height: 220, position: { x: 100, y: 80 } });
    editor.reset({ id: "s", version: 3, document: memoDocument() });
    begin(); stop();
    expect(editor.getSnapshot().gesture).toBeNull();
    expect(editor.getSnapshot().history.undo).toHaveLength(0);
    expect(project(editor.getSnapshot()).nodes[0]).toMatchObject({ width: 300, height: 220, position: { x: 100, y: 80 } });
  });

  it("discards an old session's transient size when reset interrupts a non-Memo resize", () => {
    const editor = createSpaceEditorSession({ id: "s", version: 1, document: document() });
    const scope = createSpaceEditorScope(editor), stop = scope.start(), project = createSpaceFlowProjection();
    scope.resize("a", { width: 510, height: 450 }, true);
    scope.beginResize("a");
    scope.resize("a", { width: 600, height: 500, x: -90, y: -50 }, false);
    editor.reset({ id: "new-session", version: 1, document: document() });
    expect(scope.isResizing("a")).toBe(false);
    expect(editor.getSnapshot().gesture).toBeNull();
    expect(editor.getSnapshot().geometryByNode.a).toBeUndefined();
    expect(scope.view.getState().bodyHeightByNode.has("a")).toBe(false);
    expect(project(editor.getSnapshot()).nodes[0]).toMatchObject({ width: 300, height: 300, position: { x: 0, y: 0 } });
    stop();
  });

  it("does not create Memo history when a resize handle is released without changing size or origin", () => {
    const editor = createSpaceEditorSession({ id: "s", version: 1, document: memoDocument() });
    const scope = createSpaceEditorScope(editor), stop = scope.start(), durable = vi.fn();
    editor.subscribeDurable(durable);
    scope.beginResize(memoId);
    scope.resize(memoId, { width: 300, height: 220, x: 100, y: 80 }, true);
    expect(editor.getDocument().nodes[0].config).toEqual({ text: "Keep this text" });
    expect(editor.getSnapshot().gesture).toBeNull();
    expect(editor.getSnapshot().history.undo).toHaveLength(0);
    expect(durable).not.toHaveBeenCalled();
    stop();
  });
});
