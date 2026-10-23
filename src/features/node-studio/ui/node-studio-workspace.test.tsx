import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ComponentProps, ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { defaultConfigForKind } from "@/shared/generation-graph/node-default-config";
import { validateNodeConfig, type CanonicalNodeKind } from "@/shared/generation-graph/node-registry";
import { IntlProvider, renderWithIntl } from "@/test-utils/intl";

import type { GraphDraft, GraphAutosaveSnapshot } from "../hook/use-graph-autosave";
import { nodeExecutionKeys } from "../hook/use-node-executions";
import { appendResultNodes, bindResultNodes, reconcileResultNodes, reserveResultNodes, resultGalleryItems, resultSource, unsubmittedResultIds } from "../model/generation-result-nodes";
import type { GenerationGraphSnapshotDto } from "../model/graph-types";
import type { NodeExecutionDto } from "../model/node-execution-types";
import type { NodeExecutionReceipt } from "../model/server-execution-tracking";
import { SpaceInputResolver, type SpaceInputRuntime } from "../model/space-editor-inputs";
import type { SpaceEditorSession } from "../model/space-editor-store";
import type { SpaceCanvasSettings } from "../model/space-editor-types";
import type { SpaceEditorCatalog, SpaceEditorServices } from "./space-editor-provider";
import { NodeStudioWorkspace } from "./node-studio-workspace";
import { appToast } from "@/shared/ui/app-toast";

const mocks = vi.hoisted(() => ({
  useAutosave: vi.fn(), update: vi.fn(), retry: vi.fn(), preserveSelection: vi.fn(), saveNow: vi.fn(),
  nodeStudio: vi.fn(), header: vi.fn(), comments: vi.fn(), quickstart: vi.fn(),
  usePreferences: vi.fn(), saveDefaults: vi.fn(), saveSettings: vi.fn(), upload: vi.fn(),
}));
const outputMocks = vi.hoisted(() => ({
  listExecutions: vi.fn(), listAssets: vi.fn(), startExecution: vi.fn(), runImage: vi.fn(), cancelExecution: vi.fn(),
}));
const mediaApiMocks = vi.hoisted(() => ({ getMediaAsset: vi.fn() }));
vi.mock("@/shared/ui/app-toast", () => ({ appToast: { error: vi.fn() } }));
vi.mock("@/shared/logging/logger.mjs", () => ({ logger: { error: vi.fn() } }));

// Exercise retained Resize/Trim/Stitch pipeline and teardown independently of product availability.
// Actual hidden-kind availability, Flow projection and server guards have separate unmocked suites.
vi.mock("@/shared/generation-graph/node-availability", async importOriginal => {
  const actual = await importOriginal<typeof import("@/shared/generation-graph/node-availability")>();
  return { ...actual, isUnavailableEditNodeKind: (kind: string) => actual.isUnavailableEditNodeKind(kind) && !actual.isTemporarilyHiddenEditNodeKind(kind) };
});

vi.mock("../lib/browser-image-operation-runner", () => ({ runBrowserImageOperation: outputMocks.runImage }));
vi.mock("../hook/use-graph-autosave", () => ({ useGraphAutosave: mocks.useAutosave }));
vi.mock("../hook/use-space-preferences", async importOriginal => ({
  ...await importOriginal<typeof import("../hook/use-space-preferences")>(),
  useSpacePreferencesSession: mocks.usePreferences,
}));
vi.mock("@/shared/lib/hooks/use-runtime-model-catalog", () => {
  const catalog = { imageModels: [], audioModels: [], videoModels: [], llmModels: [], isLoading: false, error: null, refetch: vi.fn() };
  return { useRuntimeModelCatalog: () => catalog };
});
vi.mock("../api/node-execution-api", async importOriginal => ({
  ...await importOriginal<typeof import("../api/node-execution-api")>(),
  listNodeExecutions: outputMocks.listExecutions, startNodeExecution: outputMocks.startExecution,
  cancelNodeExecution: outputMocks.cancelExecution,
}));
vi.mock("@/features/media-assets/api/media-asset-api", () => ({ getMediaAsset: mediaApiMocks.getMediaAsset }));
vi.mock("@/features/media-assets/hook/use-media-assets", () => ({
  mediaAssetKeys: { all: ["media-assets"], detail: (id: string) => ["media-assets", "detail", id] },
  useMediaAssetList: outputMocks.listAssets,
  useUploadMediaAsset: () => ({ mutateAsync: mocks.upload, isPending: false }),
}));
vi.mock("./node-studio", () => ({
  NodeStudio: (props: unknown) => { mocks.nodeStudio(props); return <div>canvas</div>; },
}));

interface HeaderProps {
  brand: ReactNode;
  commentsNavigation: ReactNode;
  title: string;
  graphs: readonly { id: string; title: string }[];
  saveLabel: string;
  saving: boolean;
  writable: boolean;
  creating: boolean;
  nodeDefaults: Record<string, string>;
  canvasSettings: SpaceCanvasSettings;
  onTitleChange: (title: string) => void;
  onCanvasSettingsChange: (settings: SpaceCanvasSettings) => void;
  onSaveSettings: (changes: { defaults?: Record<string, string>; inlineParametersEnabled?: boolean }) => Promise<void>;
  onSelectGraph: (id: string) => void;
  onCreateGraph: (title: string) => void;
  onSave: () => void;
  onDelete: () => void;
}
// Header controls/dialogs have their own UI tests. This boundary exposes only the
// real header actions needed to exercise the workspace's save/leave decisions.
vi.mock("./space-workspace-header", () => ({
  SpaceWorkspaceHeader: (props: HeaderProps) => {
    mocks.header(props);
    return <header>
      {props.brand}{props.commentsNavigation}
      <span role="status">{props.saveLabel}</span>
      <button type="button" aria-label="Save space" disabled={!props.writable || props.saving} onClick={props.onSave}>Save</button>
      <button type="button" onClick={props.onDelete}>Delete space</button>
      {props.graphs.map(item => <button key={item.id} type="button" disabled={props.creating} onClick={() => props.onSelectGraph(item.id)}>{item.title}</button>)}
      <button type="button" disabled={props.creating} onClick={() => props.onCreateGraph("Untitled Space")}>New space</button>
    </header>;
  },
  SpaceCommentsNavigationIcon: (props: { count: number; unreadCount: number; onNavigate: () => void }) => {
    mocks.comments(props);
    return <button type="button" aria-label="Navigate comments" onClick={props.onNavigate}>Comments</button>;
  },
}));
vi.mock("./space-quickstart", () => ({
  SpaceQuickstart: (props: unknown) => { mocks.quickstart(props); return <div>Quickstart</div>; },
}));
vi.mock("./space-tutorial", () => ({ SpaceTutorial: () => null }));

