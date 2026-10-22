import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { HTMLAttributes } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CanonicalNode } from "@/shared/generation-graph/canonical-graph";
import type { MediaAssetDto } from "@/shared/media-assets/media-asset-contract";
import messages from "@/shared/i18n/messages/en.json";
import type { NodeExecutionDto } from "../../model/node-execution-types";
import { createSpaceEditorSession } from "../../model/space-editor-store";
import type { SpaceEditorDocument } from "../../model/space-editor-types";
import { createSpaceEditorScope, SpaceEditorProvider } from "../space-editor-provider";
import { SpaceMediaEditInspector } from "../space-media-edit-inspector";
import { SpaceNodeAuthoringProvider } from "./space-node-authoring-provider";
import { SpaceResizeNode } from "./space-node-resize";

const mocks = vi.hoisted(() => ({ assets: new Map<string, MediaAssetDto>(), assetQuery: vi.fn(), refetch: vi.fn(), error: false }));
// Exercise the retained Resize implementation, including its canonical handles.
// Real product hiding and authoring guards are covered without this override in their own suites.
vi.mock("@/shared/generation-graph/node-availability", async importOriginal => {
  const actual = await importOriginal<typeof import("@/shared/generation-graph/node-availability")>();
  return { ...actual,
    isUnavailableEditNodeKind: (kind: string) => actual.isUnavailableEditNodeKind(kind) && kind !== "edit.image.resize",
    isTemporarilyHiddenEditNodeKind: (kind: string) => actual.isTemporarilyHiddenEditNodeKind(kind) && kind !== "edit.image.resize",
  };
});
vi.mock("../../hook/use-space-preferences", () => ({ useSpacePreferences: () => null }));
vi.mock("@/features/media-assets/hook/use-media-assets", () => ({ useMediaAsset: (id: string | null) => {
  mocks.assetQuery(id); return { data: id ? mocks.assets.get(id) : undefined, isError: mocks.error, refetch: mocks.refetch };
} }));
vi.mock("@xyflow/react", () => ({
  Position: { Left: "left", Right: "right" }, NodeResizer: () => null, useUpdateNodeInternals: () => () => {},
  Handle: ({ id, position, isConnectable, isConnectableStart, isConnectableEnd, ...props }:
    HTMLAttributes<HTMLDivElement> & { position: string; isConnectable: boolean; isConnectableStart: boolean; isConnectableEnd: boolean }) => {
    void position; void isConnectable; void isConnectableStart; void isConnectableEnd;
    return <div {...props} data-handleid={id} />;
  },
}));
// Test authoring/selection wiring; the shared select and real image decoder have their own/browser coverage.
vi.mock("@/shared/ui/app-choice-select", () => ({ AppChoiceSelect: (props: {
  label: string; value: string; disabled?: boolean; onValueChange: (value: string) => void; options: { value: string; label: string }[];
}) => <select aria-label={props.label} value={props.value} disabled={props.disabled} onChange={event => props.onValueChange(event.target.value)}>
  {props.options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
</select> }));
vi.mock("./space-media-preview", () => ({ SpaceMediaPreview: (props: { asset: MediaAssetDto; selected: boolean; hovered: boolean; zoom: number; imageFit: string }) =>
  <div data-testid="source-preview" data-asset={props.asset.id} data-selected={props.selected} data-hovered={props.hovered} data-zoom={props.zoom} data-fit={props.imageFit} /> }));

function asset(id: string): MediaAssetDto {
  return { id, version: 1, type: "image", status: "completed", origin: "upload", mimeType: "image/png", bytes: "128", width: 400, height: 200,
    durationMs: null, sourceOperationId: null, url: `https://media.example/${id}.png`, originalFileName: `${id}.png`,
    createdAt: "2026-10-20T00:00:00.000Z", updatedAt: "2026-10-20T00:00:00.000Z" };
}
function resize(parameters: Record<string, string | number> = {}): CanonicalNode {
  return { id: "resize", kind: "edit.image.resize", configVersion: 1, position: { x: 10, y: 20 }, selectedOutputAssetId: "old-result",
    config: { presentation: { customTitle: "My resize" }, parameters: { mode: "exact", width: 512, height: 256, maxEdge: 128, scalePct: 100,
      fit: "contain", padColor: "#00000000", format: "png", quality: 0.9, ...parameters } } };
}
function document(node = resize()): SpaceEditorDocument {
  return { schemaVersion: 3, title: "Resize", nodes: [node, { id: "source", kind: "input.image", configVersion: 1, position: { x: -400, y: 0 },
    selectedOutputAssetId: null, config: { assetId: "source-a" } }, { id: "other", kind: "note.memo", configVersion: 1, position: { x: 900, y: 0 }, config: { text: "Other" }, selectedOutputAssetId: null }],
  edges: [{ id: "image-wire", sourceNodeId: "source", sourcePortId: "image", targetNodeId: "resize", targetPortId: "image", sortOrder: 0 }], groups: [] };
}
function execution(overrides: Partial<NodeExecutionDto> = {}): NodeExecutionDto {
  return { executionId: "resize-run", executionKind: "media_operation", mediaType: "image", graphNodeId: "resize", status: "processing", progress: 45,
    modelKey: null, outputAssetIds: [], errorCode: null, createdAt: "2026-10-20T00:00:00.000Z", ...overrides };
}
function mount(doc = document(), writable = true) {
  const session = createSpaceEditorSession({ id: "space", version: 1, document: doc, writable });
  const runNode = vi.fn(), cancelNode = vi.fn(), scope = createSpaceEditorScope(session, { services: { runNode, cancelNode } });
  const result = render(<NextIntlClientProvider locale="en" messages={messages} timeZone="UTC"><SpaceEditorProvider session={session} scope={scope} services={{ runNode, cancelNode }}>
    <SpaceNodeAuthoringProvider nodeId="resize"><SpaceResizeNode nodeId="resize" /></SpaceNodeAuthoringProvider>
    <aside aria-label="Resize settings"><SpaceMediaEditInspector nodeId="resize" /></aside>
  </SpaceEditorProvider></NextIntlClientProvider>);
  return { ...result, session, scope, runNode, cancelNode };
}
beforeEach(() => {
  mocks.assets.clear(); for (const id of ["source-a", "source-b", "old-result"]) mocks.assets.set(id, asset(id));
  mocks.assetQuery.mockClear(); mocks.refetch.mockReset(); mocks.error = false;
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("SpaceResizeNode", () => {
  it("shows canonical defaults without writing defaults or substituting the producer's selected result", () => {
    const node = resize(); node.config = { parameters: {} };
    const view = mount(document(node));
    expect(screen.getByRole("radio", { name: "Exact", checked: true })).toBeInTheDocument();
    expect(screen.getByLabelText("Width")).toHaveValue(128); expect(screen.getByLabelText("Height")).toHaveValue(128);
    expect(screen.getByLabelText("Format")).toHaveValue("png"); expect(screen.getByLabelText("Fit")).toHaveValue("contain");
    expect(screen.getByLabelText("Pad color")).toHaveValue("#00000000");
    expect(screen.getByTestId("source-preview")).toHaveAttribute("data-asset", "source-a");
    expect(screen.getByTestId("source-preview")).toHaveAttribute("data-fit", "contain");
    expect(view.container.querySelector('[data-space-resize] input')).toBeNull();
    expect(mocks.assetQuery.mock.calls.every(([id]) => id === "source-a")).toBe(true);
    expect(view.session.getDocument().nodes[0]).toBe(node);
  });

  it("edits canonical parameters outside scoped node authoring, preserves metadata/results, and supports undo and reload", () => {
    const view = mount();
    fireEvent.click(view.container.querySelector("[data-space-node-body]")!);
    fireEvent.change(screen.getByLabelText("Width"), { target: { value: "768" } });
    fireEvent.change(screen.getByLabelText("Fit"), { target: { value: "cover" } });
    fireEvent.change(screen.getByLabelText("Pad color"), { target: { value: "#ff000080" } });
    const saved = view.session.getDocument();
    expect(saved.nodes[0]).toMatchObject({ position: { x: 10, y: 20 }, selectedOutputAssetId: "old-result",
      config: { presentation: { customTitle: "My resize" }, parameters: { width: 768, height: 256, fit: "cover", padColor: "#ff000080" } } });
    expect(saved.nodes[1]).toBe(view.session.getSnapshot().nodeById.get("source"));
    act(() => { view.session.undo(); }); expect(screen.getByLabelText("Pad color")).toHaveValue("#00000000");
    act(() => { view.session.redo(); }); expect(screen.getByLabelText("Pad color")).toHaveValue("#ff000080");
    view.unmount(); const restored = mount(saved);
    expect(screen.getByLabelText("Width")).toHaveValue(768); expect(screen.getByLabelText("Fit")).toHaveValue("cover");
    expect(restored.session.getDocument().edges).toEqual(saved.edges);
  });

  it("keeps inactive mode values and pixel/percentage units while changing max edge and fractional scale", () => {
    const view = mount();
    fireEvent.click(view.container.querySelector("[data-space-node-body]")!);
    fireEvent.click(screen.getByRole("radio", { name: "Max Edge" }));
    expect(screen.queryByLabelText("Width")).not.toBeInTheDocument(); expect(screen.queryByLabelText("Fit")).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Max edge"), { target: { value: "1024" } });
    fireEvent.click(screen.getByRole("radio", { name: "Scale %" }));
    fireEvent.change(screen.getByLabelText("Scale %"), { target: { value: "125.5" } });
    expect(screen.getByLabelText("Scale %")).toHaveAttribute("max", "800"); expect(screen.getByText("%")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("radio", { name: "Exact" }));
    expect(screen.getByLabelText("Width")).toHaveValue(512); expect(screen.getByLabelText("Height")).toHaveValue(256);
    expect(view.session.getDocument().nodes[0].config).toMatchObject({ parameters: { mode: "exact", scalePct: 125.5, maxEdge: 1024 } });
  });

  it("preserves transparent pads and quality zero when formats hide/show the quality control", () => {
    const view = mount(document(resize({ quality: 0 })));
    fireEvent.click(view.container.querySelector("[data-space-node-body]")!);
    fireEvent.change(screen.getByLabelText("Format"), { target: { value: "webp" } });
    expect(screen.getByLabelText("Quality")).toHaveValue(0);
    fireEvent.change(screen.getByLabelText("Quality"), { target: { value: "0.35" } });
    fireEvent.change(screen.getByLabelText("Format"), { target: { value: "keep" } });
    expect(screen.queryByLabelText("Quality")).not.toBeInTheDocument();
    expect(view.session.getDocument().nodes[0].config).toMatchObject({ parameters: { format: "keep", quality: 0.35, padColor: "#00000000" } });
    fireEvent.change(screen.getByLabelText("Format"), { target: { value: "jpeg" } });
    expect(screen.getByLabelText("Quality")).toHaveValue(0.35);
  });

  it("runs and cancels only through Frame services and keeps one canonical image port per direction", () => {
    const view = mount();
    fireEvent.click(screen.getByRole("button", { name: "Run this node" }));
    expect(view.runNode).toHaveBeenCalledExactlyOnceWith("resize");
    expect(view.container.querySelectorAll('[data-canvas-action="run"]')).toHaveLength(1);
    expect(view.container.querySelectorAll('[data-space-port="image"]')).toHaveLength(2);
    act(() => { view.session.patchRuntime("resize", { execution: execution() }); });
    expect(view.container.querySelector("[data-space-resize]")).toHaveAttribute("aria-busy", "true");
    expect(view.container.querySelector("[data-space-resize]")).not.toHaveTextContent("elapsed");
    expect(view.container.querySelector('[data-space-node="edit.image.resize"]')).toHaveAttribute("data-executing", "true");
    fireEvent.click(screen.getByRole("button", { name: "Cancel operation" }));
    expect(view.cancelNode).toHaveBeenCalledExactlyOnceWith("resize");
    expect(view.container.querySelector('[data-space-resize] [data-canvas-action]')).toBeNull();
  });

  it("follows image input changes/pause/disconnect, keeping selected result and upstream asset intact", () => {
    const view = mount();
    act(() => { view.session.dispatch({ type: "node.config.patch", nodeId: "source", patch: { assetId: "source-b" } }); });
    expect(screen.getByTestId("source-preview")).toHaveAttribute("data-asset", "source-b");
    act(() => { view.session.dispatch({ type: "edge.pause", edgeId: "image-wire", hasPause: true }); });
    expect(screen.queryByTestId("source-preview")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Run node unavailable:/ })).toBeDisabled();
    act(() => { view.session.dispatch({ type: "edge.pause", edgeId: "image-wire", hasPause: false }); });
    expect(screen.getByTestId("source-preview")).toHaveAttribute("data-asset", "source-b");
    act(() => { view.session.dispatch({ type: "edge.disconnect", edgeId: "image-wire" }); });
    expect(screen.getByText("Connect an image")).toBeInTheDocument();
    expect(view.session.getDocument().nodes[0].selectedOutputAssetId).toBe("old-result");
    expect(view.session.getDocument().nodes[1].config).toMatchObject({ assetId: "source-b" });
  });

  it("clears only the preview's image input in one undo step, preserving its result and producer", () => {
    const view = mount(), original = view.session.getDocument(), durable = vi.fn();
    view.session.subscribeDurable(durable);
    fireEvent.click(view.container.querySelector("[data-space-node-body]")!);
    fireEvent.click(screen.getByRole("button", { name: "Remove" }));
    expect(screen.queryByTestId("source-preview")).not.toBeInTheDocument();
    expect(screen.getByText("Connect an image")).toBeInTheDocument();
    expect(view.session.getDocument().edges).toEqual([]);
    expect(view.session.getDocument().nodes).toBe(original.nodes);
    expect(view.session.getDocument().nodes[0].selectedOutputAssetId).toBe("old-result");
    expect(durable).toHaveBeenCalledTimes(1);
    act(() => view.session.undo());
    expect(view.session.getDocument()).toEqual(original);
    expect(screen.getByTestId("source-preview")).toHaveAttribute("data-asset", "source-a");
    expect(view.runNode).not.toHaveBeenCalled();
  });

  it("disables editing and execution in read-only spaces", () => {
    const doc = document(resize({ format: "jpeg" })), view = mount(doc, false);
    fireEvent.click(view.container.querySelector("[data-space-node-body]")!);
    for (const name of ["Width", "Height", "Fit", "Pad color", "Format", "Quality"]) expect(screen.getByLabelText(name)).toBeDisabled();
    for (const name of ["Exact", "Max Edge", "Scale %"]) expect(screen.getByRole("radio", { name })).toHaveAttribute("aria-disabled", "true");
    expect(screen.getByRole("button", { name: "Remove" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: /Run node unavailable:/ }));
    expect(view.runNode).not.toHaveBeenCalled(); expect(view.session.getDocument()).toEqual(doc);
  });

  it("retries a failed source query and displays execution errors without a result/history chooser", () => {
    mocks.error = true; mocks.assets.delete("source-a");
    const view = mount();
    fireEvent.click(view.container.querySelector("[data-space-node-body]")!);
    fireEvent.click(screen.getByRole("button", { name: "Retry" })); expect(mocks.refetch).toHaveBeenCalledOnce();
    act(() => { view.session.patchRuntime("resize", { execution: execution({ status: "failed", errorCode: "PROCESSOR_FAILED", progress: 0 }) }); });
    expect(screen.getAllByRole("alert")).toHaveLength(2);
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
    expect(screen.queryByRole("tablist")).not.toBeInTheDocument(); expect(screen.queryByText("History")).not.toBeInTheDocument();
    expect(mocks.assetQuery.mock.calls.some(([id]) => id === "old-result")).toBe(false);
  });

  it("does not subscribe to unrelated nodes and passes only its own selection/hover/zoom to adaptive preview", () => {
    const view = mount(), reads = mocks.assetQuery.mock.calls.length;
    act(() => { view.session.dispatch({ type: "node.config.patch", nodeId: "other", patch: { text: "Changed" } }); });
    expect(mocks.assetQuery).toHaveBeenCalledTimes(reads);
    act(() => { view.session.select(["resize"]); view.session.hover("resize"); view.session.setViewport({ x: 0, y: 0, zoom: 0.5 }); });
    expect(screen.getByTestId("source-preview")).toHaveAttribute("data-selected", "true");
    expect(screen.getByTestId("source-preview")).toHaveAttribute("data-hovered", "true");
    expect(screen.getByTestId("source-preview")).toHaveAttribute("data-zoom", "0.5");
  });

  it("rejects out-of-range numeric edits without replacing saved settings", () => {
    const view = mount();
    fireEvent.click(view.container.querySelector("[data-space-node-body]")!);
    for (const value of ["0", "8193", "1.5"]) fireEvent.change(screen.getByLabelText("Width"), { target: { value } });
    expect(view.session.getDocument().nodes[0].config).toMatchObject({ parameters: { width: 512 } });
  });
});
