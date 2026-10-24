import { act, cleanup, render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NextIntlClientProvider } from "next-intl";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { CanonicalNode } from "@/shared/generation-graph/canonical-graph";
import messages from "@/shared/i18n/messages/en.json";
import { nodeExecutionKeys } from "../../hook/use-node-executions";
import type { NodeExecutionDto } from "../../model/node-execution-types";
import { createSpaceEditorSession, type SpaceEditorSession } from "../../model/space-editor-store";
import { SpaceEditorProvider, useSpaceSelector } from "../space-editor-provider";
import { SpaceNodeExecutionStatus, useSpaceNodeExecutionState } from "./space-node-execution-status";

const clients: QueryClient[] = [];
function client() {
  const value = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  clients.push(value);
  return value;
}
function producer(id = "producer"): CanonicalNode {
  return { id, kind: "generate.image", configVersion: 1, position: { x: 0, y: 0 },
    config: { modelKey: null, prompt: "A can", parameters: {} }, selectedOutputAssetId: null };
}
function result(id: string, executionId: string | null, state = "completed", producerId = "producer"): CanonicalNode {
  return { id, kind: "input.image", configVersion: 1, position: { x: 600, y: 0 }, selectedOutputAssetId: null,
    config: { assetId: state === "completed" ? `asset-${id}` : null,
      resultSource: { nodeId: producerId, executionId, portId: "image", index: 0, state } } };
}
function execution(id: string, seconds = 10, overrides: Partial<NodeExecutionDto> = {}): NodeExecutionDto {
  return { executionId: id, executionKind: "generation", mediaType: "image", graphNodeId: "producer", status: "completed", progress: 100,
    modelKey: null, errorCode: null, outputAssetIds: [], createdAt: "2026-10-21T00:00:00.000Z",
    finishedAt: new Date(Date.parse("2026-10-21T00:00:00.000Z") + seconds * 1000).toISOString(), ...overrides };
}
function session(nodes: CanonicalNode[], id = "space") {
  return createSpaceEditorSession({ id, version: 1, document: { schemaVersion: 3, title: "Status", nodes, edges: [], groups: [] } });
}
function Probe({ id, rendered }: { id: string; rendered?: (id: string) => void }) {
  const node = useSpaceSelector(state => state.nodeById.get(id)), runtime = useSpaceSelector(state => state.runtimeByNode.get(id));
  const state = useSpaceNodeExecutionState(node, runtime);
  rendered?.(id);
  return <div data-testid={id} data-active={state.active} data-execution-id={state.execution?.executionId}>
    <SpaceNodeExecutionStatus state={state} />
  </div>;
}
function tree(editor: SpaceEditorSession, children: ReactNode, cache?: QueryClient) {
  const content = <SpaceEditorProvider session={editor}>{children}</SpaceEditorProvider>;
  return <NextIntlClientProvider locale="en" messages={messages} timeZone="UTC">
    {cache ? <QueryClientProvider client={cache}>{content}</QueryClientProvider> : content}
  </NextIntlClientProvider>;
}
afterEach(() => { cleanup(); for (const cache of clients.splice(0)) cache.clear(); vi.restoreAllMocks(); vi.useRealTimers(); });