const loadedPreferences = {
  data: { schemaVersion: 1 as const, revision: 1, recentModelKeys: [], defaults: {} },
  error: null, saving: false, trackModel: vi.fn(), saveDefaults: mocks.saveDefaults, saveSettings: mocks.saveSettings,
  retry: vi.fn(), inlineParametersEnabled: false, setInlineParametersEnabled: vi.fn(),
};
const graph: GenerationGraphSnapshotDto = {
  id: "graph-a", title: "Graph A", version: 3, schemaVersion: 3, minimumWriterVersion: 3,
  groups: [], nodes: [], edges: [], createdAt: "2026-08-24T00:00:00.000Z", updatedAt: "2026-08-24T00:00:00.000Z",
};
function node(id: string, kind: CanonicalNodeKind, overrides: Partial<GenerationGraphSnapshotDto["nodes"][number]> = {}): GenerationGraphSnapshotDto["nodes"][number] {
  return { id, kind, configVersion: 1, position: { x: 0, y: 0 }, config: defaultConfigForKind(kind), selectedOutputAssetId: null, ...overrides };
}
function repeatGraph(repeatCount = 4): GenerationGraphSnapshotDto & GraphDraft {
  return { ...graph, schemaVersion: 3, nodes: [node("repeat", "generate.image", {
    config: { ...defaultConfigForKind("generate.image"), prompt: "frozen", modelKey: "m", parameters: { imageCount: 1 }, repeatCount },
  })] };
}
function execution(executionId: string, overrides: Partial<NodeExecutionDto> = {}): NodeExecutionDto {
  return { executionId, graphNodeId: "repeat", executionKind: "generation", mediaType: "image", status: "pending", progress: 0,
    errorCode: null, modelKey: "m", outputAssetIds: [], createdAt: "2026-09-13T00:00:00Z", ...overrides };
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
interface StudioProps {
  session: SpaceEditorSession;
  catalog: SpaceEditorCatalog;
  inputRuntime: SpaceInputRuntime;
  services: SpaceEditorServices;
  canvasSettings: SpaceCanvasSettings;
}
const studio = (): StudioProps => mocks.nodeStudio.mock.lastCall![0];
const header = (): HeaderProps => mocks.header.mock.lastCall![0];
const document = () => studio().session.getDocument();
const currentNode = (id: string) => document().nodes.find(item => item.id === id);
function resultGallery(draft: GraphDraft = document()) {
  const galleries = draft.nodes.filter(item => item.kind === "output.gallery");
  expect(galleries).toHaveLength(1);
  const gallery = galleries[0], items = resultGalleryItems(gallery.config);
  expect(items).not.toBeNull();
  return { gallery, items: items! };
}
const inputs = () => new SpaceInputResolver(document(), studio().inputRuntime);
function edit(command: Parameters<SpaceEditorSession["dispatch"]>[0]) {
  act(() => { expect(studio().session.dispatch(command)).toMatchObject({ ok: true }); });
}
async function run(nodeId: string): Promise<NodeExecutionReceipt> {
  const receipt = await studio().services.runNode!(nodeId);
  expect(receipt).toMatchObject({ executionId: expect.any(String), completion: expect.any(Promise) });
  return receipt as NodeExecutionReceipt;
}
function mount(snapshot = graph, props: Partial<Omit<ComponentProps<typeof NodeStudioWorkspace>, "graph">> = {}, client?: QueryClient) {
  const ui = <NodeStudioWorkspace graph={snapshot} onSaved={vi.fn()} onDelete={vi.fn()} onReloadLatest={vi.fn()} {...props} />;
  return renderWithIntl(ui, client ? {
    wrapper: ({ children }) => <QueryClientProvider client={client}><IntlProvider>{children}</IntlProvider></QueryClientProvider>,
  } : undefined);
}
function newClient() { return new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } }); }
const selectionGraph = (selection: string | null): GenerationGraphSnapshotDto => ({
  ...graph, nodes: [node("selection-node", "generate.image", { selectedOutputAssetId: selection })],
});
const selectionExecution = (id: string, selection: string | null, status: NodeExecutionDto["status"] = "completed") => execution(id, {
  graphNodeId: "selection-node", status, progress: status === "completed" ? 100 : 50,
  selectedOutputAssetId: selection, outputAssetIds: selection ? [selection] : [],
});
const selectionKey = nodeExecutionKeys.list(graph.id, "selection-node");
const currentSelection = () => currentNode("selection-node")?.selectedOutputAssetId;

beforeEach(() => {
  vi.mocked(appToast.error).mockClear();
  vi.resetAllMocks();
  window.localStorage.clear();
  mocks.usePreferences.mockReturnValue(loadedPreferences);
  mocks.saveDefaults.mockResolvedValue(undefined);
  mocks.saveSettings.mockResolvedValue(undefined);
  mocks.useAutosave.mockReturnValue({ status: "saved", version: 3, update: mocks.update, retry: mocks.retry,
    preserveSelection: mocks.preserveSelection, saveNow: mocks.saveNow });
  mocks.saveNow.mockResolvedValue({ status: "saved", version: 3 });
  outputMocks.listExecutions.mockResolvedValue([]);
  outputMocks.cancelExecution.mockResolvedValue(undefined);
  mediaApiMocks.getMediaAsset.mockImplementation(async (id: string) => ({ id, type: "image", url: `/api/media-assets/${id}/content` }));
  outputMocks.listAssets.mockImplementation((ids: readonly string[]) => ids.map(id => ({
    data: { id, type: "image", url: `/api/media-assets/${id}/content` }, isLoading: false, isError: false,
  })));
});

