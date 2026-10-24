import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NextIntlClientProvider } from "next-intl";
import { useEffect, useImperativeHandle, type ComponentProps, type HTMLAttributes, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CanonicalEdge, CanonicalNode } from "@/shared/generation-graph/canonical-graph";
import type { MediaOutputBinding } from "@/shared/generation-graph/media-output";
import type { MediaAssetDto } from "@/shared/media-assets/media-asset-contract";
import messages from "@/shared/i18n/messages/en.json";
import type { NodeExecutionDto } from "../../model/node-execution-types";
import type { SpaceInputRuntime } from "../../model/space-editor-inputs";
import { createSpaceEditorSession } from "../../model/space-editor-store";
import type { SpaceEditorDocument } from "../../model/space-editor-types";
import { createSpaceEditorScope, SpaceEditorProvider, useSpaceEditor, useSpaceInputRevision } from "../space-editor-provider";
import { SpaceMediaEditInspector } from "../space-media-edit-inspector";
import { SpaceNodeAuthoringProvider } from "./space-node-authoring-provider";
import { SpaceVideoNode } from "./space-node-video";
import type { VideoFrameEditor } from "./video-frame-editor";

type TrimProps = ComponentProps<typeof VideoFrameEditor>;
const mocks = vi.hoisted(() => ({
  assets: new Map<string, MediaAssetDto>(), assetErrors: new Set<string>(), executions: [] as NodeExecutionDto[], historyError: false,
  assetQuery: vi.fn(), assetList: vi.fn(), historyQuery: vi.fn(), retry: vi.fn(), trimMount: vi.fn(), trimUnmount: vi.fn(),
  trim: null as TrimProps | null,
  playheadMs: 0,
}));
// Exercise the retained Stitch implementation independently of their product availability.
// Real availability, projection and server guards are covered without this override in their own suites.
vi.mock("@/shared/generation-graph/node-availability", async importOriginal => {
  const actual = await importOriginal<typeof import("@/shared/generation-graph/node-availability")>();
  return { ...actual, isUnavailableEditNodeKind: (kind: string) => actual.isUnavailableEditNodeKind(kind) && !actual.isTemporarilyHiddenEditNodeKind(kind) };
});
vi.mock("@xyflow/react", () => ({
  Position: { Left: "left", Right: "right" }, NodeResizer: () => null, useUpdateNodeInternals: () => () => {},
  Handle: ({ children, ...props }: HTMLAttributes<HTMLDivElement>) => <div data-space-port={props["data-space-port" as keyof typeof props]}>{children}</div>,
}));
vi.mock("../../hook/use-space-preferences", () => ({ useSpacePreferences: () => undefined }));
// Deliberately provide no start/cancel API hooks: execution can only use the real Frame's services.
vi.mock("../../hook/use-node-executions", async importOriginal => {
  const { nodeExecutionKeys } = await importOriginal<typeof import("../../hook/use-node-executions")>();
  return { nodeExecutionKeys, useNodeExecutions: (...args: unknown[]) => {
    mocks.historyQuery(...args); return { data: mocks.executions, isError: mocks.historyError, refetch: mocks.retry };
  } };
});
vi.mock("@/features/media-assets/hook/use-media-assets", () => ({
  useMediaAsset: (id: string | null) => {
    mocks.assetQuery(id); return { data: id ? mocks.assets.get(id) : undefined, isError: Boolean(id && mocks.assetErrors.has(id)), refetch: mocks.retry };
  },
  useMediaAssetList: (ids: string[]) => {
    mocks.assetList(ids); return ids.map(id => ({ data: mocks.assets.get(id), isError: mocks.assetErrors.has(id), refetch: mocks.retry }));
  },
}));
vi.mock("./space-media-preview", () => ({ SpaceMediaPreview: (props: {
  asset: MediaAssetDto; selected?: boolean; hovered?: boolean;
}) => <div data-testid="preview" data-asset={props.asset.id} data-selected={props.selected} data-hovered={props.hovered} /> }));
// Filmstrip/decoder lifetime belongs to the shared widget tests. Inspect its authoring contract here.
vi.mock("./video-frame-editor", () => ({ VideoFrameEditor: (props: TrimProps) => {
  mocks.trim = props;
  useImperativeHandle(props.frameCaptureRef, () => ({ timestampMs: () => mocks.playheadMs }));
  useEffect(() => { mocks.trimMount(); return () => { mocks.trimUnmount(); }; }, []);
  return <div data-testid="trim" data-source={props.source?.id} data-active={props.active} />;
} }));

