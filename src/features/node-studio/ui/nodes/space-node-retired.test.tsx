import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NextIntlClientProvider } from "next-intl";
import type { HTMLAttributes } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CanonicalEdge, CanonicalNode } from "@/shared/generation-graph/canonical-graph";
import { isTemporarilyHiddenEditNodeKind, unavailableEditNodeKinds } from "@/shared/generation-graph/node-availability";
import { findNodeDefinition } from "@/shared/generation-graph/node-registry";
import type { MediaAssetDto } from "@/shared/media-assets/media-asset-contract";
import messages from "@/shared/i18n/messages/en.json";
import { createSpaceEditorSession } from "../../model/space-editor-store";
import type { SpaceInputRuntime } from "../../model/space-editor-inputs";
import type { SpaceEditorDocument } from "../../model/space-editor-types";
import { createSpaceEditorScope, SpaceEditorProvider } from "../space-editor-provider";
import { SpaceRetiredNode } from "./space-node-retired";

const mocks = vi.hoisted(() => ({ getAsset: vi.fn(), assets: new Map<string, MediaAssetDto>(), errors: new Set<string>() }));
vi.mock("@/features/media-assets/api/media-asset-api", async importOriginal => ({
  ...await importOriginal<object>(), getMediaAsset: (...args: unknown[]) => mocks.getAsset(...args),
}));
vi.mock("@xyflow/react", () => ({
  Position: { Left: "left", Right: "right" }, NodeResizer: () => null, useUpdateNodeInternals: () => () => {},
  Handle: (props: HTMLAttributes<HTMLDivElement>) => <div data-space-port={props["data-space-port" as keyof typeof props]} aria-disabled={props["aria-disabled"]} />,
}));
// Resource/decoder behavior is owned by SpaceMediaPreview's tests. Keep its
// exact durable asset and playback demand observable without fetching bytes.
vi.mock("./space-media-preview", () => ({ SpaceMediaPreview: (props: {
  asset: MediaAssetDto; selected: boolean; hovered: boolean; active?: boolean; zoom?: number;
}) => <div data-testid="preview" data-asset={props.asset.id} data-type={props.asset.type}
  data-selected={props.selected} data-hovered={props.hovered} data-active={props.active} data-zoom={props.zoom} /> }));