describe("NodeStudioWorkspace", () => {
  it("notifies one localized toast per failure identity without an inline host error, while new failures still notify", () => {
    const view = mount(), before = document(), error = new Error("CONNECTION_INVALID");
    act(() => { studio().services.onError!(error); studio().services.onError!(error); });
    expect(appToast.error).toHaveBeenCalledExactlyOnceWith("노드를 연결하지 못했습니다. 입력과 모델을 확인해 주세요.");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument(); expect(document()).toBe(before);
    act(() => { studio().services.onError!(new Error("CONNECTION_INVALID")); });
    expect(appToast.error).toHaveBeenCalledTimes(2);
    const late = studio().services.onError!; view.unmount(); late(new Error("CONNECTION_INVALID"));
    expect(appToast.error).toHaveBeenCalledTimes(2);
  });

  it("uses safe fallback copy for unknown exceptions and remains quiet for intentional aborts", () => {
    mount();
    act(() => { studio().services.onError!(new Error("SECRET token=https://private.invalid")); studio().services.onError!(new DOMException("cancelled", "AbortError")); });
    expect(appToast.error).toHaveBeenCalledExactlyOnceWith("스페이스 작업을 완료하지 못했습니다. 다시 시도해 주세요.");
    expect(screen.queryByText(/SECRET/)).not.toBeInTheDocument();
  });

  it("reports a failed cancellation once and ignores the same rejection after leaving the workspace", async () => {
    const failure = new Error("CANCEL_FAILED"), pending = deferred<void>();
    outputMocks.listExecutions.mockResolvedValue([execution("active")]); outputMocks.cancelExecution.mockRejectedValueOnce(failure).mockReturnValueOnce(pending.promise);
    const view = mount(repeatGraph(1));
    await act(async () => { await studio().services.cancelNode!("repeat"); });
    expect(appToast.error).toHaveBeenCalledExactlyOnceWith("작업을 취소하지 못했습니다. 다시 시도해 주세요.");
    let late!: Promise<void>;
    act(() => { late = studio().services.cancelNode!("repeat") as Promise<void>; });
    await waitFor(() => expect(outputMocks.cancelExecution).toHaveBeenCalledTimes(2));
    view.unmount(); await act(async () => { pending.reject(new Error("CANCEL_FAILED")); await late; });
    expect(appToast.error).toHaveBeenCalledTimes(1);
  });
  it("keeps Assistant runtime inputs stable when only canvas geometry changes", async () => {
    outputMocks.listExecutions.mockResolvedValue([execution("assistant-result", { graphNodeId: "assistant", executionKind: "assistant",
      mediaType: "text", status: "completed", outputText: "Result", outputItems: [{ id: "item", text: "Selected result" }], selectedItemId: "item" })]);
    mount({ ...graph, nodes: [node("assistant", "generate.assistant")] });
    await waitFor(() => expect(studio().inputRuntime.assistantResults?.assistant).toMatchObject({ text: "Result" }));
    const previous = studio().inputRuntime.assistantResults;
    edit({ type: "node.move", nodeId: "assistant", position: { x: 120, y: 160 } });
    expect(studio().inputRuntime.assistantResults).toBe(previous);
    expect(studio().inputRuntime.assistantResults?.assistant).toBe(previous?.assistant);
  });
  it("keeps newer native edits through a real autosave acknowledgement and sends their next version", async () => {
    const actual = await vi.importActual<typeof import("../hook/use-graph-autosave")>("../hook/use-graph-autosave");
    const first = deferred<GenerationGraphSnapshotDto>(), second = deferred<GenerationGraphSnapshotDto>();
    const save = vi.fn().mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    mocks.useAutosave.mockImplementation(options => actual.useGraphAutosave({ ...options, save }));
    const snapshot = { ...graph, nodes: [node("memo", "note.memo")] };
    const view = mount(snapshot);
    edit({ type: "node.move", nodeId: "memo", position: { x: 30, y: 40 } });
    let prepared!: Promise<number>;
    act(() => { prepared = studio().services.prepareNodeExecution!(); });
    await waitFor(() => expect(save).toHaveBeenCalledOnce());
    const captured = save.mock.calls[0][1];
    edit({ type: "node.move", nodeId: "memo", position: { x: 90, y: 100 } });
    edit({ type: "node.add", node: node("local", "note.memo") });
    await act(async () => { first.resolve({ ...snapshot, ...captured, version: 4 }); });
    expect(studio().session.getSnapshot().version).toBe(4);
    expect(currentNode("memo")?.position).toEqual({ x: 90, y: 100 });
    expect([...studio().session.getSnapshot().persistedNodeIds]).toEqual(["memo"]);
    await waitFor(() => expect(save).toHaveBeenCalledTimes(2));
    expect(save.mock.calls.map(call => call[1].expectedVersion)).toEqual([3, 4]);
    expect(save.mock.calls[1][1].nodes.map((item: { id: string }) => item.id)).toEqual(["memo", "local"]);
    await act(async () => { second.resolve({ ...snapshot, ...save.mock.calls[1][1], version: 5 }); await expect(prepared).resolves.toBe(5); });
    expect([...studio().session.getSnapshot().persistedNodeIds]).toEqual(["memo", "local"]);
    view.unmount();
  });

  it("cancels an explicitly stopped submission once its delayed receipt arrives", async () => {
    const admission = deferred<NodeExecutionDto>();
    outputMocks.listExecutions.mockImplementation(() => new Promise(() => {}));
    outputMocks.startExecution.mockReturnValue(admission.promise);
    mount(repeatGraph(1));
    let pending!: Promise<unknown>;
    act(() => { pending = studio().services.runNode!("repeat") as Promise<unknown>; });
    const rejected = expect(pending).rejects.toMatchObject({ name: "AbortError" });
    await waitFor(() => expect(outputMocks.startExecution).toHaveBeenCalledOnce());
    expect(studio().session.getSnapshot().runtimeByNode.get("repeat")?.submissionPending).toBe(true);
    await act(async () => { await studio().services.cancelNode!("repeat"); });
    expect(outputMocks.cancelExecution).not.toHaveBeenCalled();
    await act(async () => { admission.resolve(execution("late-receipt")); await rejected; });
    expect(outputMocks.cancelExecution).toHaveBeenCalledExactlyOnceWith(graph.id, "repeat", "late-receipt");
    expect(resultSource(document().nodes[1].config)).toMatchObject({ executionId: "late-receipt", state: "pending" });
    expect(studio().session.getSnapshot().runtimeByNode.get("repeat")?.submissionPending).toBe(false);
    expect(outputMocks.startExecution).toHaveBeenCalledOnce();
  });
  it.each(["upload", "reconnect", "delete"] as const)("does not overwrite a result after the user chooses to %s", async action => {
    const history = deferred<NodeExecutionDto[]>();
    outputMocks.listExecutions.mockReturnValue(history.promise);
    const snapshot = repeatGraph(1), appended = appendResultNodes(snapshot, "repeat", "old");
    const view = mount({ ...snapshot, ...appended.draft });
    await waitFor(() => expect(outputMocks.listExecutions).toHaveBeenCalled());
    const id = appended.ids[0];
    if (action === "delete") edit({ type: "node.remove", nodeId: id });
    else if (action === "reconnect") edit({ type: "edge.disconnect", edgeId: appended.draft.edges[0].id });
    else edit({ type: "node.config.patch", nodeId: id, patch: { assetId: "manual" } });
    await act(async () => { history.resolve([execution("old", { status: "completed", outputAssetIds: ["late"] })]); });
    await waitFor(() => expect(studio().session.getSnapshot().runtimeByNode.get("repeat")?.execution?.status).toBe("completed"));
    if (action === "upload") expect(currentNode(id)?.config).toMatchObject({ assetId: "manual", resultSource: { executionId: null, state: "completed" } });
    else if (action === "reconnect") expect(currentNode(id)?.config).toEqual({ assetId: null });
    else expect(currentNode(id)).toBeUndefined();
    expect(document().nodes).toHaveLength(action === "delete" ? 1 : 2);
    expect(outputMocks.startExecution).not.toHaveBeenCalled();
    view.unmount();
  });

  it.each(["image", "video", "audio"] as const)("reserves a connected %s result before saving and pins it to its execution", async type => {
    const client = newClient(), saved = deferred<GraphAutosaveSnapshot>();
    outputMocks.listExecutions.mockImplementation(() => new Promise(() => {}));
    mocks.saveNow.mockReturnValueOnce(saved.promise);
    outputMocks.startExecution.mockImplementation(async () => {
      expect(document().nodes).toHaveLength(2);
      expect(document().nodes[1]).toMatchObject({ kind: `input.${type}`, config: {
        assetId: null, resultSource: { nodeId: "repeat", executionId: null, state: "pending" },
      } });
      expect(document().edges[0]).toMatchObject({ sourceNodeId: "repeat", sourcePortId: type,
        targetNodeId: document().nodes[1].id, targetPortId: type === "image" ? "reference" : type });
      return execution("accepted", { mediaType: type });
    });
    mediaApiMocks.getMediaAsset.mockResolvedValue({ id: "fixed", type, url: "/api/media-assets/fixed/content" });
    const snapshot = { ...repeatGraph(1), nodes: [node("repeat", `generate.${type}`, {
      config: { ...defaultConfigForKind(`generate.${type}`), modelKey: "m" },
    })] };
    const view = mount(snapshot, {}, client);
    let pending!: Promise<NodeExecutionReceipt>;
    act(() => { pending = run("repeat"); });
    await waitFor(() => expect(mocks.saveNow).toHaveBeenCalledOnce());
    expect(outputMocks.startExecution).not.toHaveBeenCalled();
    expect(resultSource(document().nodes[1].config)?.executionId).toBeNull();
    let receipt!: NodeExecutionReceipt;
    await act(async () => { saved.resolve({ status: "saved", version: 9 }); receipt = await pending; });
    expect(outputMocks.startExecution).toHaveBeenCalledExactlyOnceWith(graph.id, "repeat", 9, undefined);
    const id = document().nodes[1].id;
    expect(currentNode(id)?.config).toMatchObject({ resultSource: { executionId: "accepted", state: "pending" } });
    await act(async () => {
      client.setQueryData(nodeExecutionKeys.list(graph.id, "repeat"), [execution("accepted", { mediaType: type, status: "completed", outputAssetIds: ["fixed"] })]);
      await receipt.completion;
    });
    expect(currentNode(id)?.config).toMatchObject({ assetId: "fixed", resultSource: { executionId: "accepted", state: "completed" } });
    expect(mocks.update.mock.lastCall![0]).toEqual(document());
    view.unmount(); client.clear();
  });

  it("preserves earlier results, expands native outputs once and never recreates deleted results", () => {
    let draft = repeatGraph(1);
    const first = appendResultNodes(draft, "repeat");
    draft = { ...draft, ...bindResultNodes(first.draft, first.ids, "old") };
    const completed = { executionId: "old", status: "completed" as const, outputAssetIds: ["one", "two", "three"] };
    draft = { ...draft, ...reconcileResultNodes(draft, "repeat", completed) };
    const { gallery, items } = resultGallery(draft);
    expect(draft.nodes).toHaveLength(2);
    expect(gallery.id).toBe(first.ids[0]);
    expect(items.map(item => item.assetId)).toEqual(["one", "two", "three"]);
    for (const item of draft.nodes.slice(1)) expect(validateNodeConfig(item.kind, item.configVersion, item.config).supported).toBe(true);
    const retained = items.slice(0, 2);
    draft = { ...draft, nodes: draft.nodes.map(item => item.id === gallery.id ? { ...item,
      config: { mediaType: "image", excludedAssetIds: [], resultItems: retained } } : item) };
    expect(reconcileResultNodes(draft, "repeat", completed)).toBe(draft);
    expect(resultGallery(draft).items.map(item => item.id)).toEqual(retained.map(item => item.id));
    const second = appendResultNodes(draft, "repeat", "new");
    const next = reconcileResultNodes(second.draft, "repeat", { executionId: "new", status: "completed", outputAssetIds: ["latest"] });
    expect(resultGallery(next).items.map(item => item.assetId)).toEqual(["one", "two"]);
    expect(next.nodes.find(item => item.id === second.ids[0])?.config).toMatchObject({ assetId: "latest" });
    expect(reconcileResultNodes(next, "repeat", { ...completed, status: "pending", outputAssetIds: [] })).toBe(next);
    expect(reconcileResultNodes({ ...draft, nodes: [draft.nodes[0]], edges: [] }, "repeat", completed).nodes).toHaveLength(1);
    const withoutProducer = { ...draft, nodes: draft.nodes.slice(1), edges: [] };
    expect(reconcileResultNodes(withoutProducer, "repeat", completed)).toBe(withoutProducer);
    expect(resultGallery(withoutProducer).items).toEqual(retained);
  });

  it("creates distinct legacy frame-port results and rejects the node limit before execution", () => {
    const draft = { ...repeatGraph(1), nodes: [node("repeat", "edit.video.extractFrames", { config: { parameters: {} } })] };
    const appended = appendResultNodes(draft, "repeat", "frames");
    const completed = reconcileResultNodes(appended.draft, "repeat", { executionId: "frames", status: "completed", outputAssetIds: ["end", "start"],
      outputBindings: [{ portId: "endFrame", sortOrder: 0, assetId: "end" }, { portId: "startFrame", sortOrder: 0, assetId: "start" }] });
    const { gallery, items } = resultGallery(completed);
    expect(completed.nodes).toHaveLength(2);
    expect(items).toMatchObject([
      { assetId: "start", executionId: "frames", portId: "startFrame", state: "completed" },
      { assetId: "end", executionId: "frames", portId: "endFrame", state: "completed" },
    ]);
    expect(items.map(item => item.id)).toEqual(appended.ids);
    expect(completed.edges.map(edge => [edge.sourcePortId, edge.targetNodeId, edge.targetPortId])).toEqual([
      ["startFrame", gallery.id, "image"], ["endFrame", gallery.id, "image"],
    ]);
    expect(validateNodeConfig(gallery.kind, gallery.configVersion, gallery.config).supported).toBe(true);
    expect(() => appendResultNodes({ ...draft, nodes: Array.from({ length: 500 }, (_, index) => node(index === 0 ? "repeat" : `n-${index}`, "edit.video.extractFrames")) }, "repeat"))
      .toThrow("RESULT_NODE_LIMIT_EXCEEDED");
  });

  it("keeps failed result reservations visible when admission fails without a receipt", async () => {
    outputMocks.startExecution.mockRejectedValue(new Error("QUEUE_FULL"));
    mount(repeatGraph());
    await act(async () => { await expect(studio().services.runNode!("repeat")).rejects.toThrow("QUEUE_FULL"); });
    const { items } = resultGallery();
    expect(document().nodes).toHaveLength(2);
    expect(items).toEqual(Array.from({ length: 4 }, () => expect.objectContaining({
      assetId: null, executionId: null, state: "failed", nodeId: "repeat", portId: "image",
    })));
    expect(unsubmittedResultIds(document())).toEqual([]);
    expect(outputMocks.startExecution).toHaveBeenCalledOnce();
  });

  it("does not submit when reserving results exceeds the graph limit", async () => {
    const snapshot = repeatGraph();
    snapshot.nodes.push(...Array.from({ length: 499 }, (_, index) => node(`memo-${index}`, "note.memo")));
    mount(snapshot);
    await act(async () => { await expect(studio().services.runNode!("repeat")).rejects.toThrow("RESULT_NODE_LIMIT_EXCEEDED"); });
    expect(document().nodes).toHaveLength(500);
    expect(mocks.saveNow).not.toHaveBeenCalled();
    expect(outputMocks.startExecution).not.toHaveBeenCalled();
  });

  it("recovers the exact pending result on reload while ignoring newer successful history", async () => {
    const snapshot = repeatGraph(1), appended = appendResultNodes(snapshot, "repeat", "old");
    outputMocks.listExecutions.mockResolvedValue([
      execution("new", { status: "completed", outputAssetIds: ["latest"], selectedOutputAssetId: "latest" }),
      execution("old", { status: "completed", outputAssetIds: ["fixed"] }),
    ]);
    mount({ ...snapshot, ...appended.draft });
    await waitFor(() => expect(currentNode(appended.ids[0])?.config).toMatchObject({
      assetId: "fixed", resultSource: { executionId: "old", state: "completed" },
    }));
    expect(inputs().sourceAssetIds(appended.ids[0], "image")).toEqual(["fixed"]);
    expect(currentNode("repeat")?.selectedOutputAssetId).toBe("latest");
    expect(outputMocks.startExecution).not.toHaveBeenCalled();
  });

  it("preserves both durable frame bindings without copied history and clears them together", async () => {
    mount({ ...graph, nodes: [node("frames", "edit.video.extractFrames", { selectedOutputAssetId: "start" })], outputBindings: [
      { graphNodeId: "frames", portId: "startFrame", sortOrder: 0, assetId: "start" },
      { graphNodeId: "frames", portId: "endFrame", sortOrder: 0, assetId: "end" },
    ] });
    await waitFor(() => expect(studio().inputRuntime.mediaOutputs?.get("frames")).toEqual([
      { portId: "startFrame", sortOrder: 0, assetId: "start" }, { portId: "endFrame", sortOrder: 0, assetId: "end" },
    ]));
    expect(inputs().sourceAssetIds("frames", "startFrame")).toEqual(["start"]);
    expect(inputs().sourceAssetIds("frames", "endFrame")).toEqual(["end"]);
    edit({ type: "output.clear", nodeId: "frames" });
    expect(currentNode("frames")?.selectedOutputAssetId).toBeNull();
    await waitFor(() => expect(studio().inputRuntime.mediaOutputs?.get("frames") ?? []).toEqual([]));
    expect(inputs().sourceAssetIds("frames", "startFrame")).toEqual([]);
    expect(inputs().sourceAssetIds("frames", "endFrame")).toEqual([]);
  });

  it("ignores cached selection on re-entry and accepts a fresh changed selection for the same execution", async () => {
    const client = newClient(), history = deferred<NodeExecutionDto[]>();
    client.setQueryData(selectionKey, [selectionExecution("e1", "stale-result")]);
    outputMocks.listExecutions.mockReturnValueOnce(history.promise);
    const view = mount(selectionGraph(null), {}, client);
    await waitFor(() => expect(outputMocks.listExecutions).toHaveBeenCalled());
    expect(currentSelection()).toBeNull();
    await act(async () => { history.resolve([selectionExecution("e1", null)]); });
    expect(currentSelection()).toBeNull();
    expect(mocks.update).not.toHaveBeenCalled();
    outputMocks.listExecutions.mockResolvedValue([selectionExecution("e1", "fresh-selection")]);
    await act(async () => { await client.invalidateQueries({ queryKey: selectionKey }); });
    expect(currentSelection()).toBe("fresh-selection");
    expect(mocks.preserveSelection).not.toHaveBeenCalled();
    view.unmount(); client.clear();
  });

  it("preserves A→B→A intent during the first delayed execution read", async () => {
    const client = newClient(), history = deferred<NodeExecutionDto[]>();
    outputMocks.listExecutions.mockReturnValueOnce(history.promise);
    const view = mount(selectionGraph("A"), {}, client);
    await waitFor(() => expect(outputMocks.listExecutions).toHaveBeenCalled());
    edit({ type: "output.select", nodeId: "selection-node", assetId: "B" });
    edit({ type: "output.select", nodeId: "selection-node", assetId: "A" });
    await act(async () => { history.resolve([selectionExecution("e1", "C")]); });
    await waitFor(() => expect(studio().session.getSnapshot().runtimeByNode.get("selection-node")?.execution?.status).toBe("completed"));
    expect(currentSelection()).toBe("A");
    expect(mocks.preserveSelection).toHaveBeenCalledWith("selection-node");
    outputMocks.listExecutions.mockResolvedValue([selectionExecution("e1", "C")]);
    await act(async () => { await client.invalidateQueries({ queryKey: selectionKey }); });
    expect(currentSelection()).toBe("A");
    view.unmount(); client.clear();
  });

  it("retains user intent when the initial history read fails and is retried", async () => {
    const client = newClient(), history = deferred<NodeExecutionDto[]>();
    outputMocks.listExecutions.mockReturnValueOnce(history.promise);
    const view = mount(selectionGraph("A"), {}, client);
    await waitFor(() => expect(outputMocks.listExecutions).toHaveBeenCalled());
    edit({ type: "output.select", nodeId: "selection-node", assetId: "B" });
    edit({ type: "output.select", nodeId: "selection-node", assetId: "A" });
    await act(async () => { history.reject(new Error("network interrupted")); });
    await waitFor(() => expect(client.getQueryState(selectionKey)?.status).toBe("error"));
    outputMocks.listExecutions.mockResolvedValue([selectionExecution("e1", "C")]);
    await act(async () => { await client.invalidateQueries({ queryKey: selectionKey }); });
    expect(currentSelection()).toBe("A");
    expect(mocks.preserveSelection).toHaveBeenCalledWith("selection-node");
    view.unmount(); client.clear();
  });

  it("ignores a late cancelled history read after a newer read has selected another result", async () => {
    const client = newClient(), oldRead = deferred<NodeExecutionDto[]>();
    outputMocks.listExecutions.mockReturnValueOnce(oldRead.promise);
    const view = mount(selectionGraph("A"), {}, client);
    await waitFor(() => expect(outputMocks.listExecutions).toHaveBeenCalledOnce());
    await act(async () => { await client.cancelQueries({ queryKey: selectionKey }); });
    outputMocks.listExecutions.mockResolvedValue([selectionExecution("new", "B")]);
    await act(async () => { await client.invalidateQueries({ queryKey: selectionKey }); });
    expect(currentSelection()).toBe("B");
    await act(async () => { oldRead.resolve([selectionExecution("old", "C")]); });
    expect(currentSelection()).toBe("B");
    await waitFor(() => expect(studio().session.getSnapshot().runtimeByNode.get("selection-node")?.execution?.executionId).toBe("new"));
    view.unmount(); client.clear();
  });

  it("observes successive external executions without submitting them locally", async () => {
    const client = newClient();
    outputMocks.listExecutions.mockResolvedValue([selectionExecution("e1", "A", "processing")]);
    const view = mount(selectionGraph("A"), {}, client);
    await waitFor(() => expect(client.getQueryData(selectionKey)).toBeDefined());
    const changes = [["e1", "B", "completed"], ["e2", "B", "processing"], ["e2", "C", "completed"]] as const;
    for (const [id, selection, status] of changes) {
      outputMocks.listExecutions.mockResolvedValue([selectionExecution(id, selection, status)]);
      await act(async () => { await client.invalidateQueries({ queryKey: selectionKey }); });
      await waitFor(() => expect(currentSelection()).toBe(selection));
    }
    expect(outputMocks.startExecution).not.toHaveBeenCalled();
    expect(mocks.preserveSelection).not.toHaveBeenCalled();
    view.unmount(); client.clear();
  });

  it("waits for every sequential repetition, preserves partial results and blocks duplicate Run", async () => {
    const client = newClient(), rows: NodeExecutionDto[] = [];
    outputMocks.listExecutions.mockImplementation(async () => [...rows]);
    outputMocks.startExecution.mockImplementation(async (_graphId, _nodeId, _version, repeat) => {
      const { gallery, items } = resultGallery();
      expect(document().nodes).toHaveLength(2);
      expect(items).toHaveLength(4);
      expect(document().edges).toHaveLength(1);
      expect(document().edges[0]).toMatchObject({ sourceNodeId: "repeat", sourcePortId: "image", targetNodeId: gallery.id, targetPortId: "image" });
      const index = rows.length;
      expect(repeat).toEqual(index === 0 ? undefined : { repeatOfExecutionId: "run-0", repeatIndex: index });
      if (index > 0) expect(rows[0].status).not.toBe("pending");
      const row = execution(`run-${index}`);
      rows.unshift(row);
      return row;
    });
    const view = mount(repeatGraph(), {}, client);
    let receipt!: NodeExecutionReceipt;
    await act(async () => { receipt = await run("repeat"); });
    const { gallery: reserved, items: reservations } = resultGallery();
    const reservedIds = reservations.map(item => item.id), position = reserved.position, edges = document().edges;
    expect(reservations.map(item => item.state)).toEqual(["pending", "pending", "pending", "pending"]);
    expect(reservations.map(item => item.executionId)).toEqual(["run-0", null, null, null]);
    const complete = vi.fn(); void receipt.completion.then(complete);
    await act(async () => { await expect(studio().services.runNode!("repeat")).rejects.toThrow("NODE_GENERATION_ACTIVE"); });
    for (let index = 0; index < 4; index++) {
      await waitFor(() => expect(outputMocks.startExecution).toHaveBeenCalledTimes(index + 1));
      expect(complete).not.toHaveBeenCalled();
      await act(async () => {
        rows[0] = { ...rows[0], status: index === 1 ? "failed" : "completed",
          outputAssetIds: index === 1 ? [] : [`asset-${index}`], errorCode: index === 1 ? "GENERATION_FAILED" : null };
        client.setQueryData(nodeExecutionKeys.list(graph.id, "repeat"), [...rows]);
      });
    }
    await act(async () => { await receipt.completion; });
    expect(complete).toHaveBeenCalledOnce();
    expect(studio().session.getSnapshot().runtimeByNode.get("repeat")?.repeatProgress).toEqual({ completed: 4, failed: 1, total: 4, running: false });
    const { gallery, items: outputs } = resultGallery();
    expect(document().nodes).toHaveLength(2);
    expect(gallery.id).toBe(reserved.id);
    expect(gallery.position).toEqual(position);
    expect(document().edges).toEqual(edges);
    expect(outputs.map(item => item.id)).toEqual(reservedIds);
    expect(outputs.map(item => item.assetId)).toEqual(["asset-0", null, "asset-2", "asset-3"]);
    expect(outputs.map(item => item.executionId)).toEqual(["run-0", "run-1", "run-2", "run-3"]);
    expect(outputs.map(item => item.state)).toEqual(["completed", "failed", "completed", "completed"]);
    expect(outputs[1]).toMatchObject({ executionId: "run-1", state: "failed" });
    expect(unsubmittedResultIds(document())).toEqual([]);
    expect(outputMocks.startExecution.mock.calls.slice(1).map(call => call[3])).toEqual([1, 2, 3].map(repeatIndex => ({ repeatOfExecutionId: "run-0", repeatIndex })));
    view.unmount(); client.clear();
  });

  it.each(["input", "delete", "unmount"] as const)("stops unsubmitted repetitions on %s", async scenario => {
    outputMocks.listExecutions.mockImplementation(() => new Promise(() => {}));
    outputMocks.startExecution.mockResolvedValue(execution("root"));
    const view = mount(repeatGraph());
    const session = studio().session;
    let receipt!: NodeExecutionReceipt;
    await act(async () => { receipt = await run("repeat"); });
    const { gallery: reserved, items: reservations } = resultGallery();
    if (scenario === "unmount") view.unmount();
    else if (scenario === "delete") edit({ type: "node.remove", nodeId: "repeat" });
    else edit({ type: "node.config.patch", nodeId: "repeat", patch: { prompt: "changed" } });
    await act(async () => { await expect(receipt.completion).rejects.toMatchObject({ name: "AbortError" }); });
    expect(outputMocks.startExecution).toHaveBeenCalledOnce();
    const { gallery, items: stopped } = resultGallery(session.getDocument());
    expect(gallery.id).toBe(reserved.id);
    expect(stopped.map(item => item.id)).toEqual(reservations.map(item => item.id));
    expect(stopped).toHaveLength(4);
    expect(stopped.map(item => item.assetId)).toEqual([null, null, null, null]);
    if (scenario === "delete") {
      expect(session.getDocument().nodes.map(item => item.id)).toEqual([reserved.id]);
      expect(session.getDocument().edges).toEqual([]);
      expect(stopped.map(item => ({ executionId: item.executionId, state: item.state }))).toEqual(Array.from({ length: 4 }, () => ({ executionId: null, state: "cancelled" })));
    } else {
      expect(stopped).toMatchObject([
        { executionId: "root", state: "pending" }, { executionId: null, state: "cancelled" },
        { executionId: null, state: "cancelled" }, { executionId: null, state: "cancelled" },
      ]);
    }
    expect(unsubmittedResultIds(session.getDocument())).toEqual([]);
    view.unmount();
  });

  it("cancels the accepted run and stops the remaining repetitions without submitting them", async () => {
    outputMocks.listExecutions.mockImplementation(() => new Promise(() => {}));
    outputMocks.startExecution.mockResolvedValue(execution("root"));
    mount(repeatGraph());
    let receipt!: NodeExecutionReceipt;
    await act(async () => { receipt = await run("repeat"); });
    const aborted = expect(receipt.completion).rejects.toMatchObject({ name: "AbortError" });
    outputMocks.listExecutions.mockResolvedValue([execution("root", { status: "cancelled" })]);
    await act(async () => { await studio().services.cancelNode!("repeat"); });
    await aborted;
    expect(outputMocks.cancelExecution).toHaveBeenCalledExactlyOnceWith(graph.id, "repeat", "root");
    expect(outputMocks.startExecution).toHaveBeenCalledOnce();
    const { items } = resultGallery();
    expect(items).toHaveLength(4);
    expect(items[0].executionId).toBe("root");
    expect(items.slice(1).map(item => ({ executionId: item.executionId, state: item.state }))).toEqual([
      { executionId: null, state: "cancelled" }, { executionId: null, state: "cancelled" }, { executionId: null, state: "cancelled" },
    ]);
    expect(unsubmittedResultIds(document())).toEqual([]);
  });

  it("stops reservations without receipts on reload and keeps accepted execution identity", () => {
    const reserved = appendResultNodes(repeatGraph(1), "repeat"), accepted = appendResultNodes(reserved.draft, "repeat", "accepted");
    outputMocks.listExecutions.mockImplementation(() => new Promise(() => {}));
    mount({ ...repeatGraph(1), ...accepted.draft });
    expect(resultSource(document().nodes[1].config)).toMatchObject({ executionId: null, state: "cancelled" });
    expect(resultSource(document().nodes[2].config)).toMatchObject({ executionId: "accepted", state: "pending" });
    expect(outputMocks.startExecution).not.toHaveBeenCalled();
  });

  it("cancels only unreceipted Gallery slots on reload while retaining the accepted slot", () => {
    const reserved = reserveResultNodes(repeatGraph(), "repeat", 4);
    const accepted = bindResultNodes(reserved.draft, reserved.groups[0], "accepted");
    outputMocks.listExecutions.mockImplementation(() => new Promise(() => {}));
    mount({ ...repeatGraph(), ...accepted });
    const { items } = resultGallery();
    expect(items.map(item => item.id)).toEqual(reserved.groups.flat());
    expect(items).toMatchObject([
      { executionId: "accepted", state: "pending" }, { executionId: null, state: "cancelled" },
      { executionId: null, state: "cancelled" }, { executionId: null, state: "cancelled" },
    ]);
    expect(unsubmittedResultIds(document())).toEqual([]);
    expect(outputMocks.startExecution).not.toHaveBeenCalled();
  });

  it("preserves an accepted receipt when saving its binding fails and stops the other reservations", async () => {
    mocks.saveNow.mockResolvedValueOnce({ status: "saved", version: 4 }).mockRejectedValueOnce(new Error("SAVE_FAILED"))
      .mockResolvedValue({ status: "saved", version: 5 });
    outputMocks.startExecution.mockResolvedValue(execution("accepted"));
    outputMocks.listExecutions.mockImplementation(() => new Promise(() => {}));
    mount(repeatGraph());
    await act(async () => { await expect(studio().services.runNode!("repeat")).rejects.toThrow("SAVE_FAILED"); });
    expect(resultGallery().items).toMatchObject([
      { executionId: "accepted", state: "pending" }, { executionId: null, state: "failed" },
      { executionId: null, state: "failed" }, { executionId: null, state: "failed" },
    ]);
    expect(outputMocks.startExecution).toHaveBeenCalledOnce();
  });

  it("returns server acceptance while history is stalled and stops observing on unmount", async () => {
    outputMocks.listExecutions.mockImplementation(() => new Promise(() => {}));
    outputMocks.startExecution.mockResolvedValue(execution("accepted", { graphNodeId: "remote", mediaType: "video" }));
    const view = mount({ ...graph, nodes: [node("remote", "generate.video")] });
    let receipt!: NodeExecutionReceipt;
    await act(async () => { receipt = await run("remote"); });
    expect(receipt.executionId).toBe("accepted");
    expect(outputMocks.startExecution).toHaveBeenCalledOnce();
    view.unmount();
    await expect(receipt.completion).rejects.toMatchObject({ name: "AbortError" });
  });

  it("reconciles a supported server operation independently of its submission receipt", async () => {
    let started = false;
    const pending = execution("server-operation", { graphNodeId: "trim", executionKind: "media_operation", mediaType: "video" });
    const completed = { ...pending, status: "completed" as const, progress: 100, outputAssetIds: ["server-output"], selectedOutputAssetId: "server-output" };
    outputMocks.startExecution.mockImplementation(async () => { started = true; return pending; });
    outputMocks.listExecutions.mockImplementation(async () => started ? [completed] : []);
    mediaApiMocks.getMediaAsset.mockResolvedValue({ id: "server-output", type: "video", url: "/api/media-assets/server-output/content" });
    mount({ ...graph, nodes: [node("source", "input.video", { config: { assetId: "source-asset" } }), node("trim", "edit.video.trim", { position: { x: 300, y: 0 } })],
      edges: [{ id: "input", sourceNodeId: "source", sourcePortId: "video", targetNodeId: "trim", targetPortId: "video", sortOrder: 0 }] });
    let receipt!: NodeExecutionReceipt;
    await act(async () => { receipt = await run("trim"); });
    expect(receipt.executionId).toBe("server-operation");
    await act(async () => { await receipt.completion; });
    expect(mediaApiMocks.getMediaAsset).toHaveBeenCalledWith("server-output", expect.any(AbortSignal));
    expect(currentNode("trim")?.selectedOutputAssetId).toBe("server-output");
    expect(document().nodes[2].config).toMatchObject({ assetId: "server-output", resultSource: { nodeId: "trim", executionId: "server-operation", state: "completed" } });
    expect(outputMocks.runImage).not.toHaveBeenCalled();
  });

  it("keeps a user's representative selection while completing the exact result input", async () => {
    const client = newClient();
    outputMocks.listExecutions.mockImplementation(() => new Promise(() => {}));
    outputMocks.startExecution.mockResolvedValue(execution("accepted"));
    const view = mount(repeatGraph(1), {}, client);
    let receipt!: NodeExecutionReceipt;
    await act(async () => { receipt = await run("repeat"); });
    const resultId = document().nodes[1].id;
    edit({ type: "output.select", nodeId: "repeat", assetId: "manual" });
    await act(async () => {
      client.setQueryData(nodeExecutionKeys.list(graph.id, "repeat"), [execution("accepted", { status: "completed", outputAssetIds: ["fixed"], selectedOutputAssetId: "fixed" })]);
      await receipt.completion;
    });
    expect(currentNode("repeat")?.selectedOutputAssetId).toBe("manual");
    expect(currentNode(resultId)?.config).toMatchObject({ assetId: "fixed", resultSource: { executionId: "accepted", state: "completed" } });
    view.unmount(); client.clear();
  });

  it("never recreates a result input deleted after server acceptance", async () => {
    const client = newClient();
    outputMocks.listExecutions.mockImplementation(() => new Promise(() => {}));
    outputMocks.startExecution.mockResolvedValue(execution("accepted"));
    const view = mount(repeatGraph(1), {}, client);
    let receipt!: NodeExecutionReceipt;
    await act(async () => { receipt = await run("repeat"); });
    edit({ type: "node.remove", nodeId: document().nodes[1].id });
    await act(async () => {
      client.setQueryData(nodeExecutionKeys.list(graph.id, "repeat"), [execution("accepted", { status: "completed", outputAssetIds: ["one", "two"] })]);
      await receipt.completion;
    });
    expect(document().nodes.map(item => item.id)).toEqual(["repeat"]);
    expect(document().edges).toEqual([]);
    view.unmount(); client.clear();
  });

  it.each(["unmount", "pagehide"] as const)("aborts only this workspace's browser operation on %s", async event => {
    outputMocks.startExecution.mockResolvedValue({ ...execution("owned-operation", { graphNodeId: "resize", executionKind: "media_operation" }), plan: { kind: "edit.image.resize" } });
    let operationSignal: AbortSignal | undefined;
    outputMocks.runImage.mockImplementation(({ signal }: { signal: AbortSignal }) => {
      operationSignal = signal;
      return new Promise((_resolve, reject) => signal.addEventListener("abort", () => reject(new DOMException("cancelled", "AbortError")), { once: true }));
    });
    const view = mount({ ...graph, nodes: [node("resize", "edit.image.resize")] });
    let running!: Promise<unknown>;
    act(() => { running = studio().services.runNode!("resize") as Promise<unknown>; });
    const rejected = expect(running).rejects.toMatchObject({ name: "AbortError" });
    await waitFor(() => expect(operationSignal).toBeDefined());
    await act(async () => {
      if (event === "unmount") view.unmount();
      else window.dispatchEvent(new Event("pagehide"));
      await rejected;
    });
    expect(operationSignal?.aborted).toBe(true);
    expect(outputMocks.cancelExecution).not.toHaveBeenCalled();
  });

  it("does not restart or cancel a restored active browser operation on mount", async () => {
    outputMocks.listExecutions.mockResolvedValue([execution("other-tab-operation", { graphNodeId: "resize", executionKind: "media_operation", status: "processing" })]);
    const view = mount({ ...graph, nodes: [node("resize", "edit.image.resize")] });
    await waitFor(() => expect(studio().session.getSnapshot().runtimeByNode.get("resize")?.execution?.executionId).toBe("other-tab-operation"));
    view.unmount();
    expect(outputMocks.startExecution).not.toHaveBeenCalled();
    expect(outputMocks.runImage).not.toHaveBeenCalled();
    expect(outputMocks.cancelExecution).not.toHaveBeenCalled();
  });

  it("keeps a cleared output empty while its successful history remains available", async () => {
    const client = newClient();
    outputMocks.listExecutions.mockResolvedValue([execution("execution-1", { graphNodeId: "trim", executionKind: "media_operation", mediaType: "video", status: "completed", outputAssetIds: ["latest-output"] })]);
    const view = mount({ ...graph, nodes: [node("trim", "edit.video.trim", { selectedOutputAssetId: "selected-output" })] }, {}, client);
    await waitFor(() => expect(studio().session.getSnapshot().runtimeByNode.get("trim")?.execution?.status).toBe("completed"));
    expect(inputs().sourceAssetIds("trim", "video")).toEqual(["selected-output"]);
    edit({ type: "output.clear", nodeId: "trim" });
    await act(async () => { await client.invalidateQueries({ queryKey: nodeExecutionKeys.list(graph.id, "trim") }); });
    expect(currentNode("trim")?.selectedOutputAssetId).toBeNull();
    expect(inputs().sourceAssetIds("trim", "video")).toEqual([]);
    expect(client.getQueryData<NodeExecutionDto[]>(nodeExecutionKeys.list(graph.id, "trim"))?.[0].outputAssetIds).toEqual(["latest-output"]);
    view.unmount(); client.clear();
  });

  it("opens a v2 graph as a canonical v3 document without writing on mount", () => {
    mount({ ...graph, schemaVersion: 2, minimumWriterVersion: 2, nodes: [node("image", "input.image", { config: { assetId: "existing" } })] });
    expect(document()).toMatchObject({ schemaVersion: 3, groups: [], nodes: [{ id: "image", config: { assetId: "existing" } }] });
    expect(mocks.useAutosave).toHaveBeenCalledWith(expect.objectContaining({ initialDraft: document(), initialVersion: graph.version }));
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("publishes a repeated move once and keeps transient interactions out of autosave", () => {
    mount({ ...graph, nodes: [node("image", "input.image")] });
    const session = studio().session;
    act(() => {
      session.select(["image"]); session.hover("image"); session.setViewport({ x: 100, y: 200, zoom: 0.7 });
    });
    expect(mocks.update).not.toHaveBeenCalled();
    act(() => {
      for (let index = 0; index < 64; index++) expect(session.dispatch({ type: "node.move", nodeId: "image", position: { x: 180, y: 240 } }).ok).toBe(true);
    });
    expect(studio().session).toBe(session);
    expect(currentNode("image")?.position).toEqual({ x: 180, y: 240 });
    expect(mocks.update).toHaveBeenCalledExactlyOnceWith(session.getDocument());
  });

  it("acknowledges saved version and persisted IDs while retaining newer local edits", () => {
    const saved = vi.fn();
    mount({ ...graph, nodes: [node("image", "input.image")] }, { onSaved: saved });
    edit({ type: "node.move", nodeId: "image", position: { x: 30, y: 40 } });
    const captured = document();
    edit({ type: "node.move", nodeId: "image", position: { x: 90, y: 100 } });
    edit({ type: "node.add", node: node("new-local", "note.memo") });
    const options = mocks.useAutosave.mock.lastCall![0] as { onSaved: (snapshot: GenerationGraphSnapshotDto) => void };
    const response: GenerationGraphSnapshotDto = { ...graph, ...captured, version: 8 };
    act(() => options.onSaved(response));
    expect(studio().session.getSnapshot().version).toBe(8);
    expect([...studio().session.getSnapshot().persistedNodeIds]).toEqual(["image"]);
    expect(currentNode("image")?.position).toEqual({ x: 90, y: 100 });
    expect(currentNode("new-local")).toBeDefined();
    expect(saved).toHaveBeenCalledExactlyOnceWith(response);
  });

  it("rejects edits and execution in a read-only workspace", async () => {
    mount({ ...repeatGraph(1), writable: false, readOnlyReason: "READ_ONLY" });
    expect(studio().session.getSnapshot().writable).toBe(false);
    act(() => { expect(studio().session.dispatch({ type: "title.set", title: "changed" })).toMatchObject({ ok: false, code: "READ_ONLY" }); });
    await act(async () => { await expect(studio().services.runNode!("repeat")).rejects.toThrow(); });
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.saveNow).not.toHaveBeenCalled();
    expect(outputMocks.startExecution).not.toHaveBeenCalled();
  });

  it("supplies the latest completed save version before node execution", async () => {
    mocks.saveNow.mockResolvedValue({ status: "saved", version: 12 });
    mount();
    await expect(studio().services.prepareNodeExecution!()).resolves.toBe(12);
    expect(mocks.saveNow).toHaveBeenCalledOnce();
  });

  it("writes title and canvas settings through the workspace's header actions", async () => {
    mount();
    act(() => header().onTitleChange("Renamed"));
    expect(document().title).toBe("Renamed");
    expect(mocks.update.mock.lastCall![0].title).toBe("Renamed");
    const settings: SpaceCanvasSettings = { panMode: "middleMouse", zoomMode: "ctrlScroll", selectionMode: "shiftDrag" };
    act(() => header().onCanvasSettingsChange(settings));
    expect(studio().canvasSettings).toEqual(settings);
    expect(window.localStorage.getItem("node-studio.canvas-settings")).toBe(JSON.stringify(settings));
  });

  it("persists a header defaults reset through the owner's preferences", async () => {
    mocks.usePreferences.mockReturnValue({ ...loadedPreferences, data: { ...loadedPreferences.data,
      defaults: { image: { modelKey: "previous-image", parameters: { steps: 8 } } },
    } });
    mount();
    expect(header().nodeDefaults).toEqual({ image: "previous-image" });
    await act(async () => { await header().onSaveSettings({ defaults: {} }); });
    expect(mocks.saveSettings).toHaveBeenCalledExactlyOnceWith({ defaults: {} });
  });

  it("updates canonical comment read state without a graph write", async () => {
    const user = userEvent.setup();
    mount({ ...graph, nodes: [node("commented", "input.image", { config: {
      assetId: null, presentation: { comment: "Review this image" },
    } })] });
    expect(mocks.comments.mock.lastCall![0]).toMatchObject({ count: 1, unreadCount: 1 });
    await user.click(screen.getByRole("button", { name: "Navigate comments" }));
    expect(mocks.comments.mock.lastCall![0]).toMatchObject({ count: 1, unreadCount: 0 });
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("waits for saving before the brand back button leaves", async () => {
    const user = userEvent.setup(), onBack = vi.fn(), saved = deferred<GraphAutosaveSnapshot>();
    mocks.saveNow.mockReturnValue(saved.promise);
    mount(graph, { onBack });
    const back = screen.getByRole("button", { name: "스페이스 목록으로" });
    await user.click(back);
    expect(onBack).not.toHaveBeenCalled();
    expect(back).toBeDisabled();
    await act(async () => { saved.resolve({ status: "saved", version: 4 }); });
    expect(onBack).toHaveBeenCalledOnce();
  });

  it.each(["dirty", "saving"] as const)("saves before selecting another Space while %s", async status => {
    const user = userEvent.setup(), select = vi.fn(), saved = deferred<GraphAutosaveSnapshot>();
    mocks.useAutosave.mockReturnValue({ status, version: 3, update: mocks.update, retry: mocks.retry, preserveSelection: mocks.preserveSelection, saveNow: mocks.saveNow });
    mocks.saveNow.mockReturnValue(saved.promise);
    mount(graph, { graphs: [graph, { ...graph, id: "graph-b", title: "Graph B" }], onSelectGraph: select });
    await user.click(screen.getByRole("button", { name: "Graph B" }));
    expect(select).not.toHaveBeenCalled();
    await act(async () => { saved.resolve({ status: "saved", version: 4 }); });
    expect(select).toHaveBeenCalledExactlyOnceWith("graph-b");
  });

  it("retains the selected Space after failed save until explicit discard", async () => {
    const user = userEvent.setup(), select = vi.fn();
    mocks.saveNow.mockRejectedValue(new Error("conflict"));
    mount(graph, { graphs: [graph, { ...graph, id: "graph-b", title: "Graph B" }], onSelectGraph: select });
    await user.click(screen.getByRole("button", { name: "Graph B" }));
    expect(select).not.toHaveBeenCalled();
    await user.click(within(screen.getByRole("alertdialog", { name: "스페이스에서 나갈까요?" })).getByRole("button", { name: "변경 사항을 버리고 나가기" }));
    expect(select).toHaveBeenCalledExactlyOnceWith("graph-b");
  });

  it("does not discard failed saves without explicit confirmation", async () => {
    const user = userEvent.setup(), onBack = vi.fn();
    mocks.saveNow.mockRejectedValue(new Error("conflict"));
    mount(graph, { onBack });
    await user.click(screen.getByRole("button", { name: "스페이스 목록으로" }));
    expect(onBack).not.toHaveBeenCalled();
    const dialog = screen.getByRole("alertdialog", { name: "스페이스에서 나갈까요?" });
    await user.click(within(dialog).getByRole("button", { name: "취소" }));
    expect(onBack).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "스페이스 목록으로" }));
    await user.click(within(screen.getByRole("alertdialog", { name: "스페이스에서 나갈까요?" })).getByRole("button", { name: "변경 사항을 버리고 나가기" }));
    expect(onBack).toHaveBeenCalledOnce();
  });

  it("requires explicit discard before creating a space after a save conflict", async () => {
    const user = userEvent.setup(), create = vi.fn();
    mocks.saveNow.mockRejectedValue(new Error("conflict"));
    mount(graph, { onCreateGraph: create });
    await user.click(screen.getByRole("button", { name: "New space" }));
    expect(create).not.toHaveBeenCalled();
    await user.click(within(screen.getByRole("alertdialog", { name: "스페이스에서 나갈까요?" })).getByRole("button", { name: "변경 사항을 버리고 나가기" }));
    expect(create).toHaveBeenCalledExactlyOnceWith("Untitled Space");
  });

  it("shows a save conflict and reloads the latest snapshot only after confirmation", async () => {
    const user = userEvent.setup(), reload = vi.fn();
    mocks.useAutosave.mockReturnValue({ status: "conflict", version: 3, update: mocks.update, retry: mocks.retry,
      preserveSelection: mocks.preserveSelection, saveNow: mocks.saveNow });
    mount(graph, { onReloadLatest: reload });
    expect(screen.getByRole("status")).toHaveTextContent("새 버전이 있습니다");
    await user.click(screen.getByRole("button", { name: "Save space" }));
    expect(reload).not.toHaveBeenCalled();
    await user.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "다시 불러오기" }));
    expect(reload).toHaveBeenCalledOnce();
    expect(mocks.saveNow).not.toHaveBeenCalled();
  });

  it("retries a failed save from the header without discarding the current document", async () => {
    const user = userEvent.setup();
    mocks.useAutosave.mockReturnValue({ status: "error", version: 3, update: mocks.update, retry: mocks.retry,
      preserveSelection: mocks.preserveSelection, saveNow: mocks.saveNow });
    mount({ ...graph, nodes: [node("local", "note.memo")] });
    await user.click(screen.getByRole("button", { name: "Save space" }));
    expect(mocks.retry).toHaveBeenCalledOnce();
    expect(currentNode("local")).toBeDefined();
    expect(mocks.saveNow).not.toHaveBeenCalled();
  });

  it("does not delete a Space before confirmation", async () => {
    const user = userEvent.setup(), remove = vi.fn();
    mount(graph, { onDelete: remove });
    await user.click(screen.getByRole("button", { name: "Delete space" }));
    expect(remove).not.toHaveBeenCalled();
    await user.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "삭제" }));
    expect(remove).toHaveBeenCalledOnce();
  });
});