describe("Space node execution status", () => {
  it("reads a direct edit from the result node without borrowing another run from its immutable source", () => {
    const node = result("cropped", "crop-run", "pending", "source");
    node.config = { assetId: null, resultSource: { nodeId: "source", executionId: "crop-run", portId: "editedImage", index: 0, state: "pending" } };
    const editor = session([{ ...producer("source"), kind: "input.image", config: { assetId: "original" } }, node]);
    const crop = execution("crop-run", 3, { graphNodeId: "cropped", executionKind: "media_operation", status: "processing", finishedAt: null });
    editor.patchRuntime("cropped", { execution: crop });
    editor.patchRuntime("source", { execution: execution("unrelated") });
    render(tree(editor, <Probe id="cropped" />));
    expect(screen.getByTestId("cropped")).toHaveAttribute("data-execution-id", "crop-run");
    expect(screen.getByTestId("cropped")).toHaveAttribute("data-active", "true");
    act(() => editor.patchRuntime("cropped", { execution: { ...crop, status: "completed", finishedAt: "2026-10-21T00:00:03.000Z" } }));
    expect(screen.getByTestId("cropped")).toHaveTextContent("3s total");
  });
  it("pins the first three result durations while the producer starts a fourth run", () => {
    const cache = client(), editor = session([producer(), ...[1, 2, 3].map(index => result(`result-${index}`, `run-${index}`))]);
    const previous = [1, 2, 3].map(index => execution(`run-${index}`, index * 10));
    cache.setQueryData(nodeExecutionKeys.list("space", "producer"), previous);
    const fourth = execution("run-4", 10, { status: "processing", finishedAt: null, createdAt: "2026-10-21T00:01:00.000Z", progress: 20 });
    editor.patchRuntime("producer", { execution: fourth });
    const rendered = vi.fn();
    render(tree(editor, <>{["producer", "result-1", "result-2", "result-3"].map(id => <Probe key={id} id={id} rendered={rendered} />)}</>, cache));
    for (const index of [1, 2, 3]) {
      expect(screen.getByTestId(`result-${index}`)).toHaveTextContent(`${index * 10}s total`);
      expect(screen.getByTestId(`result-${index}`)).toHaveAttribute("data-active", "false");
    }
    expect(screen.getByTestId("producer")).toHaveAttribute("data-active", "true");
    rendered.mockClear();
    act(() => cache.setQueryData(nodeExecutionKeys.list("space", "producer"), [...previous, fourth]));
    act(() => editor.patchRuntime("producer", { execution: { ...fourth, progress: 80 } }));
    expect(rendered.mock.calls.filter(([id]) => id.startsWith("result-"))).toHaveLength(0);
    for (const index of [1, 2, 3]) expect(screen.getByTestId(`result-${index}`)).toHaveTextContent(`${index * 10}s total`);
  });

  it("uses an exact matching producer runtime without requiring a QueryClient", () => {
    const editor = session([producer(), result("current", "current-run", "pending"), result("older", "old-run")]);
    editor.patchRuntime("producer", { execution: execution("current-run", 10, { status: "processing", finishedAt: null }) });
    render(tree(editor, <><Probe id="current" /><Probe id="older" /></>));
    expect(screen.getByTestId("current")).toHaveAttribute("data-active", "true");
    expect(screen.getByTestId("current")).toHaveTextContent("Generating");
    expect(screen.getByTestId("older")).toHaveAttribute("data-active", "false");
    expect(screen.getByTestId("older")).toHaveTextContent("Completed");
    expect(screen.getByTestId("older")).not.toHaveTextContent(/total|elapsed/);
  });

  it.each(["pending", "completed", "failed", "cancelled"])("falls back to an unbound result's %s state without borrowing a duration", state => {
    const cache = client(), editor = session([producer(), result("unbound", null, state)]);
    cache.setQueryData(nodeExecutionKeys.list("space", "producer"), [execution("unrelated-latest", 50)]);
    editor.patchRuntime("producer", { execution: execution("unrelated-latest", 50) });
    render(tree(editor, <Probe id="unbound" />, cache));
    const status = within(screen.getByTestId("unbound")).getByRole("status");
    expect(status).toHaveAttribute("data-space-node-execution-status", state);
    expect(status).not.toHaveTextContent(/total|elapsed|Time unavailable/);
    expect(screen.getByTestId("unbound")).not.toHaveAttribute("data-execution-id");
    expect(screen.getByTestId("unbound")).toHaveAttribute("data-active", String(state === "pending"));
  });

  it("ignores unrelated cache keys and producer IDs, and changes graph scope without retaining timing", () => {
    const cache = client(), nodes = [producer(), result("bound", "same-id")], editor = session(nodes);
    cache.setQueryData(nodeExecutionKeys.list("other-space", "producer"), [execution("same-id", 40)]);
    cache.setQueryData(nodeExecutionKeys.list("space", "other-producer"), [execution("same-id", 50, { graphNodeId: "other-producer" })]);
    cache.setQueryData(nodeExecutionKeys.list("space", "producer"), [execution("same-id", 60, { graphNodeId: "other-producer" })]);
    const rendered = vi.fn(), view = render(tree(editor, <Probe id="bound" rendered={rendered} />, cache));
    expect(screen.getByTestId("bound")).not.toHaveTextContent("total");
    rendered.mockClear();
    act(() => cache.setQueryData(nodeExecutionKeys.list("other-space", "producer"), [execution("same-id", 45)]));
    act(() => cache.setQueryData(["media-assets", "one"], { id: "one" }));
    expect(rendered).not.toHaveBeenCalled();
    act(() => cache.setQueryData(nodeExecutionKeys.list("space", "producer"), [execution("same-id", 30)]));
    expect(screen.getByTestId("bound")).toHaveTextContent("30s total");
    view.rerender(tree(session(nodes, "next-space"), <Probe id="bound" />, cache));
    expect(screen.getByTestId("bound")).not.toHaveTextContent("total");
  });

  it("prefers terminal cache or runtime data for the same run and the latest producer execution", () => {
    const cache = client(), editor = session([producer(), result("bound", "run", "pending")]);
    cache.setQueryData(nodeExecutionKeys.list("space", "producer"), [execution("run", 15)]);
    editor.patchRuntime("producer", { execution: execution("run", 15, { status: "processing", finishedAt: null }) });
    render(tree(editor, <><Probe id="producer" /><Probe id="bound" /></>, cache));
    expect(screen.getByTestId("producer")).toHaveTextContent("Completed15s total");
    expect(screen.getByTestId("bound")).toHaveAttribute("data-active", "false");
    act(() => editor.patchRuntime("producer", { execution: execution("run", 20) }));
    act(() => cache.setQueryData(nodeExecutionKeys.list("space", "producer"), [execution("run", 15, { status: "processing", finishedAt: null })]));
    expect(screen.getByTestId("bound")).toHaveTextContent("20s total");
    act(() => cache.setQueryData(nodeExecutionKeys.list("space", "producer"), [execution("run", 15), execution("newer", 10, {
      createdAt: "2026-10-21T00:01:00.000Z", finishedAt: "2026-10-21T00:01:10.000Z",
    })]));
    expect(screen.getByTestId("producer")).toHaveAttribute("data-execution-id", "newer");
    expect(screen.getByTestId("producer")).toHaveTextContent("10s total");
    expect(screen.getByTestId("bound")).toHaveTextContent("20s total");
  });

  it("keeps submission and repeat guards without timing the prior completion as a new run", () => {
    const editor = session([producer()]);
    editor.patchRuntime("producer", { execution: execution("last-run", 20), submissionPending: true });
    render(tree(editor, <Probe id="producer" />));
    expect(screen.getByTestId("producer")).toHaveAttribute("data-active", "true");
    expect(screen.getByTestId("producer")).toHaveTextContent("Queued");
    expect(screen.getByTestId("producer")).not.toHaveTextContent(/total|elapsed/);
    act(() => editor.patchRuntime("producer", { submissionPending: false, repeatProgress: { completed: 1, failed: 0, total: 3, running: true } }));
    expect(screen.getByTestId("producer")).toHaveTextContent("Generating · 1/3");
    expect(screen.getByTestId("producer")).toHaveAttribute("data-active", "true");
    expect(screen.getByTestId("producer")).not.toHaveTextContent(/total|elapsed/);
    act(() => editor.patchRuntime("producer", { repeatProgress: { completed: 3, failed: 0, total: 3, running: false } }));
    expect(screen.getByTestId("producer")).toHaveAttribute("data-active", "false");
    expect(screen.getByTestId("producer")).toHaveTextContent("Completed · 3/3");
    expect(screen.getByTestId("producer")).toHaveTextContent("20s total");
  });

  it("preserves a failed result slot and terminal binding even when producer runtime is stale", () => {
    const editor = session([producer(), result("failed-slot", "run", "failed"), result("done-slot", "run")]);
    editor.patchRuntime("producer", { execution: execution("run", 15, { status: "processing", finishedAt: null }) });
    render(tree(editor, <><Probe id="failed-slot" /><Probe id="done-slot" /></>));
    expect(screen.getByTestId("failed-slot")).toHaveTextContent("Failed");
    expect(screen.getByTestId("done-slot")).toHaveTextContent("Completed");
    for (const id of ["failed-slot", "done-slot"]) {
      expect(screen.getByTestId(id)).toHaveAttribute("data-active", "false");
      expect(screen.getByTestId(id)).not.toHaveTextContent(/total|elapsed/);
    }
  });

  it("does not fetch, create queries, or run a clock for terminal/unknown timestamps", () => {
    const cache = client(), fetch = vi.spyOn(cache, "fetchQuery"), prefetch = vi.spyOn(cache, "prefetchQuery");
    const interval = vi.spyOn(globalThis, "setInterval");
    const editor = session([producer(), result("missing", "not-cached"), result("invalid", "invalid-date"), result("legacy", "missing-finish")]);
    cache.setQueryData(nodeExecutionKeys.list("space", "producer"), [execution("complete", 15), execution("invalid-date", 15, { createdAt: "invalid" }), execution("missing-finish", 15, { finishedAt: null })]);
    const query = cache.getQueryCache().getAll()[0], queries = cache.getQueryCache().getAll();
    const { unmount } = render(tree(editor, <><Probe id="producer" /><Probe id="missing" /><Probe id="invalid" /><Probe id="legacy" /></>, cache));
    expect(screen.getByTestId("producer")).toHaveTextContent("15s total");
    expect(screen.getByTestId("missing")).not.toHaveTextContent(/total|elapsed|Time unavailable/);
    expect(screen.getByTestId("invalid")).toHaveTextContent("Time unavailable");
    expect(screen.getByTestId("legacy")).toHaveTextContent("Time unavailable");
    expect(screen.getByTestId("invalid")).not.toHaveTextContent(/total|elapsed/);
    expect(screen.getByTestId("legacy")).not.toHaveTextContent(/total|elapsed/);
    expect(interval).not.toHaveBeenCalled(); expect(fetch).not.toHaveBeenCalled(); expect(prefetch).not.toHaveBeenCalled();
    expect(cache.getQueryCache().getAll()).toEqual(queries); expect(query.getObserversCount()).toBe(0);
    act(() => cache.removeQueries({ queryKey: nodeExecutionKeys.list("space", "producer"), exact: true }));
    expect(screen.getByTestId("invalid")).not.toHaveTextContent("total");
    unmount();
  });
});