function asset(id: string, type: MediaAssetDto["type"] = "image"): MediaAssetDto {
  return { id, version: 1, type, status: "completed", origin: "upload", mimeType: `${type}/${type === "image" ? "png" : "mp4"}`, bytes: "4",
    width: 800, height: 600, durationMs: null, sourceOperationId: null, url: `https://media.example/${id}`,
    createdAt: "2026-10-20T00:00:00Z", updatedAt: "2026-10-20T00:00:00Z" };
}
function retired(kind = "edit.image.annotation", overrides: Partial<CanonicalNode> = {}): CanonicalNode {
  return { id: "retired", kind, configVersion: 1, config: { parameters: {} }, position: { x: 20, y: 40 }, selectedOutputAssetId: "saved", ...overrides };
}
function graph(node = retired(), connected = true): SpaceEditorDocument {
  const sourceType = node.kind.startsWith("edit.video.") ? "video" : "image";
  const inputPort = node.kind === "edit.image.gif" ? "frames" : node.kind === "edit.video.stitch" ? "clips" : sourceType;
  const definition = findNodeDefinition(node.kind);
  const outputPort = definition?.ports.find(port => port.direction === "output" && ["image", "video", "audio"].includes(port.valueType));
  const source: CanonicalNode = { id: "source", kind: `input.${sourceType}`, configVersion: 1, config: { assetId: "upstream" }, position: { x: 0, y: 0 }, selectedOutputAssetId: null };
  const target: CanonicalNode = { id: "target", kind: "output.gallery", configVersion: 1, config: { mediaType: outputPort?.valueType ?? "image", excludedAssetIds: [] },
    position: { x: 600, y: 0 }, selectedOutputAssetId: null };
  const edges: CanonicalEdge[] = connected && definition ? [
    { id: "retained-input", sourceNodeId: "source", sourcePortId: sourceType, targetNodeId: node.id, targetPortId: inputPort, sortOrder: 0, hasPause: true },
    ...(outputPort ? [{ id: "retained-output", sourceNodeId: node.id, sourcePortId: outputPort.id, targetNodeId: "target", targetPortId: outputPort.valueType,
      sortOrder: 0, hasPause: false }] : []),
  ] : [];
  return { schemaVersion: 3, title: "Saved nodes", nodes: [node, source, target], edges, groups: [] };
}
const clients: QueryClient[] = [];
function mount(doc = graph(), options: { runtime?: SpaceInputRuntime; writable?: boolean; readOnlyReason?: string; nodeId?: string } = {}) {
  const session = createSpaceEditorSession({ id: "space", version: 1, document: doc, writable: options.writable, readOnlyReason: options.readOnlyReason });
  const runNode = vi.fn(), cancelNode = vi.fn(), browseModel = vi.fn(), expandNode = vi.fn(), services = { runNode, cancelNode, browseModel, expandNode };
  const scope = createSpaceEditorScope(session, { services, inputRuntime: options.runtime });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } }); clients.push(client);
  let runtime = options.runtime;
  const durable = vi.fn(), keyboard = vi.fn(), pointer = vi.fn(); session.subscribeDurable(durable);
  const tree = () => <NextIntlClientProvider locale="en" messages={messages} timeZone="UTC"><QueryClientProvider client={client}>
    <SpaceEditorProvider session={session} scope={scope} services={services} inputRuntime={runtime}>
      <div onKeyDown={keyboard} onPointerDown={pointer}><SpaceRetiredNode nodeId={options.nodeId ?? "retired"} /></div>
    </SpaceEditorProvider>
  </QueryClientProvider></NextIntlClientProvider>;
  const view = render(tree());
  return { ...view, session, scope, durable, runNode, cancelNode, browseModel, expandNode, keyboard, pointer, client,
    setRuntime: (value: SpaceInputRuntime) => { runtime = value; view.rerender(tree()); } };
}
function savedResults(container: HTMLElement) {
  return [...container.querySelectorAll<HTMLElement>("[data-saved-asset]")].map(item => [item.dataset.savedAsset, item.dataset.outputPort, item.dataset.outputIndex]);
}
function expectNoAuthoring(container: HTMLElement) {
  expect(container.querySelector("input, textarea, select, [data-canvas-action='run'], [data-node-run]")).toBeNull();
  expect(screen.queryByRole("button", { name: /Run node|Run this node|Browse models|Expand editor|Cancel operation|Create|Upload/i })).not.toBeInTheDocument();
}
beforeEach(() => {
  mocks.assets.clear(); mocks.errors.clear(); mocks.getAsset.mockReset();
  for (const id of ["saved", "first", "second", "duplicate", "new-result", "upstream"]) mocks.assets.set(id, asset(id));
  mocks.getAsset.mockImplementation(async (id: string) => {
    if (mocks.errors.has(id) || !mocks.assets.has(id)) throw new Error("PRIVATE_RESULT_CONFIG_ERROR");
    return mocks.assets.get(id);
  });
  vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} unobserve() {} });
});
afterEach(() => { cleanup(); for (const client of clients.splice(0)) client.clear(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("SpaceRetiredNode", () => {
  it.each(unavailableEditNodeKinds)("preserves %s data and selected media with only its available read handles", async kind => {
    if (findNodeDefinition(kind)!.ports.some(port => port.direction === "output" && port.valueType === "video")) mocks.assets.set("saved", asset("saved", "video"));
    const doc = graph(retired(kind)), original = structuredClone(doc), view = mount(doc);
    expect(await screen.findByTestId("preview")).toHaveAttribute("data-asset", "saved");
    expect(screen.getByRole("status")).toHaveTextContent("NODE_UNAVAILABLE"); expectNoAuthoring(view.container);
    expect(view.container.querySelector("[data-space-node]")).toHaveAttribute("data-space-node", kind);
    const ports = [...view.container.querySelectorAll("[data-space-port]")];
    expect(ports.map(port => port.getAttribute("data-space-port"))).toEqual(isTemporarilyHiddenEditNodeKind(kind) ? [] : findNodeDefinition(kind)!.ports.map(port => port.id));
    for (const port of ports) expect(port).toHaveAttribute("aria-disabled", "true");
    expect(mocks.getAsset).toHaveBeenCalledExactlyOnceWith("saved", expect.any(AbortSignal));
    expect(view.session.getDocument()).toBe(doc); expect(doc).toEqual(original); expect(doc.nodes[0].config).toEqual({ parameters: {} });
    expect(doc.edges).toHaveLength(2);
    expect(view.durable).not.toHaveBeenCalled(); expect(view.runNode).not.toHaveBeenCalled(); expect(view.cancelNode).not.toHaveBeenCalled();
  });

  it("keeps every own output binding's port/index and duplicates while sharing asset queries", async () => {
    const bindings = [
      { portId: "images", sortOrder: 3, assetId: "duplicate" }, { portId: "images", sortOrder: 0, assetId: "first" },
      { portId: "images", sortOrder: 1, assetId: null }, { portId: "images", sortOrder: 2, assetId: "second" },
      { portId: "images", sortOrder: 4, assetId: "duplicate" },
    ];
    const original = structuredClone(bindings), runtime = { mediaOutputs: new Map([["retired", bindings]]) };
    const doc = graph(retired("edit.image.splitGrid", { selectedOutputAssetId: "second" })), view = mount(doc, { runtime });
    await waitFor(() => expect(screen.getAllByTestId("preview")).toHaveLength(4));
    expect(savedResults(view.container)).toEqual([["first", "images", "0"], ["second", "images", "2"], ["duplicate", "images", "3"], ["duplicate", "images", "4"]]);
    expect(mocks.getAsset.mock.calls.map(call => call[0])).toEqual(["first", "second", "duplicate"]);
    expect(view.container.querySelector('[data-selected-output="true"]')).toHaveAttribute("data-saved-asset", "second");
    expect(runtime.mediaOutputs.get("retired")).toBe(bindings); expect(bindings).toEqual(original); expect(view.session.getDocument()).toBe(doc);
  });

  it("preserves a representative absent from bindings alongside own saved results", async () => {
    const view = mount(graph(retired("edit.image.splitGrid")), { runtime: { mediaOutputs: new Map([["retired", [{ portId: "images", sortOrder: 0, assetId: "first" }]]]) } });
    await waitFor(() => expect(screen.getAllByTestId("preview")).toHaveLength(2));
    expect(savedResults(view.container)).toEqual([["saved", undefined, undefined], ["first", "images", "0"]]);
    expect(view.session.getDocument().nodes[0].selectedOutputAssetId).toBe("saved"); expect(view.durable).not.toHaveBeenCalled();
  });

  it("never falls back to upstream media or interprets asset-like fields in opaque config", () => {
    const doc = graph(retired("edit.image.annotation", { selectedOutputAssetId: null, config: { parameters: {}, assetId: "upstream", privatePrompt: "DO_NOT_RENDER" } }));
    doc.edges = doc.edges.map(edge => ({ ...edge, hasPause: false }));
    const view = mount(doc);
    expect(screen.queryByTestId("preview")).not.toBeInTheDocument(); expect(mocks.getAsset).not.toHaveBeenCalled();
    expect(view.container).not.toHaveTextContent("DO_NOT_RENDER"); expect(view.session.getDocument()).toBe(doc); expectNoAuthoring(view.container);
  });

  it.each([
    { kind: "future.node", configVersion: 1, config: [null, false, 0, { secret: "KEEP_OPAQUE" }], reason: "UNKNOWN_NODE_KIND" },
    { kind: "future.<script>", configVersion: 99, config: { secret: "KEEP_OPAQUE", url: "https://private.example" }, reason: "UNKNOWN_NODE_KIND" },
    { kind: "future.scalar", configVersion: 1, config: "KEEP_OPAQUE", reason: "UNKNOWN_NODE_KIND" },
    { kind: "input.prompt", configVersion: 1, config: { text: "KEEP_OPAQUE", futureField: false }, reason: "INVALID_NODE_CONFIG" },
    { kind: "generate.image", configVersion: 1, config: { modelKey: null, prompt: "", parameters: {}, futureField: "KEEP_OPAQUE" }, reason: "INVALID_NODE_CONFIG" },
  ] as const)("safely displays $kind with $reason and leaves the original JSON intact", async entry => {
    const doc = graph(retired(entry.kind, { configVersion: entry.configVersion, config: structuredClone(entry.config) as CanonicalNode["config"] }), false);
    const before = JSON.stringify(doc), view = mount(doc);
    expect(await screen.findByTestId("preview")).toHaveAttribute("data-asset", "saved");
    expect(screen.getByRole("status")).toHaveTextContent(entry.reason); expect(view.container).not.toHaveTextContent("KEEP_OPAQUE");
    expect(view.container).not.toHaveTextContent("https://private.example"); expect(view.container.querySelector("script")).toBeNull();
    expect(JSON.stringify(view.session.getDocument())).toBe(before); expect(view.session.getDocument()).toBe(doc);
    expectNoAuthoring(view.container); expect(view.durable).not.toHaveBeenCalled(); expect(view.runNode).not.toHaveBeenCalled();
  });

  it.each(["generate.image", "generate.audio", "generate.video", "generate.assistant", "edit.image.resize", "input.prompt"] as const)(
    "keeps future %s config read-only with no native run/browse/expand controls", async kind => {
      const doc = graph(retired(kind, { configVersion: 99, config: { nested: [0, false, null, "KEEP_OPAQUE"] } }), false), view = mount(doc);
      await screen.findByTestId("preview"); expect(screen.getByRole("status")).toHaveTextContent("UNKNOWN_CONFIG_VERSION");
      expectNoAuthoring(view.container); expect(view.container).not.toHaveTextContent("KEEP_OPAQUE");
      expect(view.session.getDocument()).toBe(doc); expect(view.durable).not.toHaveBeenCalled(); expect(view.runNode).not.toHaveBeenCalled();
      fireEvent.click(screen.getByRole("button", { name: "Click to edit title" }));
      expect(screen.queryByRole("textbox")).not.toBeInTheDocument(); expect(view.session.getDocument()).toBe(doc);
    },
  );

  it("retains current read-only reason while allowing read-only previews", async () => {
    const doc = graph(), view = mount(doc, { writable: false, readOnlyReason: "OWNER_READ_ONLY" });
    expect(await screen.findByTestId("preview")).toHaveAttribute("data-asset", "saved");
    expect(screen.getByText("Read-only space · OWNER_READ_ONLY")).toBeInTheDocument(); expect(view.session.getDocument()).toBe(doc);
  });

  it("keeps bare-body pointer/Delete available and permits existing node movement/deletion", async () => {
    const view = mount(); await screen.findByTestId("preview");
    const body = view.container.querySelector<HTMLElement>("[data-space-retired]")!;
    fireEvent.pointerDown(body, { button: 0 }); fireEvent.keyDown(body, { key: "Delete" });
    expect(view.pointer).toHaveBeenCalledOnce(); expect(view.keyboard).toHaveBeenCalledOnce();
    act(() => { view.session.dispatch({ type: "nodes.move", positions: { retired: { x: 300, y: 500 } } }); });
    expect(view.session.getDocument().nodes[0].position).toEqual({ x: 300, y: 500 });
    act(() => { view.session.dispatch({ type: "nodes.remove", nodeIds: ["retired"] }); });
    expect(view.container.querySelector("[data-space-retired]")).toBeNull(); expect(view.session.getDocument().nodes.map(node => node.id)).toEqual(["source", "target"]);
    expect(view.runNode).not.toHaveBeenCalled();
  });

  it("updates lazy preview demand and saved binding results without executing or writing", async () => {
    const view = mount(); const preview = await screen.findByTestId("preview");
    expect(preview).not.toHaveAttribute("data-active");
    act(() => { view.session.select(["retired"]); view.session.hover("retired"); view.session.setViewport({ x: 0, y: 0, zoom: 0.5 }); });
    expect(preview).toHaveAttribute("data-selected", "true"); expect(preview).toHaveAttribute("data-hovered", "true"); expect(preview).toHaveAttribute("data-zoom", "0.5");
    view.setRuntime({ mediaOutputs: new Map([["retired", [{ portId: "image", sortOrder: 0, assetId: "new-result" }]]]) });
    await waitFor(() => expect(screen.getAllByTestId("preview")).toHaveLength(2));
    expect(mocks.getAsset.mock.calls.map(call => call[0])).toEqual(["saved", "new-result"]);
    expect(view.durable).not.toHaveBeenCalled(); expect(view.runNode).not.toHaveBeenCalled(); expect(view.cancelNode).not.toHaveBeenCalled();
  });

  it("keeps retained runtime progress from exposing execution controls", async () => {
    const view = mount(); await screen.findByTestId("preview");
    act(() => { view.session.patchRuntime("retired", { execution: {
      executionId: "historical", executionKind: "media_operation", mediaType: "image", graphNodeId: "retired", status: "processing", progress: 20,
      errorCode: null, modelKey: null, outputAssetIds: [], createdAt: "2026-10-20T00:00:00Z",
    } }); });
    expectNoAuthoring(view.container);
    expect(view.runNode).not.toHaveBeenCalled(); expect(view.cancelNode).not.toHaveBeenCalled();
    expect(view.durable).not.toHaveBeenCalled(); expect(screen.getByTestId("preview")).toHaveAttribute("data-asset", "saved");
  });

  it("shows a safe media failure and retries only a read query without removing references", async () => {
    mocks.errors.add("saved"); const doc = graph(), view = mount(doc);
    const alert = await screen.findByRole("alert"); expect(view.container).not.toHaveTextContent("PRIVATE_RESULT_CONFIG_ERROR");
    expect(screen.getAllByRole("status").some(item => item.textContent?.includes("Assets could not be loaded."))).toBe(true);
    fireEvent.click(view.container.querySelector("[data-space-node-body]")!);
    mocks.errors.delete("saved"); fireEvent.click(within(alert).getByRole("button", { name: "Retry" }));
    expect(await screen.findByTestId("preview")).toHaveAttribute("data-asset", "saved");
    expect(mocks.getAsset).toHaveBeenCalledTimes(2); expect(view.session.getDocument()).toBe(doc); expect(view.durable).not.toHaveBeenCalled();
  });
});
