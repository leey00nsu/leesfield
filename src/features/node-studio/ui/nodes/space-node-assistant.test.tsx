import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NextIntlClientProvider } from "next-intl";
import type { HTMLAttributes, ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CanonicalEdge, CanonicalNode } from "@/shared/generation-graph/canonical-graph";
import english from "@/shared/i18n/messages/en.json";
import type { MediaAssetDto } from "@/shared/media-assets/media-asset-contract";
import { mediaAssetKeys } from "@/features/media-assets/hook/use-media-assets";
import { nodeExecutionKeys } from "../../hook/use-node-executions";
import type { NodeExecutionDto } from "../../model/node-execution-types";
import type { SpaceInputRuntime } from "../../model/space-editor-inputs";
import { createSpaceEditorSession, type SpaceEditorSession } from "../../model/space-editor-store";
import { SpaceEditorProvider, type SpaceEditorCatalog, type SpaceEditorServices } from "../space-editor-provider";
import { SpaceAssistantNode } from "./space-node-assistant";

const mocks = vi.hoisted(() => ({
  list: vi.fn(), select: vi.fn(), start: vi.fn(), cancel: vi.fn(), getAsset: vi.fn(),
  copied: vi.fn(), error: vi.fn(), updateInternals: vi.fn(),
}));
vi.mock("../../api/node-execution-api", async importOriginal => ({
  ...await importOriginal<typeof import("../../api/node-execution-api")>(),
  listNodeExecutions: mocks.list, updateNodeExecution: mocks.select,
  startNodeExecution: mocks.start, cancelNodeExecution: mocks.cancel,
}));
vi.mock("@/features/media-assets/api/media-asset-api", async importOriginal => ({
  ...await importOriginal<typeof import("@/features/media-assets/api/media-asset-api")>(), getMediaAsset: mocks.getAsset,
}));
vi.mock("@/shared/ui/app-toast", () => ({ appToast: { copied: mocks.copied, error: mocks.error } }));
vi.mock("@xyflow/react", () => ({
  Position: { Left: "left", Right: "right" }, NodeResizer: () => null, useUpdateNodeInternals: () => mocks.updateInternals,
  Handle: ({ id, position, isConnectable, isConnectableStart, isConnectableEnd, ...props }:
    HTMLAttributes<HTMLDivElement> & { position: string; isConnectable: boolean; isConnectableStart: boolean; isConnectableEnd: boolean }) =>
    <div {...props} data-handleid={id} data-position={position} data-connectable={isConnectable}
      data-connectable-start={isConnectableStart} data-connectable-end={isConnectableEnd} />,
}));