function input(id: string, assetId = id, type: "video" | "audio" | "image" = "video"): CanonicalNode {
  return { id, kind: `input.${type}`, configVersion: 1, position: { x: 0, y: 0 }, config: { assetId }, selectedOutputAssetId: assetId };
}
function operation(kind = "edit.video.stitch", config?: CanonicalNode["config"]): CanonicalNode {
  return { id: "operation", kind, configVersion: 1, position: { x: 10, y: 20 }, selectedOutputAssetId: "selected-output",
    config: config ?? { parameters: kind === "edit.video.stitch" ? { repeat: 1, stripAudio: false, clipOrder: [] }
      : kind === "edit.video.trim" ? { startMs: 500, endMs: 5_000, stripAudio: false } : {} } };
}
function edge(id: string, sourceNodeId: string, sortOrder: number, targetPortId = "clips", sourcePortId = "video"): CanonicalEdge {
  return { id, sourceNodeId, sourcePortId, targetNodeId: "operation", targetPortId, sortOrder };
}
function asset(id: string, type: MediaAssetDto["type"] = "video"): MediaAssetDto {
  return { id, version: 1, type, status: "completed", origin: "upload", mimeType: `${type}/mp4`, bytes: "4", width: 800, height: 600,
    durationMs: 8_000, sourceOperationId: null, url: `https://media.example/${id}`, createdAt: "2026-10-20T00:00:00.000Z", updatedAt: "2026-10-20T00:00:00.000Z" };
}
function execution(overrides: Partial<NodeExecutionDto> = {}): NodeExecutionDto {
  return { executionId: "run", executionKind: "media_operation", mediaType: "video", graphNodeId: "operation", status: "completed", progress: 100,
    errorCode: null, modelKey: null, outputAssetIds: ["finished-output"], createdAt: "2026-10-20T00:02:00.000Z", finishedAt: "2026-10-20T00:03:00.000Z", ...overrides };
}
function mount(node = operation(), options: {
  writable?: boolean; nodes?: CanonicalNode[]; edges?: CanonicalEdge[]; persisted?: boolean; inputRuntime?: SpaceInputRuntime; children?: ReactNode;
} = {}) {
  const stitch = node.kind === "edit.video.stitch";
  const document: SpaceEditorDocument = { schemaVersion: 3, title: "Video", nodes: [node, ...(options.nodes ?? [input("a"), ...(stitch ? [input("b")] : [])])],
    edges: options.edges ?? [edge("edge-a", "a", 0, stitch ? "clips" : "video"), ...(stitch ? [edge("edge-b", "b", 1)] : [])], groups: [] };
  const session = createSpaceEditorSession({ id: "space", version: 1, document, writable: options.writable,
    ...(options.persisted === false ? { persistedNodeIds: [] } : {}) });
  const runNode = vi.fn(), cancelNode = vi.fn(), onError = vi.fn(), services = { runNode, cancelNode, onError };
  const catalog = { imageModels: [], isLoading: false, error: null, retry: vi.fn() };
  let inputRuntime = options.inputRuntime ?? {};
  const scope = createSpaceEditorScope(session, { catalog, services, inputRuntime });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const tree = () => <NextIntlClientProvider locale="en" messages={messages} timeZone="UTC"><QueryClientProvider client={client}>
    <SpaceEditorProvider session={session} scope={scope} catalog={catalog} services={services} inputRuntime={inputRuntime}>
      <SpaceNodeAuthoringProvider nodeId={node.id}><SpaceVideoNode nodeId={node.id} /></SpaceNodeAuthoringProvider>{options.children}
      <aside aria-label="Media edit settings"><SpaceMediaEditInspector nodeId={node.id} /></aside>
    </SpaceEditorProvider>
  </QueryClientProvider></NextIntlClientProvider>;
  const result = render(tree());
  return { ...result, session, scope, runNode, cancelNode, onError, document, refresh: () => result.rerender(tree()),
    setInputRuntime: (runtime: SpaceInputRuntime) => { inputRuntime = runtime; result.rerender(tree()); } };
}
function visibleClips(container: HTMLElement) {
  return [...container.querySelectorAll<HTMLElement>("[data-clip-edge]")].map(clip => [clip.dataset.clipEdge, clip.dataset.clipAsset, clip.dataset.clipIndex]);
}
beforeEach(() => {
  mocks.assets.clear(); mocks.assetErrors.clear(); mocks.executions = []; mocks.historyError = false; mocks.trim = null;
  mocks.playheadMs = 0;
  for (const id of ["a", "b", "c", "duplicate", "collection-0", "collection-1"]) mocks.assets.set(id, asset(id));
  for (const fn of [mocks.assetQuery, mocks.assetList, mocks.historyQuery, mocks.retry, mocks.trimMount, mocks.trimUnmount]) fn.mockClear();
  vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} });
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe("SpaceVideoNode", () => {
  it("persists an explicit seek and captures the current playback head immediately before a frame run", () => {
    const view = mount(operation("edit.video.extractFrames")), original = view.session.getDocument(), durable = vi.fn();
    view.session.subscribeDurable(durable);
    expect(mocks.trim!.frame?.timestampMs).toBe(0);
    expect(view.session.getDocument()).toBe(original);
    act(() => { mocks.trim!.frame!.onChange(1250); });
    expect(view.session.getDocument().nodes[0].config).toMatchObject({ parameters: { timestampMs: 1250 } });
    mocks.playheadMs = 2345;
    act(() => { expect(view.scope.prepareNodeRun("operation")).toBe(true); });
    expect(view.session.getDocument().nodes[0].config).toMatchObject({ parameters: { timestampMs: 2345 } });
    expect(durable).toHaveBeenCalledTimes(2);
    expect(view.runNode).not.toHaveBeenCalled();
    expect(view.session.getDocument().nodes.slice(1)).toEqual(original.nodes.slice(1));
    expect(view.session.getDocument().edges).toBe(original.edges);
  });

  it("rejects a retained frame-seek callback across source changes, reset, permission loss and unmount", () => {
    const view = mount(operation("edit.video.extractFrames")), first = mocks.trim!.frame!.onChange;
    act(() => { view.session.dispatch({ type: "output.select", nodeId: "a", assetId: "b" }); });
    const afterSwitch = view.session.getDocument();
    act(() => first(1000));
    expect(view.session.getDocument()).toBe(afterSwitch);
    const beforeReset = mocks.trim!.frame!.onChange;
    act(() => { view.session.reset({ id: "other-space", version: 1, document: afterSwitch }); });
    act(() => beforeReset(2000));
    expect(view.session.getDocument()).toBe(afterSwitch);
    const beforeLock = mocks.trim!.frame!.onChange;
    act(() => { view.session.setAccess(false, "READ_ONLY"); beforeLock(3000); });
    expect(view.session.getDocument()).toBe(afterSwitch);
    act(() => { view.session.setAccess(true); });
    const beforeUnmount = mocks.trim!.frame!.onChange;
    view.unmount(); act(() => beforeUnmount(4000));
    expect(view.session.getDocument()).toBe(afterSwitch);
  });

  it.each(["edit.video.stitch", "edit.video.extractFrames"])("routes %s Run/Cancel only through the Frame", kind => {
    const view = mount(operation(kind));
    expect(view.runNode).not.toHaveBeenCalled();
    expect(view.cancelNode).not.toHaveBeenCalled();
    expect(view.container.querySelectorAll('[data-canvas-action="run"]')).toHaveLength(1);
    expect(screen.queryByRole("tablist")).not.toBeInTheDocument();
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
    expect(view.container.querySelector("[data-node-run]")).toBeNull();
    const run = screen.getByRole("button", { name: "Run this node" });
    expect(run).toBeEnabled(); fireEvent.click(run);
    expect(view.runNode).toHaveBeenCalledExactlyOnceWith("operation");
    act(() => view.session.patchRuntime("operation", { execution: execution({ status: "processing", progress: 24, finishedAt: null }) }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel operation" }));
    expect(view.cancelNode).toHaveBeenCalledExactlyOnceWith("operation");
    expect(view.container.querySelector('[data-space-node]')).toHaveAttribute("data-executing", "true");
  });

  it("shows only the selected Stitch result while the inspector reads exact clips and ignores historical results", () => {
    mocks.executions = [execution()];
    mocks.assets.set("selected-output", asset("selected-output"));
    const view = mount();
    expect(screen.getByTestId("preview")).toHaveAttribute("data-asset", "selected-output");
    expect(mocks.assetList).toHaveBeenLastCalledWith(["a", "b"]);
    expect(view.session.getDocument()).toBe(view.document);
    expect(screen.queryByRole("tablist")).not.toBeInTheDocument();
    expect(view.container.querySelector("[data-space-video]")).not.toHaveTextContent("1m 0s total");
    expect(mocks.assetQuery.mock.calls.flat()).toContain("selected-output");
    expect(mocks.assetQuery.mock.calls.flat()).not.toContain("finished-output");
    expect(view.container.querySelector('[data-space-video] [data-clip-edge]')).toBeNull();
    expect(view.container.querySelector('[data-space-video] input')).toBeNull();
  });

  it("clears the displayed Stitch result while preserving clips, soundtrack, downstream and history", () => {
    mocks.assets.set("selected-output", asset("selected-output"));
    mocks.executions = [execution()];
    const view = mount(operation(), { nodes: [input("a"), input("b"), input("sound", "sound", "audio"), input("downstream")],
      edges: [edge("edge-a", "a", 0), edge("edge-b", "b", 1), edge("soundtrack-edge", "sound", 0, "soundtrack", "audio"),
        { id: "result-edge", sourceNodeId: "operation", sourcePortId: "video", targetNodeId: "downstream", targetPortId: "video", sortOrder: 0 }] });
    const original = view.session.getDocument(), durable = vi.fn(); view.session.subscribeDurable(durable);
    fireEvent.click(view.container.querySelector("[data-space-node-body]")!);
    fireEvent.click(screen.getByRole("button", { name: "Clear result" }));
    expect(screen.queryByTestId("preview")).not.toBeInTheDocument();
    expect(screen.getByText("No result yet")).toBeInTheDocument();
    expect(view.session.getDocument().nodes[0].selectedOutputAssetId).toBeNull();
    expect(view.session.getDocument().nodes[0].config).toBe(original.nodes[0].config);
    expect(view.session.getDocument().nodes.slice(1)).toEqual(original.nodes.slice(1));
    expect(view.session.getDocument().edges).toBe(original.edges);
    expect(durable).toHaveBeenCalledTimes(1);
    expect(mocks.executions).toHaveLength(1);
    expect(mocks.assetQuery.mock.calls.flat()).not.toContain("finished-output");
    act(() => view.session.undo());
    expect(screen.getByTestId("preview")).toHaveAttribute("data-asset", "selected-output");
    expect(view.session.getDocument()).toEqual(original);
    expect(view.runNode).not.toHaveBeenCalled();
  });

  it("clears configured Stitch inputs when there is no result, even if the connected media is unresolved", () => {
    mocks.assets.delete("a"); mocks.assets.delete("b");
    const view = mount({ ...operation(), selectedOutputAssetId: null }, { nodes: [input("a"), input("b"), input("sound", "sound", "audio"), input("downstream")],
      edges: [edge("edge-a", "a", 0), edge("edge-b", "b", 1), edge("soundtrack-edge", "sound", 0, "soundtrack", "audio"),
        { id: "result-edge", sourceNodeId: "operation", sourcePortId: "video", targetNodeId: "downstream", targetPortId: "video", sortOrder: 0 }] });
    const original = view.session.getDocument(), durable = vi.fn(); view.session.subscribeDurable(durable);
    expect(screen.getByText("No result yet")).toBeInTheDocument();
    fireEvent.click(view.container.querySelector("[data-space-node-body]")!);
    fireEvent.click(screen.getByRole("button", { name: "Remove" }));
    expect(view.session.getDocument().edges).toEqual([original.edges[3]]);
    expect(view.session.getDocument().nodes).toBe(original.nodes);
    expect(durable).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("button", { name: "Remove" })).not.toBeInTheDocument();
    act(() => view.session.undo());
    expect(view.session.getDocument()).toEqual(original);
    expect(screen.getByRole("button", { name: "Remove" })).toBeInTheDocument();
    expect(view.runNode).not.toHaveBeenCalled();
  });

  it.each(["edit.video.extractFrames"])("clears %s's video source while preserving the producer and selected result", kind => {
    const view = mount(operation(kind)), original = view.session.getDocument();
    const oldTimelineChange = mocks.trim?.frame.onChange;
    fireEvent.click(view.container.querySelector("[data-space-node-body]")!);
    act(() => {
      fireEvent.click(screen.getByRole("button", { name: "Remove" }));
      oldTimelineChange?.(2000);
    });
    expect(view.session.getDocument().edges).toEqual([]);
    expect(view.session.getDocument().nodes).toBe(original.nodes);
    expect(view.session.getDocument().nodes[0].selectedOutputAssetId).toBe("selected-output");
    expect(screen.queryByTestId("preview")).not.toBeInTheDocument();
    act(() => view.session.undo());
    expect(view.session.getDocument()).toEqual(original);
    expect(view.runNode).not.toHaveBeenCalled();
  });

  it("restores effective edge order, ignores stale/non-edge IDs and preserves duplicate assets without a read-time rewrite", () => {
    const node = operation("edit.video.stitch", { parameters: { repeat: 2, stripAudio: false,
      clipOrder: ["removed", "soundtrack-edge", "duplicate", "a", "edge-b", "edge-b"] } });
    const view = mount(node, { nodes: [input("a", "duplicate"), input("b", "duplicate"), input("c"), input("sound", "sound", "audio")],
      edges: [edge("edge-c", "c", 2), edge("edge-a", "a", 0), edge("soundtrack-edge", "sound", 0, "soundtrack", "audio"), edge("edge-b", "b", 1)] });
    expect(visibleClips(view.container)).toEqual([["edge-b", "duplicate", "0"], ["edge-a", "duplicate", "0"], ["edge-c", "c", "0"]]);
    expect(view.session.getDocument()).toBe(view.document);
    expect(mocks.assetList).toHaveBeenLastCalledWith(["duplicate", "c"]);
    expect(screen.getByRole("spinbutton", { name: "Sequence repeat" })).toHaveValue(2);
    fireEvent.click(view.container.querySelector("[data-space-node-body]")!);
    fireEvent.click(screen.getByRole("button", { name: "Move video 2 earlier" }));
    expect(view.session.getDocument().nodes[0].config).toMatchObject({ parameters: { repeat: 2, stripAudio: false, clipOrder: ["edge-a", "edge-b", "edge-c"] } });
    expect(view.session.getDocument().edges).toBe(view.document.edges);
  });

  it("expands ordered edge collections before the next edge and moves a collection as a group", () => {
    const view = mount();
    const original = view.scope.inputs.edgeAssetIds.bind(view.scope.inputs);
    vi.spyOn(view.scope.inputs, "edgeAssetIds").mockImplementation(item => item.id === "edge-a"
      ? ["collection-0", "collection-1", "collection-0"] : original(item));
    view.refresh();
    expect(visibleClips(view.container)).toEqual([
      ["edge-a", "collection-0", "0"], ["edge-a", "collection-1", "1"], ["edge-a", "collection-0", "2"], ["edge-b", "b", "0"],
    ]);
    fireEvent.click(view.container.querySelector("[data-space-node-body]")!);
    fireEvent.click(screen.getByRole("button", { name: "Move video 2 later" }));
    expect(view.session.getDocument().nodes[0].config).toMatchObject({ parameters: { clipOrder: ["edge-b", "edge-a"] } });
    expect(visibleClips(view.container)).toEqual([
      ["edge-b", "b", "0"], ["edge-a", "collection-0", "0"], ["edge-a", "collection-1", "1"], ["edge-a", "collection-0", "2"],
    ]);
  });

  it("reflects source rename, pause, disconnect and resume without rewriting clipOrder", () => {
    const view = mount(operation("edit.video.stitch", { parameters: { repeat: 1, stripAudio: false, clipOrder: ["edge-b", "edge-a"] } }));
    act(() => { view.session.dispatch({ type: "node.config.fields", nodeId: "b", changes: [{ path: ["presentation", "customTitle"], value: "Renamed" }] }); });
    expect(visibleClips(view.container).map(clip => clip[0])).toEqual(["edge-b", "edge-a"]);
    const config = view.session.getDocument().nodes[0].config;
    act(() => { view.session.dispatch({ type: "edge.pause", edgeId: "edge-b", hasPause: true }); });
    expect(visibleClips(view.container)).toEqual([["edge-a", "a", "0"]]);
    expect(view.session.getDocument().nodes[0].config).toBe(config);
    act(() => { view.session.dispatch({ type: "edge.pause", edgeId: "edge-b", hasPause: undefined }); });
    expect(visibleClips(view.container)[0]).toEqual(["edge-b", "b", "0"]);
    act(() => { view.session.dispatch({ type: "edge.disconnect", edgeId: "edge-b" }); });
    expect(visibleClips(view.container)).toEqual([["edge-a", "a", "0"]]);
    expect(view.session.getDocument().nodes[0].config).toBe(config);
    expect(view.runNode).not.toHaveBeenCalled();
  });

  it("recomputes a queued move from the latest order and preserves concurrent settings, presentation and position", () => {
    const view = mount(operation(), { nodes: [input("a"), input("b"), input("c")], edges: [edge("edge-a", "a", 0), edge("edge-b", "b", 1), edge("edge-c", "c", 2)] });
    fireEvent.click(view.container.querySelector("[data-space-node-body]")!);
    const moveB = screen.getByRole("button", { name: "Move video 2 earlier" });
    act(() => {
      view.session.dispatch({ type: "node.config.fields", nodeId: "operation", changes: [
        { path: ["parameters", "clipOrder"], value: ["edge-c", "edge-a", "edge-b"] },
        { path: ["parameters", "repeat"], value: 3 }, { path: ["parameters", "stripAudio"], value: true },
        { path: ["presentation", "comment"], value: "Concurrent comment" },
      ] });
      view.session.dispatch({ type: "nodes.move", positions: { operation: { x: 500, y: 700 } } });
      fireEvent.click(moveB);
    });
    const current = view.session.getDocument().nodes[0];
    expect(current.position).toEqual({ x: 500, y: 700 });
    expect(current.config).toMatchObject({ presentation: { comment: "Concurrent comment" }, parameters: { repeat: 3, stripAudio: true, clipOrder: ["edge-c", "edge-b", "edge-a"] } });
  });

  it("does not resurrect a disconnected edge when its previous move handler fires", () => {
    const view = mount();
    fireEvent.click(view.container.querySelector("[data-space-node-body]")!);
    const move = screen.getByRole("button", { name: "Move video 2 earlier" });
    act(() => { view.session.dispatch({ type: "edge.disconnect", edgeId: "edge-b" }); fireEvent.click(move); });
    expect(view.session.getDocument().nodes[0].config).toMatchObject({ parameters: { clipOrder: [] } });
    expect(view.session.getDocument().edges.map(item => item.id)).toEqual(["edge-a"]);
  });

  it("edits repeat and stripAudio without changing the soundtrack or other canonical data", () => {
    const view = mount(operation(), { nodes: [input("a"), input("b"), input("sound", "sound", "audio")],
      edges: [edge("edge-a", "a", 0), edge("edge-b", "b", 1), edge("soundtrack-edge", "sound", 0, "soundtrack", "audio")] });
    fireEvent.click(view.container.querySelector("[data-space-node-body]")!);
    fireEvent.change(screen.getByRole("spinbutton", { name: "Sequence repeat" }), { target: { value: "3" } });
    fireEvent.click(screen.getByRole("switch", { name: "Remove all source and soundtrack audio" }));
    expect(view.session.getDocument().nodes[0].config).toMatchObject({ parameters: { repeat: 3, stripAudio: true, clipOrder: [] } });
    expect(view.scope.inputs.inputAssetId("operation", "soundtrack")).toBe("sound");
    expect(view.session.getDocument().edges).toBe(view.document.edges);
    for (const value of ["", "0", "4", "1.5"]) fireEvent.change(screen.getByRole("spinbutton", { name: "Sequence repeat" }), { target: { value } });
    expect(view.session.getDocument().nodes[0].config).toMatchObject({ parameters: { repeat: 3 } });
  });

  it.each(["edit.video.stitch", "edit.video.extractFrames"])("keeps %s read-only", kind => {
    const view = mount(operation(kind), { writable: false });
    fireEvent.click(view.container.querySelector("[data-space-node-body]")!);
    const before = view.session.getDocument();
    expect(screen.getByRole("button", { name: /Run node unavailable/ })).toBeDisabled();
    expect(screen.getByRole("button", { name: kind === "edit.video.stitch" ? "Clear result" : "Remove" })).toBeDisabled();
    if (kind === "edit.video.stitch") {
      expect(screen.getByRole("spinbutton", { name: "Sequence repeat" })).toBeDisabled();
      expect(screen.getByRole("switch")).toHaveAttribute("aria-disabled", "true");
      expect(screen.getByRole("button", { name: "Move video 2 earlier" })).toBeDisabled();
    }
    expect(view.session.getDocument()).toBe(before);
    expect(view.runNode).not.toHaveBeenCalled();
  });

  it("preserves separate start/end frame output bindings and keeps a missing end frame empty", () => {
    function FrameInputs() {
      const scope = useSpaceEditor(); useSpaceInputRevision("start"); useSpaceInputRevision("end");
      return <><output aria-label="start binding">{scope.inputs.inputAssetId("start", "reference") ?? "empty"}</output>
        <output aria-label="end binding">{scope.inputs.inputAssetId("end", "reference") ?? "empty"}</output></>;
    }
    const frames = operation("edit.video.extractFrames"), nodes = [input("a"), input("start", "local-start", "image"), input("end", "local-end", "image")];
    const edges = [edge("source", "a", 0, "video"),
      { id: "start-wire", sourceNodeId: "operation", sourcePortId: "startFrame", targetNodeId: "start", targetPortId: "reference", sortOrder: 0 },
      { id: "end-wire", sourceNodeId: "operation", sourcePortId: "endFrame", targetNodeId: "end", targetPortId: "reference", sortOrder: 0 }];
    const bindings: MediaOutputBinding[] = [{ portId: "startFrame", sortOrder: 0, assetId: "frame-start" }];
    const view = mount(frames, { nodes, edges, inputRuntime: { mediaOutputs: new Map([["operation", bindings]]) }, children: <FrameInputs /> });
    expect(screen.getByLabelText("start binding")).toHaveTextContent("frame-start");
    expect(screen.getByLabelText("end binding")).toHaveTextContent("empty");
    expect(view.container.querySelector('[data-space-port="startFrame"]')).toBeInTheDocument();
    expect(view.container.querySelector('[data-space-port="endFrame"]')).toBeInTheDocument();
    expect(mocks.assetQuery).toHaveBeenLastCalledWith("a");
    expect(screen.queryByRole("tablist")).not.toBeInTheDocument();
    view.setInputRuntime({ mediaOutputs: new Map([["operation", [...bindings, { portId: "endFrame", sortOrder: 0, assetId: "frame-end" }]]]) });
    expect(screen.getByLabelText("end binding")).toHaveTextContent("frame-end");
    expect(view.session.getDocument()).toBe(view.document);
  });

  it("keeps persisted history errors and retry inline while leaving completion status outside the source body", () => {
    mocks.executions = [execution()];
    const view = mount(operation("edit.video.extractFrames"), { persisted: false });
    expect(mocks.historyQuery).toHaveBeenLastCalledWith("space", "operation", false);
    act(() => view.session.ack({ version: 2, persistedNodeIds: ["operation", "a"], persistedEdgeIds: ["edge-a"] }));
    expect(mocks.historyQuery).toHaveBeenLastCalledWith("space", "operation", true);
    act(() => view.session.patchRuntime("operation", { execution: execution({ status: "processing", finishedAt: null }) }));
    expect(view.container.querySelector("[data-space-video]")).not.toHaveTextContent("Completed");
    expect(view.container.querySelector("[data-space-video]")).not.toHaveTextContent("1m 0s total");
    mocks.executions = [execution({ executionId: "newest", createdAt: "2026-10-20T00:04:00.000Z", status: "failed", errorCode: "PROCESSOR_FAILED" })];
    mocks.historyError = true; view.refresh();
    expect(screen.getByText(/PROCESSOR_FAILED/)).toBeInTheDocument();
    const historyError = screen.getByText(messages.nodeStudio.execution.loadError).closest('[role="alert"]') as HTMLElement;
    fireEvent.click(view.container.querySelector("[data-space-node-body]")!);
    fireEvent.click(within(historyError).getByRole("button", { name: "Retry" }));
    expect(mocks.retry).toHaveBeenCalledTimes(1);
    expect(view.session.getDocument().nodes[0].selectedOutputAssetId).toBe("selected-output");
  });

  it.each(["edit.video.frameGrab", "edit.video.easeCurve", "generate.video"])("does not activate the unsupported %s body", kind => {
    const view = mount(operation(kind));
    expect(view.container.querySelector("[data-space-video]")).toBeNull();
    expect(mocks.historyQuery).toHaveBeenLastCalledWith("space", "operation", false);
  });
});