const clients: QueryClient[] = [], serverHistory = new Map<string, NodeExecutionDto[]>();
const historyKey = (graphId: string, nodeId: string) => JSON.stringify([graphId, nodeId]);
const writeText = vi.fn();
const catalog: SpaceEditorCatalog = {
  imageModels: [], llmModels: [{
    type: "llm", key: "llm", label: "Creative LLM", vendor: "OpenAI", provider: "openai_compatible",
    providerConfig: { base_url: "https://provider.invalid/v1", model_id: "creative", supports_images: true }, isActive: true, isDefault: false,
  }], isLoading: false, error: null, retry: () => {},
};
const assistant = (prompt = "Local instructions"): CanonicalNode => ({
  id: "assistant", kind: "generate.assistant", configVersion: 1, position: { x: 0, y: 0 }, selectedOutputAssetId: null,
  config: { prompt, modelKey: "llm", outputMode: "list", presentation: { customTitle: "My assistant", comment: "Keep this" } },
});
function editor({ nodes = [assistant()], edges = [], writable = true, id = "space-assistant", persistedNodeIds }: {
  nodes?: CanonicalNode[]; edges?: CanonicalEdge[]; writable?: boolean; id?: string; persistedNodeIds?: string[];
} = {}) {
  return createSpaceEditorSession({ id, version: 3, writable, persistedNodeIds,
    document: { schemaVersion: 3, title: "Assistant", nodes, edges, groups: [] } });
}
function execution(patch: Partial<NodeExecutionDto> = {}): NodeExecutionDto {
  return { executionId: "done", executionKind: "assistant", graphNodeId: "assistant", mediaType: "text", status: "completed", progress: 100,
    outputAssetIds: [], modelKey: "llm", errorCode: null, outputText: "First paragraph.\n\nSecond paragraph.", outputMode: "text",
    createdAt: "2026-10-20T01:00:00.000Z", finishedAt: "2026-10-20T01:00:04.000Z", ...patch };
}
function listResult(patch: Partial<NodeExecutionDto> = {}): NodeExecutionDto {
  return execution({ outputMode: "list", outputText: "1. coat\n\n2. coat\n\n3. scarf",
    outputItems: [{ id: "done:1", text: "coat" }, { id: "done:2", text: "coat" }, { id: "done:3", text: "scarf" }],
    selectedItemId: "done:1", selectionVersion: 4, ...patch });
}
function setHistory(client: QueryClient, rows: NodeExecutionDto[], graphId = "space-assistant") {
  serverHistory.set(historyKey(graphId, "assistant"), rows);
  client.setQueryData(nodeExecutionKeys.list(graphId, "assistant"), rows);
}
function mount({ session = editor(), rows = [], services = {}, inputRuntime = {}, client: providedClient }: {
  session?: SpaceEditorSession; rows?: NodeExecutionDto[] | null; services?: SpaceEditorServices; inputRuntime?: SpaceInputRuntime; client?: QueryClient;
} = {}) {
  const client = providedClient ?? new QueryClient({ defaultOptions: {
    queries: { retry: false, staleTime: Infinity, refetchOnMount: false, refetchOnWindowFocus: false, gcTime: Infinity }, mutations: { retry: false },
  } });
  clients.push(client);
  if (rows) setHistory(client, rows, session.getSnapshot().id);
  const tree = (current: SpaceEditorSession): ReactNode => <NextIntlClientProvider locale="en" messages={english} timeZone="UTC">
    <QueryClientProvider client={client}><SpaceEditorProvider session={current} catalog={catalog} services={services} inputRuntime={inputRuntime}>
      <SpaceAssistantNode nodeId="assistant" />
    </SpaceEditorProvider></QueryClientProvider>
  </NextIntlClientProvider>;
  const rendered = render(tree(session));
  // These component tests exercise controls after the user enters body mode.
  // The shared Shell and browser suites cover the first-click/drag boundary.
  const activateBody = () => {
    const body = rendered.container.querySelector('[data-space-node-body]');
    if (body) fireEvent.click(body);
  };
  activateBody();
  return { ...rendered, client, session, switchSession: (next: SpaceEditorSession, nextRows: NodeExecutionDto[] = []) => {
    setHistory(client, nextRows, next.getSnapshot().id); rendered.rerender(tree(next));
    activateBody();
  } };
}
function config(session: SpaceEditorSession) { return session.getSnapshot().nodeById.get("assistant")?.config as Record<string, unknown>; }
async function sourceEditor() {
  fireEvent.click(screen.getByRole("tab", { name: "Source" }));
  fireEvent.keyDown(screen.getByRole("button", { name: "Edit Assistant instructions" }), { key: "Enter" });
  const input = screen.getByRole("textbox", { name: "Assistant instructions" });
  await waitFor(() => expect(input).toHaveFocus());
  return input;
}
function pendingStatus(panel: HTMLElement) {
  const status = within(panel).getByRole("status", { name: english.generation.canvas.generating });
  expect(status).toHaveAttribute("aria-live", "polite");
  expect(status.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
  expect(status).toHaveTextContent(english.generation.canvas.generating);
  expect(status).not.toHaveTextContent(/total|elapsed/);
  return status;
}
function deferred<T>() {
  let resolve!: (value: T) => void, reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

beforeEach(() => {
  vi.clearAllMocks(); serverHistory.clear();
  window.localStorage.clear();
  vi.stubGlobal("PointerEvent", MouseEvent);
  mocks.list.mockImplementation(async (graphId: string, nodeId: string) => structuredClone(serverHistory.get(historyKey(graphId, nodeId)) ?? []));
  mocks.select.mockReset(); mocks.getAsset.mockReset();
  writeText.mockReset().mockResolvedValue(undefined);
  Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
  vi.spyOn(HTMLMediaElement.prototype, "load").mockImplementation(() => {});
});
afterEach(() => { cleanup(); clients.splice(0).forEach(client => client.clear()); vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers(); });

describe("SpaceAssistantNode", () => {
  it.each(["pending", "processing", "uploading"] as const)("shows first-run %s progress over the mounted source and restores its text after completion", async status => {
    const running = execution({ executionId: "first", status, outputText: null, finishedAt: null });
    const { session, client, container } = mount();
    const input = await sourceEditor();
    expect(input).toHaveValue("Local instructions");
    act(() => { setHistory(client, [running]); });
    const source = screen.getByRole("tabpanel", { name: "Source" });
    await waitFor(() => expect(source).toHaveAttribute("data-pending", "true"));
    expect(screen.getByRole("tab", { name: "Source" })).toHaveAttribute("aria-selected", "true");
    pendingStatus(source);
    expect(screen.getByRole("textbox", { name: "Assistant instructions" })).toBe(input);
    expect(input).toHaveValue("Local instructions");
    expect(input).toHaveFocus();
    expect(input).toBeEnabled();
    fireEvent.change(input, { target: { value: "Instructions remain editable" } });
    expect(config(session).prompt).toBe("Instructions remain editable");
    fireEvent.click(screen.getByRole("tab", { name: "Result" }));
    const panel = screen.getByRole("tabpanel", { name: "Result" });
    pendingStatus(panel);
    expect(panel).not.toHaveTextContent("No generated result yet.");
    expect(screen.getByRole("button", { name: "Copy result" })).toBeDisabled();
    expect(container.querySelector("[data-space-node]")).toHaveAttribute("data-executing", "true");
    act(() => { setHistory(client, [{ ...running, status: "completed", outputText: "First reply", finishedAt: "2026-10-20T01:00:04.000Z" }]); });
    await waitFor(() => expect(screen.queryByRole("status", { name: english.generation.canvas.generating })).not.toBeInTheDocument());
    expect(screen.getByRole("tabpanel", { name: "Result" })).toHaveTextContent("First reply");
    expect(container.querySelector("[data-space-assistant]")).not.toHaveTextContent(/total|elapsed/);
    expect(config(session).prompt).toBe("Instructions remain editable");
    fireEvent.click(screen.getByRole("tab", { name: "Source" }));
    expect(screen.getByRole("tabpanel", { name: "Source" })).toHaveAttribute("data-pending", "false");
    expect(screen.getByRole("textbox", { name: "Assistant instructions" })).toHaveValue("Instructions remain editable");
    expect(mocks.start).not.toHaveBeenCalled(); expect(mocks.cancel).not.toHaveBeenCalled();
  });

  it("keeps every completed list item visible and copyable while a rerun shows progress", async () => {
    const previous = listResult(), { session, container } = mount({ rows: [previous] });
    const list = screen.getByRole("list", { name: "Generated list" }), original = session.getDocument();
    const rerun = execution({ executionId: "rerun", status: "processing", outputText: null, finishedAt: null, createdAt: "2026-10-20T02:00:00.000Z" });
    act(() => { session.patchRuntime("assistant", { execution: rerun }); });
    const panel = screen.getByRole("tabpanel", { name: "Result" });
    pendingStatus(panel);
    expect(screen.getByRole("tab", { name: "Result" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("list", { name: "Generated list" })).toBe(list);
    expect(list).toBeVisible(); expect(within(list).getAllByRole("listitem")).toHaveLength(3);
    expect(screen.getByRole("button", { name: "Select item 1" })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("button", { name: "Copy result" }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(previous.outputText));
    expect(container.querySelector("[data-space-assistant]")).not.toHaveTextContent(/total|elapsed/);
    expect(session.getDocument()).toBe(original);
    act(() => { session.patchRuntime("assistant", { execution: { ...rerun, status: "failed", errorCode: "ASSISTANT_PROVIDER_UNAVAILABLE" } }); });
    expect(screen.queryByRole("status", { name: english.generation.canvas.generating })).not.toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("Could not connect to the model provider.");
    expect(screen.getByRole("list", { name: "Generated list" })).toBe(list);
    expect(within(list).getAllByRole("listitem")).toHaveLength(3);
  });

  it.each([false, true])("shows pre-acceptance progress without replacing source or prior result (prior completion: %s)", hasPrevious => {
    const session = editor();
    session.patchRuntime("assistant", { submissionPending: true });
    const rows = hasPrevious ? [execution()] : [];
    const { client, container } = mount({ session, rows });
    pendingStatus(screen.getByRole("tabpanel", { name: hasPrevious ? "Result" : "Source" }));
    expect(container.querySelector("[data-space-node]")).toHaveAttribute("data-executing", "true");
    fireEvent.click(screen.getByRole("tab", { name: "Result" }));
    const panel = screen.getByRole("tabpanel", { name: "Result" });
    pendingStatus(panel);
    if (hasPrevious) expect(panel).toHaveTextContent("Second paragraph.");
    else expect(panel).not.toHaveTextContent("No generated result yet.");
    expect(container.querySelector("[data-space-assistant]")).not.toHaveTextContent(/total|elapsed/);
    expect(client.getQueryData(nodeExecutionKeys.list("space-assistant", "assistant"))).toEqual(rows);
    expect(mocks.start).not.toHaveBeenCalled(); expect(mocks.list).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("tab", { name: "Source" }));
    const source = screen.getByRole("tabpanel", { name: "Source" });
    const input = screen.getByRole("textbox", { name: "Assistant instructions" });
    pendingStatus(source);
    expect(source).toHaveAttribute("data-pending", "true");
    expect(input).toHaveValue("Local instructions");
    act(() => { session.patchRuntime("assistant", { submissionPending: false }); });
    expect(screen.queryByRole("status", { name: english.generation.canvas.generating })).not.toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Source" })).toHaveAttribute("aria-selected", "true");
    expect(source).toHaveAttribute("data-pending", "false");
    expect(screen.getByRole("textbox", { name: "Assistant instructions" })).toBe(input);
    expect(input).toHaveValue("Local instructions");
    fireEvent.click(screen.getByRole("tab", { name: "Result" }));
    expect(screen.getByRole("tabpanel", { name: "Result" })).toHaveTextContent(hasPrevious ? "Second paragraph." : "No generated result yet.");
  });

  it("edits the local instructions with connected empty text as context, and preserves unrelated config and undo", async () => {
    const upstream: CanonicalNode = { ...assistant(""), id: "text", kind: "input.prompt", config: { text: "" } };
    const wire: CanonicalEdge = { id: "context", sourceNodeId: "text", sourcePortId: "text", targetNodeId: "assistant", targetPortId: "text", sortOrder: 0, hasPause: false };
    const session = editor({ nodes: [upstream, assistant()], edges: [wire] });
    mount({ session });
    expect(screen.getByText("Text input: Waiting for a result")).toBeInTheDocument();
    const input = await sourceEditor();
    expect(input).not.toBeDisabled();
    fireEvent.change(input, { target: { value: "Describe both items\nKeep paragraphs" } });
    expect(config(session)).toEqual({ prompt: "Describe both items\nKeep paragraphs", modelKey: "llm", outputMode: "list", presentation: { customTitle: "My assistant", comment: "Keep this" } });
    fireEvent.click(screen.getByRole("button", { name: "Copy source" }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith("Describe both items\nKeep paragraphs"));
    act(() => { session.undo(); });
    expect(input).toHaveValue("Local instructions");
    act(() => { session.dispatch({ type: "edge.disconnect", edgeId: "context" }); });
    expect(screen.queryByText("Text input: Waiting for a result")).not.toBeInTheDocument();
    expect(input).toHaveValue("Local instructions");
    expect(mocks.start).not.toHaveBeenCalled();
  });

  it("flushes a Korean draft only after composition and protects Enter, Escape, blur and key229", async () => {
    const { session } = mount();
    const input = await sourceEditor();
    fireEvent.compositionStart(input);
    fireEvent.change(input, { target: { value: "한글 작성" } });
    expect(input).toHaveValue("한글 작성");
    expect(config(session).prompt).toBe("Local instructions");
    act(() => { session.patchRuntime("assistant", { submissionPending: true }); });
    pendingStatus(screen.getByRole("tabpanel", { name: "Source" }));
    expect(screen.getByRole("textbox", { name: "Assistant instructions" })).toBe(input);
    expect(input).toHaveValue("한글 작성");
    fireEvent.keyDown(input, { key: "Enter", isComposing: true });
    fireEvent.keyDown(input, { key: "Escape", keyCode: 229 });
    fireEvent.keyDown(input, { key: "Escape" });
    expect(input).not.toHaveAttribute("readonly");
    fireEvent.blur(input);
    expect(config(session).prompt).toBe("Local instructions");
    fireEvent.compositionEnd(input);
    expect(config(session).prompt).toBe("한글 작성");
    expect(session.getSnapshot().history.undo).toHaveLength(1);
    act(() => { session.patchRuntime("assistant", { submissionPending: false }); });
    expect(screen.queryByRole("status", { name: english.generation.canvas.generating })).not.toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Assistant instructions" })).toBe(input);
    expect(input).toHaveValue("한글 작성");
  });

  it("ignores a composition flush after intervening prompt edits even when the original text returns", async () => {
    const { session } = mount();
    const input = await sourceEditor();
    fireEvent.compositionStart(input);
    fireEvent.change(input, { target: { value: "오래된 초안" } });
    act(() => {
      session.dispatch({ type: "node.config.patch", nodeId: "assistant", patch: { prompt: "Newer instructions" } });
      session.dispatch({ type: "node.config.patch", nodeId: "assistant", patch: { prompt: "Local instructions" } });
    });
    fireEvent.compositionEnd(input);
    expect(config(session).prompt).toBe("Local instructions");
    expect(input).toHaveValue("Local instructions");
    expect(session.getSnapshot().history.undo).toHaveLength(2);
  });

  it("automatically opens each new completion, retains Source until another completes, and keeps old results after failure", async () => {
    const { client, session } = mount({ rows: [execution()] });
    expect(screen.getByRole("tab", { name: "Result" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tabpanel", { name: "Result" })).toHaveTextContent("Second paragraph.");
    fireEvent.keyDown(screen.getByRole("tab", { name: "Result" }), { key: "ArrowLeft" });
    expect(screen.getByRole("tab", { name: "Source" })).toHaveFocus();
    act(() => {
      setHistory(client, [execution({ executionId: "failure", createdAt: "2026-10-20T02:00:00Z", status: "failed", errorCode: "ASSISTANT_PROVIDER_UNAVAILABLE", outputText: null }), execution()]);
    });
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Could not connect"));
    expect(screen.getByRole("tab", { name: "Source" })).toHaveAttribute("aria-selected", "true");
    fireEvent.click(screen.getByRole("tab", { name: "Result" }));
    expect(screen.getByRole("tabpanel", { name: "Result" })).toHaveTextContent("Second paragraph.");
    fireEvent.click(screen.getByRole("tab", { name: "Source" }));
    act(() => {
      session.patchRuntime("assistant", { execution: execution({ executionId: "next", status: "processing", progress: 40, outputText: null, finishedAt: null, createdAt: "2026-10-20T03:00:00Z" }) });
    });
    expect(screen.getByRole("tab", { name: "Source" })).toHaveAttribute("aria-selected", "true");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    act(() => {
      session.patchRuntime("assistant", { execution: execution({ executionId: "next", outputText: "Newest completion", createdAt: "2026-10-20T03:00:00Z" }) });
    });
    expect(screen.getByRole("tabpanel", { name: "Result" })).toHaveTextContent("Newest completion");
    expect(config(session).prompt).toBe("Local instructions");
  });

  it("selects exact list IDs with the cached version, waits for confirmation, and leaves graph/history untouched", async () => {
    const response = deferred<NodeExecutionDto>(), row = listResult();
    mocks.select.mockReturnValue(response.promise);
    const { session, client, container } = mount({ rows: [row] });
    const originalDocument = session.getDocument(), originalHistory = session.getSnapshot().history;
    expect(within(screen.getByRole("list", { name: "Generated list" })).getAllByRole("listitem")).toHaveLength(3);
    expect(container.querySelectorAll('[data-space-port="item"]')).toHaveLength(1);
    expect(container.querySelector('[data-space-port="done:3"]')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Select item 3" }));
    fireEvent.click(screen.getByRole("button", { name: "Select item 2" }));
    await waitFor(() => expect(mocks.select).toHaveBeenCalledTimes(1));
    expect(mocks.select).toHaveBeenCalledWith("space-assistant", "assistant", "done", { action: "select-item", itemId: "done:3", expectedSelectionVersion: 4 });
    expect(screen.getByRole("button", { name: "Select item 1" })).toHaveAttribute("aria-pressed", "true");
    await waitFor(() => expect(screen.getByRole("button", { name: "Select item 2" })).toBeDisabled());
    const selected = { ...row, selectedItemId: "done:3", selectionVersion: 5 };
    serverHistory.set(historyKey("space-assistant", "assistant"), [selected]);
    await act(async () => { response.resolve(selected); });
    await waitFor(() => expect(screen.getByRole("button", { name: "Select item 3" })).toHaveAttribute("aria-pressed", "true"));
    expect(client.getQueryData<NodeExecutionDto[]>(nodeExecutionKeys.list("space-assistant", "assistant"))?.[0].selectionVersion).toBe(5);
    expect(session.getDocument()).toBe(originalDocument);
    expect(session.getSnapshot().history).toBe(originalHistory);
    expect(mocks.start).not.toHaveBeenCalled(); expect(mocks.cancel).not.toHaveBeenCalled();
  });

  it("keeps a newer shared-cache selection when an older selection response arrives", async () => {
    const response = deferred<NodeExecutionDto>(), row = listResult();
    mocks.select.mockReturnValue(response.promise);
    const { client, session } = mount({ rows: [row] });
    act(() => { session.patchRuntime("assistant", { execution: row }); });
    fireEvent.click(screen.getByRole("button", { name: "Select item 2" }));
    await waitFor(() => expect(mocks.select).toHaveBeenCalledOnce());
    const newer = { ...row, selectedItemId: "done:3", selectionVersion: 6 };
    act(() => { setHistory(client, [newer]); });
    await waitFor(() => expect(screen.getByRole("button", { name: "Select item 3" })).toHaveAttribute("aria-pressed", "true"));
    await act(async () => { response.resolve({ ...row, selectedItemId: "done:2", selectionVersion: 5 }); });
    await waitFor(() => expect(screen.getByRole("button", { name: "Select item 2" })).not.toBeDisabled());
    expect(screen.getByRole("button", { name: "Select item 3" })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("tab", { name: "Source" }));
    act(() => { setHistory(client, [{ ...newer, selectionVersion: 7 }]); });
    expect(screen.getByRole("tab", { name: "Source" })).toHaveAttribute("aria-selected", "true");
  });

  it("shows a selection conflict toast without changing the visible choice or leaking error payloads", async () => {
    mocks.select.mockRejectedValueOnce(new Error("ASSISTANT_SELECTION_CONFLICT"));
    mount({ rows: [listResult()] });
    fireEvent.click(screen.getByRole("button", { name: "Select item 2" }));
    await waitFor(() => expect(mocks.error).toHaveBeenCalledWith(english.assistantList.selectionConflict));
    expect(screen.getByRole("button", { name: "Select item 1" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.queryByText("ASSISTANT_SELECTION_CONFLICT")).not.toBeInTheDocument();
  });

  it("allows source/result/item copying in read-only mode while blocking prompt edits and selection", async () => {
    const session = editor({ writable: false });
    mount({ session, rows: [listResult()] });
    expect(screen.getByRole("button", { name: "Select item 3" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Select item 3" }));
    fireEvent.click(screen.getByRole("button", { name: "Copy item 3" }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith("scarf"));
    fireEvent.click(screen.getByRole("button", { name: "Copy result" }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith("1. coat\n\n2. coat\n\n3. scarf"));
    fireEvent.click(screen.getByRole("tab", { name: "Source" }));
    const input = screen.getByRole("textbox", { name: "Assistant instructions" });
    expect(input).toBeDisabled();
    fireEvent.change(input, { target: { value: "Blocked" } });
    fireEvent.click(screen.getByRole("button", { name: "Copy source" }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith("Local instructions"));
    expect(config(session).prompt).toBe("Local instructions");
    expect(session.getSnapshot().history.undo).toHaveLength(0);
    expect(mocks.select).not.toHaveBeenCalled();
  });

  it("silences a late selection failure after node deletion without restoring the node", async () => {
    const response = deferred<NodeExecutionDto>(); mocks.select.mockReturnValue(response.promise);
    const { session } = mount({ rows: [listResult()] });
    fireEvent.click(screen.getByRole("button", { name: "Select item 2" }));
    await waitFor(() => expect(mocks.select).toHaveBeenCalledOnce());
    act(() => { session.dispatch({ type: "nodes.remove", nodeIds: ["assistant"] }); });
    expect(screen.queryByRole("tabpanel")).not.toBeInTheDocument();
    await act(async () => { response.reject(new Error("ASSISTANT_SELECTION_CONFLICT")); });
    expect(mocks.error).not.toHaveBeenCalled();
    expect(session.getDocument().nodes).toHaveLength(0);
  });

  it("silences a late failure across a reset away and back to the same Space and node", async () => {
    const response = deferred<NodeExecutionDto>(); mocks.select.mockReturnValue(response.promise);
    const { session } = mount({ rows: [listResult()] });
    fireEvent.click(screen.getByRole("button", { name: "Select item 2" }));
    await waitFor(() => expect(mocks.select).toHaveBeenCalledOnce());
    const original = session.getDocument();
    act(() => {
      session.reset({ id: "other", version: 1, document: original });
      session.reset({ id: "space-assistant", version: 3, document: original });
    });
    await act(async () => { response.reject(new Error("ASSISTANT_SELECTION_CONFLICT")); });
    expect(mocks.error).not.toHaveBeenCalled();
    expect(session.getDocument()).toBe(original);
    expect(session.getSnapshot().history.undo).toHaveLength(0);
  });

  it("keeps late selection success in its original graph cache when switching Spaces", async () => {
    const response = deferred<NodeExecutionDto>(), row = listResult(); mocks.select.mockReturnValue(response.promise);
    const first = editor({ id: "first" }), second = editor({ id: "second", nodes: [assistant("Second Space")] });
    const rendered = mount({ session: first, rows: [row] });
    fireEvent.click(screen.getByRole("button", { name: "Select item 2" }));
    await waitFor(() => expect(mocks.select).toHaveBeenCalledOnce());
    rendered.switchSession(second, [execution({ executionId: "second-result", outputText: "Second result" })]);
    const confirmed = { ...row, selectedItemId: "done:2", selectionVersion: 5 };
    serverHistory.set(historyKey("first", "assistant"), [confirmed]);
    await act(async () => { response.resolve(confirmed); });
    expect(screen.getByRole("tabpanel", { name: "Result" })).toHaveTextContent("Second result");
    expect(config(second).prompt).toBe("Second Space");
    expect(config(first).prompt).toBe("Local instructions");
    expect(second.getSnapshot().history.undo).toHaveLength(0);
    expect(mocks.error).not.toHaveBeenCalled();
  });

  it("suppresses a pending selection error after read-only permission is revoked and restored", async () => {
    const response = deferred<NodeExecutionDto>(); mocks.select.mockReturnValue(response.promise);
    const { session } = mount({ rows: [listResult()] });
    fireEvent.click(screen.getByRole("button", { name: "Select item 2" }));
    await waitFor(() => expect(mocks.select).toHaveBeenCalledOnce());
    const document = session.getDocument();
    act(() => {
      session.reset({ id: "space-assistant", version: 3, writable: false, document });
      session.reset({ id: "space-assistant", version: 3, writable: true, document });
    });
    await act(async () => { response.reject(new Error("Sensitive provider payload")); });
    expect(mocks.error).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Select item 1" })).toHaveAttribute("aria-pressed", "true");
  });

  it("uses ordered shared asset queries and attaches reference video sources only while visible", async () => {
    const observers: Array<{ callback: IntersectionObserverCallback; disconnect: () => void; target?: Element }> = [];
    vi.stubGlobal("IntersectionObserver", class {
      entry: typeof observers[number];
      constructor(callback: IntersectionObserverCallback) { this.entry = { callback, disconnect: vi.fn() }; observers.push(this.entry); }
      observe(target: Element) { this.entry.target = target; }
      disconnect() { this.entry.disconnect(); }
    });
    const source = (id: string, kind: "input.image" | "input.video", assetId: string): CanonicalNode => ({ ...assistant(), id, kind, config: { assetId } });
    const wire = (id: string, sourceNodeId: string, type: "image" | "video", sortOrder: number): CanonicalEdge => ({
      id, sourceNodeId, sourcePortId: type, targetNodeId: "assistant", targetPortId: type === "image" ? "images" : "videos", sortOrder, hasPause: false,
    });
    const asset = (id: string, type: "image" | "video"): MediaAssetDto => ({
      id, type, url: `https://assets.invalid/${id}`, mimeType: `${type}/${type === "image" ? "png" : "mp4"}`, version: 1,
      status: "completed", origin: "upload", bytes: "100", width: 100, height: 100, durationMs: type === "video" ? 1_000 : null,
      sourceOperationId: null, createdAt: "2026-10-20T01:00:00Z", updatedAt: "2026-10-20T01:00:00Z",
    });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
    client.setQueryData(mediaAssetKeys.detail("video-asset"), asset("video-asset", "video"));
    client.setQueryData(mediaAssetKeys.detail("image-asset"), asset("image-asset", "image"));
    const session = editor({ nodes: [source("image", "input.image", "image-asset"), source("video", "input.video", "video-asset"), assistant()],
      edges: [wire("image-wire", "image", "image", 1), wire("video-wire", "video", "video", 0), wire("duplicate", "image", "image", 2)] });
    const { unmount } = mount({ session, client });
    const references = screen.getByRole("list", { name: "Connected references" });
    expect(within(references).getAllByRole("listitem").map(item => item.title)).toEqual(["Reference 1", "Reference 2", "Reference 3"]);
    const video = within(references).getByLabelText("Video reference 1");
    expect(video).not.toHaveAttribute("src"); expect(video).toHaveAttribute("preload", "none");
    expect(within(references).getByAltText("Image reference 2")).toHaveAttribute("loading", "lazy");
    expect(mocks.getAsset).not.toHaveBeenCalled();
    const reference = within(references).getAllByRole("listitem")[0];
    expect(reference).toContainElement(video);
    const observer = observers.find(entry => entry.target === reference)!;
    act(() => { observer.callback([{ isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver); });
    expect(video).toHaveAttribute("src", "https://assets.invalid/video-asset");
    expect(video).toHaveAttribute("preload", "metadata"); expect(video).not.toHaveAttribute("autoplay");
    act(() => { observer.callback([{ isIntersecting: false } as IntersectionObserverEntry], {} as IntersectionObserver); });
    expect(video).not.toHaveAttribute("src");
    unmount(); expect(observer.disconnect).toHaveBeenCalledOnce();
  });

  it("uses only the Frame Run/Browse/Cancel services and never submits execution APIs from the body", () => {
    const runNode = vi.fn(), browseModel = vi.fn(), cancelNode = vi.fn(), session = editor();
    const { container } = mount({ session, services: { runNode, browseModel, cancelNode } });
    expect(container.querySelectorAll('button[data-canvas-action="run"]')).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "Run this node" }));
    fireEvent.click(screen.getByRole("button", { name: "Browse models" }));
    expect(runNode).toHaveBeenCalledWith("assistant"); expect(browseModel).toHaveBeenCalledWith("assistant");
    act(() => { session.patchRuntime("assistant", { execution: execution({ status: "processing", finishedAt: null, outputText: null }) }); });
    expect(container.querySelector("[data-space-assistant]")).not.toHaveTextContent("elapsed");
    expect(container.querySelector('button[data-canvas-action="run"]')).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Cancel operation" }));
    expect(cancelNode).toHaveBeenCalledWith("assistant");
    expect(screen.queryByRole("complementary")).not.toBeInTheDocument();
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
    expect(mocks.start).not.toHaveBeenCalled(); expect(mocks.cancel).not.toHaveBeenCalled();
  });

  it("queries only persisted nodes and stops history polling after terminal results", async () => {
    vi.useFakeTimers();
    const first = mount({ rows: [execution()] });
    await act(async () => { await vi.advanceTimersByTimeAsync(30_000); });
    expect(mocks.list).not.toHaveBeenCalled();
    first.unmount();
    const session = editor({ id: "unsaved", persistedNodeIds: [] });
    const second = mount({ session, rows: null });
    await act(async () => { await vi.advanceTimersByTimeAsync(30_000); });
    expect(mocks.list).not.toHaveBeenCalled();
    await act(async () => { session.ack({ id: "unsaved", version: 4, persistedNodeIds: ["assistant"] }); });
    expect(mocks.list).toHaveBeenCalledOnce();
    expect(mocks.list).toHaveBeenCalledWith("unsaved", "assistant", expect.any(AbortSignal));
    await act(async () => { await vi.advanceTimersByTimeAsync(30_000); });
    expect(mocks.list).toHaveBeenCalledOnce();
    second.unmount();
  });

  it("disables empty copy, handles clipboard retry, and suppresses late copy feedback after switching Space", async () => {
    const rendered = mount({ session: editor({ nodes: [assistant("")] }) });
    expect(screen.getByRole("button", { name: "Copy source" })).toBeDisabled();
    fireEvent.click(screen.getByRole("tab", { name: "Result" }));
    expect(screen.getByRole("button", { name: "Copy result" })).toBeDisabled();
    expect(screen.getByRole("tabpanel", { name: "Result" })).toHaveTextContent("No generated result yet.");
    act(() => { setHistory(rendered.client, [execution()]); });
    await waitFor(() => expect(screen.getByRole("button", { name: "Copy result" })).not.toBeDisabled());
    writeText.mockRejectedValueOnce(new Error("NotAllowedError"));
    fireEvent.click(screen.getByRole("button", { name: "Copy result" }));
    await waitFor(() => expect(mocks.error).toHaveBeenCalledWith(english.common.actions.copyFailed));
    fireEvent.click(screen.getByRole("button", { name: "Copy result" }));
    await waitFor(() => expect(mocks.copied).toHaveBeenCalledWith(english.common.actions.copied));
    const pendingCopy = deferred<void>(); writeText.mockReturnValueOnce(pendingCopy.promise);
    mocks.copied.mockClear(); mocks.error.mockClear();
    fireEvent.click(screen.getByRole("button", { name: "Copy result" }));
    rendered.switchSession(editor({ id: "next-space" }));
    await act(async () => { pendingCopy.resolve(); });
    expect(mocks.copied).not.toHaveBeenCalled(); expect(mocks.error).not.toHaveBeenCalled();
  });

  it("keeps the prior completed output while displaying a friendly unknown failure", () => {
    mount({ rows: [execution({ executionId: "unknown", createdAt: "2026-10-20T02:00:00Z", status: "failed", outputText: null,
      errorCode: "PRIVATE_PROVIDER_DETAIL" }), execution()] });
    expect(screen.getByRole("alert")).toHaveTextContent("Generation failed. Try again.");
    expect(screen.getByRole("alert")).not.toHaveTextContent("PRIVATE_PROVIDER_DETAIL");
    expect(screen.getByRole("tabpanel", { name: "Result" })).toHaveTextContent("Second paragraph.");
  });
});
