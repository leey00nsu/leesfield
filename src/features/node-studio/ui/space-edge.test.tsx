import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useLayoutEffect } from "react";
import { Position, type BaseEdgeProps, type EdgeProps } from "@xyflow/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { CanonicalEdge, CanonicalNode } from "@/shared/generation-graph/canonical-graph";
import { defaultConfigForKind } from "@/shared/generation-graph/node-default-config";
import type { CanonicalNodeKind, GeneratedResultGalleryItem, ResultSourceSnapshot } from "@/shared/generation-graph/node-registry";
import type { NodeExecutionDto, NodeExecutionStatus } from "../model/node-execution-types";
import { spaceFlowId, type SpaceFlowEdge } from "../model/space-editor-flow";
import { createSpaceEditorSession, type SpaceEditorSession } from "../model/space-editor-store";
import type { SpaceEditorDocument } from "../model/space-editor-types";
import { SpaceEditorProvider, useSpaceEditor } from "./space-editor-provider";
import { SpaceEdge, SpaceEdgeGradients } from "./space-edge";

const flow = vi.hoisted(() => ({ getZoom: vi.fn(() => 2), rendered: vi.fn() }));
vi.mock("@xyflow/react", async importOriginal => {
  const actual = await importOriginal<typeof import("@xyflow/react")>();
  return { ...actual, useReactFlow: () => ({ getZoom: flow.getZoom }), BaseEdge: (props: BaseEdgeProps) => {
    flow.rendered(props.id);
    return <actual.BaseEdge {...props} />;
  } };
});
vi.mock("next-intl", () => ({ useLocale: () => "en" }));

class TestPointerEvent extends MouseEvent {
  readonly pointerId: number;
  constructor(type: string, options: PointerEventInit = {}) {
    super(type, options);
    this.pointerId = options.pointerId ?? 1;
  }
}
beforeEach(() => {
  vi.stubGlobal("PointerEvent", TestPointerEvent);
  flow.getZoom.mockReturnValue(2);
  flow.rendered.mockClear();
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

const sourceId = 'source /한글%"', targetId = 'target /%"', edgeId = 'edge /한글%"';
function fixture(options: {
  id?: string; sourceKind?: CanonicalNodeKind; port?: string;
  targetKind?: CanonicalNodeKind; targetPort?: string; paused?: boolean; writable?: boolean;
  targetConfig?: CanonicalNode["config"];
  ids?: { source: string; target: string; edge: string };
} = {}) {
  const ids = options.ids ?? { source: sourceId, target: targetId, edge: edgeId };
  const edge: CanonicalEdge = { id: ids.edge, sourceNodeId: ids.source, sourcePortId: options.port ?? "image",
    targetNodeId: ids.target, targetPortId: options.targetPort ?? "reference", sortOrder: 0, hasPause: options.paused ?? false };
  const document: SpaceEditorDocument = { schemaVersion: 3, title: "Edges", groups: [], edges: [edge],
    nodes: ([ [ids.source, options.sourceKind ?? "input.image"], [ids.target, options.targetKind ?? "input.image"], ["other", "input.image"] ] as const)
      .map(([id, kind], index) => ({ id, kind, configVersion: 1, position: { x: index * 400, y: 0 },
        config: id === ids.target && options.targetConfig ? options.targetConfig : defaultConfigForKind(kind), selectedOutputAssetId: null })) };
  return createSpaceEditorSession({ id: options.id ?? 'space /한글%"', version: 1, document, writable: options.writable });
}
const edgeProps: EdgeProps<SpaceFlowEdge> = {
  id: spaceFlowId(edgeId), type: "space", source: spaceFlowId(sourceId), target: spaceFlowId(targetId), data: { edgeId },
  sourceX: 0, sourceY: 0, sourcePosition: Position.Right, targetX: 400, targetY: 120, targetPosition: Position.Left,
  // Flow handles encode presentation IDs; color must come from the canonical port.
  sourceHandleId: "encoded-handle", targetHandleId: "encoded-handle", selected: false,
};
function EdgeStyle({ value }: { value: "angular" | "curved" }) {
  const { view } = useSpaceEditor();
  useLayoutEffect(() => { view.setState({ edgeStyle: value }); }, [view, value]);
  return null;
}
function scene(session: SpaceEditorSession, props: Partial<EdgeProps<SpaceFlowEdge>> = {}, style: "angular" | "curved" = "curved") {
  return <SpaceEditorProvider session={session}>
    <EdgeStyle value={style} /><SpaceEdgeGradients /><svg><SpaceEdge {...edgeProps} {...props} /></svg>
  </SpaceEditorProvider>;
}
function path(container: HTMLElement) { return container.querySelector<SVGPathElement>(".react-flow__edge-path")!; }
function handle(container: HTMLElement) { return container.querySelector<SVGCircleElement>("[data-space-edge-handle]")!; }
function gradientFor(element: SVGPathElement) {
  const stroke = element.style.stroke;
  const paint = document.getElementById(stroke.slice(5, -1))!;
  const inherited = paint.getAttribute("href");
  return inherited ? document.getElementById(inherited.slice(1))! : paint;
}
function execution(status: NodeExecutionStatus, nodeId = targetId): NodeExecutionDto {
  return { executionId: `execution-${nodeId}`, graphNodeId: nodeId, executionKind: "generation", mediaType: "image",
    status, progress: 0, errorCode: null, modelKey: null, outputAssetIds: [], createdAt: "2026-10-20T00:00:00.000Z" };
}
function pendingResult(overrides: Partial<ResultSourceSnapshot> = {}): ResultSourceSnapshot {
  return { nodeId: sourceId, executionId: `execution-${sourceId}`, portId: "image", index: 0, state: "pending", ...overrides };
}
function reservedResultFixture(options: Parameters<typeof fixture>[0] = {}) {
  const producerId = options.ids?.source ?? sourceId;
  return fixture({ sourceKind: "generate.image", targetConfig: { assetId: null,
    resultSource: pendingResult({ nodeId: producerId, executionId: `execution-${producerId}`, portId: options.port ?? "image" }) }, ...options });
}
function galleryItem(overrides: Partial<GeneratedResultGalleryItem> = {}): GeneratedResultGalleryItem {
  return { ...pendingResult(), id: crypto.randomUUID(), mediaType: "image", assetId: null, ...overrides };
}
function galleryFixture(items: GeneratedResultGalleryItem[], options: Parameters<typeof fixture>[0] = {}) {
  return fixture({ sourceKind: "generate.image", targetKind: "output.gallery", targetPort: "image",
    targetConfig: { ...defaultConfigForKind("output.gallery"), resultItems: items }, ...options });
}
function drag(container: HTMLElement) {
  fireEvent.pointerDown(handle(container), { button: 0, pointerId: 1, clientX: 100, clientY: 100 });
  fireEvent.pointerMove(document, { pointerId: 1, clientX: 180, clientY: 100 });
}

describe("Space edge presentation", () => {
  it.each(["curved", "angular"] as const)("keeps a horizontal %s connection paintable across endpoint selection and remeasurement", style => {
    const session = fixture(), original = session.getDocument(), durable = vi.fn();
    session.subscribeDurable(durable);
    const { container, rerender } = render(scene(session, { sourceY: 572, targetY: 572 }, style));
    const paint = () => document.getElementById(path(container).style.stroke.slice(5, -1))!;
    expect(paint()).toHaveAttribute("gradientUnits", "userSpaceOnUse");
    expect(paint()).toHaveAttribute("x1", "0");
    expect(paint()).toHaveAttribute("x2", "400");
    expect(paint()).toHaveAttribute("y1", "572");
    expect(paint()).toHaveAttribute("y2", "572");
    const stroke = path(container).style.stroke;
    act(() => session.select([sourceId]));
    expect(path(container).style.stroke).toBe(stroke);
    expect(gradientFor(path(container)).querySelector("stop")).toHaveAttribute("stop-opacity", "1");
    rerender(scene(session, { sourceX: 50, sourceY: 600, targetX: 450, targetY: 600 }, style));
    expect(paint()).toHaveAttribute("gradientUnits", "userSpaceOnUse");
    expect(paint()).toHaveAttribute("x1", "50");
    expect(paint()).toHaveAttribute("y1", "600");
    expect(paint()).toHaveAttribute("y2", "600");
    act(() => session.select([]));
    expect(gradientFor(path(container)).querySelector("stop")).toHaveAttribute("stop-opacity", "0.25");
    expect(session.getDocument()).toBe(original);
    expect(durable).not.toHaveBeenCalled();
  });

  it.each(["input.video", "output.single"] as const)("animates only %s's active pending capture reservation", kind => {
    const ids = { source: "capture-source", target: "capture-target", edge: "capture-edge" };
    const binding = pendingResult({ nodeId: ids.source, portId: "capturedFrame", executionId: null });
    const session = fixture({ ids, sourceKind: kind, port: "capturedFrame", targetConfig: { assetId: null, resultSource: binding } });
    const { container } = render(scene(session, { id: spaceFlowId(ids.edge), source: spaceFlowId(ids.source), target: spaceFlowId(ids.target), data: { edgeId: ids.edge } }));
    expect(container.querySelector("[stroke-dasharray]")).toBeNull();
    act(() => session.patchRuntime(ids.source, { submissionPending: true, resultReservationIds: ["old-result"] }));
    expect(container.querySelector("[stroke-dasharray]")).toBeNull();
    act(() => session.patchRuntime(ids.source, { resultReservationIds: [ids.target] }));
    expect(container.querySelectorAll("[stroke-dasharray]")).toHaveLength(1);
    act(() => { expect(session.dispatch({ type: "edge.pause", edgeId: ids.edge, hasPause: true }).ok).toBe(true); });
    expect(container.querySelector("[stroke-dasharray]")).toBeNull();
    act(() => { expect(session.dispatch({ type: "edge.pause", edgeId: ids.edge, hasPause: false }).ok).toBe(true); });
    expect(container.querySelectorAll("[stroke-dasharray]")).toHaveLength(1);
    for (const state of ["completed", "failed", "cancelled"]) {
      act(() => { expect(session.applySystemTransaction(document => ({ ...document, nodes: document.nodes.map(node => node.id === ids.target
        ? { ...node, config: { assetId: state === "completed" ? "image" : null, resultSource: { ...binding, state: state as "completed" | "failed" | "cancelled" } } } : node) })).ok).toBe(true); });
      expect(container.querySelector("[stroke-dasharray]")).toBeNull();
    }
  });

  it.each([
    ["input.image", "image", "input.image", "reference", "#0d9668"],
    ["input.prompt", "text", "input.prompt", "text", "#2563eb"],
    ["input.video", "video", "input.video", "video", "#ec4899"],
    ["input.audio", "audio", "input.audio", "audio", "#f97316"],
    ["edit.image.splitGrid", "images", "input.image", "reference", "#52525b"],
    ["edit.video.easeCurve", "settings", "edit.video.easeCurve", "settings", "#f59e0b"],
    ["edit.video.extractFrames", "startFrame", "input.image", "reference", "#0d9668"],
    ["edit.video.extractFrames", "endFrame", "input.image", "reference", "#0d9668"],
    ["generate.assistant", "item", "input.prompt", "text", "#2563eb"],
    ["input.image", "unknown-port", "input.image", "reference", "#64748b"],
  ] as const)("colors %s / %s by canonical source semantics", (sourceKind, port, targetKind, targetPort, color) => {
    const session = fixture({ sourceKind, port, targetKind, targetPort });
    const { container } = render(scene(session));
    expect(gradientFor(path(container)).querySelector("stop")).toHaveAttribute("stop-color", color);
    expect(path(container)).toHaveStyle({ strokeWidth: "3", strokeLinecap: "round", strokeLinejoin: "round" });
    expect(container.querySelector(".react-flow__edge-interaction")).toHaveAttribute("stroke-width", "15");
  });

  it("keeps gradient references distinct for multiple canvases with arbitrary Space IDs", () => {
    const a = fixture({ id: 'landing /한글%"' }), b = fixture({ id: 'landing /한글%"?' });
    const { container } = render(<>{scene(a)}{scene(b)}</>);
    const ids = [...container.querySelectorAll("linearGradient")].map(gradient => gradient.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.every(id => /^[a-zA-Z0-9-]+$/.test(id))).toBe(true);
    const paths = container.querySelectorAll<SVGPathElement>(".react-flow__edge-path");
    expect(paths[0].style.stroke).not.toBe(paths[1].style.stroke);
    for (const edge of paths) expect(gradientFor(edge).querySelector("stop")).toHaveAttribute("stop-color", "#0d9668");
  });

  it("renders the accessible pause icon at the target and resolves canonical data IDs before encoded Flow IDs", () => {
    const session = fixture({ paused: true }), original = session.getDocument();
    const { container, rerender } = render(scene(session, { id: "different-flow-id" }));
    expect(screen.getByRole("img", { name: "Paused edge" })).toHaveAttribute("transform", "translate(376, 120)");
    expect(screen.getByRole("img", { name: "Paused edge" }).querySelectorAll("rect")).toHaveLength(2);
    expect(gradientFor(path(container)).querySelector("stop")).toHaveAttribute("stop-color", "#ea580c");
    rerender(scene(session, { data: undefined }));
    expect(screen.getByRole("img", { name: "Paused edge" })).toBeInTheDocument();
    expect(session.getDocument()).toBe(original);
  });

  it("subscribes only to endpoint selection, source kind and endpoint execution activity", () => {
    const session = fixture(), { container } = render(scene(session));
    const before = flow.rendered.mock.calls.length;
    act(() => {
      session.select(["other"]); session.hover("other"); session.setViewport({ x: 50, y: 20, zoom: 2 });
      session.setRuntime("other", { execution: execution("processing", "other") });
      session.dispatch({ type: "node.config.patch", nodeId: "other", patch: { assetId: "unrelated" } });
    });
    expect(flow.rendered).toHaveBeenCalledTimes(before);
    expect([...gradientFor(path(container)).querySelectorAll("stop")].map(stop => stop.getAttribute("stop-opacity"))).toEqual(["0.25", "0.1", "0.25"]);
    act(() => { session.select([sourceId]); });
    expect([...gradientFor(path(container)).querySelectorAll("stop")].map(stop => stop.getAttribute("stop-opacity"))).toEqual(["1", "0.55", "1"]);
    const selected = flow.rendered.mock.calls.length;
    act(() => { session.select([targetId]); session.patchRuntime(sourceId, { uploadProgress: 0.4 }); });
    expect(flow.rendered).toHaveBeenCalledTimes(selected);
    act(() => { session.patchRuntime(targetId, { uploadProgress: 0.4 }); });
    expect(flow.rendered).toHaveBeenCalledTimes(selected);
    expect(container.querySelector("[stroke-dasharray]")).toBeNull();
  });

  it.each([
    ["source", "pending"], ["source", "processing"], ["source", "uploading"],
    ["target", "pending"], ["target", "processing"], ["target", "uploading"],
  ] as const)("shows %s execution activity during %s and stops at every terminal status", (endpoint, status) => {
    const nodeId = endpoint === "source" ? sourceId : targetId;
    const session = endpoint === "source" ? reservedResultFixture()
      : fixture({ sourceKind: "input.prompt", port: "text", targetKind: "generate.image", targetPort: "prompt" });
    const original = session.getDocument(), durable = vi.fn();
    session.subscribeDurable(durable);
    const { container } = render(scene(session));
    for (const terminal of ["completed", "failed", "cancelled"] as const) {
      act(() => { session.setRuntime(nodeId, { execution: execution(status, nodeId) }); });
      expect(container.querySelectorAll("[stroke-dasharray]")).toHaveLength(1);
      act(() => { session.setRuntime(nodeId, { execution: execution(terminal, nodeId) }); });
      expect(container.querySelector("[stroke-dasharray]")).toBeNull();
    }
    expect(session.getDocument()).toBe(original);
    expect(session.getSnapshot().history.undo).toHaveLength(0);
    expect(durable).not.toHaveBeenCalled();
  });

  it("animates an executable target's input without rerendering for progress or active status changes", () => {
    const session = fixture({ sourceKind: "generate.image", targetKind: "generate.image", targetPort: "primary" });
    session.setRuntime(sourceId, { execution: execution("pending", sourceId) });
    session.setRuntime(targetId, { execution: execution("processing") });
    const { container } = render(scene(session));
    expect(container.querySelectorAll("[stroke-dasharray]")).toHaveLength(1);
    const active = flow.rendered.mock.calls.length;
    act(() => {
      session.setRuntime(sourceId, { execution: { ...execution("uploading", sourceId), progress: 0.7 } });
      session.setRuntime(targetId, { execution: { ...execution("processing"), progress: 0.9 } });
    });
    expect(flow.rendered).toHaveBeenCalledTimes(active);
    act(() => { session.setRuntime(sourceId, { execution: execution("completed", sourceId) }); });
    expect(container.querySelectorAll("[stroke-dasharray]")).toHaveLength(1);
    expect(flow.rendered).toHaveBeenCalledTimes(active);
    act(() => { session.setRuntime(targetId, { execution: execution("failed") }); });
    expect(container.querySelector("[stroke-dasharray]")).toBeNull();
    act(() => {
      session.setRuntime(sourceId, { execution: execution("processing", sourceId) });
      session.setRuntime(targetId, { execution: execution("pending") });
    });
    act(() => { session.setRuntime(targetId, { execution: execution("cancelled") }); });
    expect(container.querySelector("[stroke-dasharray]")).toBeNull();
    act(() => { session.setRuntime(targetId, { execution: execution("pending") }); });
    act(() => { session.setRuntime(sourceId, undefined); });
    expect(container.querySelectorAll("[stroke-dasharray]")).toHaveLength(1);
    act(() => { session.setRuntime(targetId, undefined); });
    expect(container.querySelector("[stroke-dasharray]")).toBeNull();
  });

  it("animates a generator's input and reserved output edges without propagating to a downstream edge", () => {
    const initial = reservedResultFixture().getDocument();
    const document: SpaceEditorDocument = { ...initial,
      nodes: [...initial.nodes, { id: "prompt", kind: "input.prompt", configVersion: 1, position: { x: -400, y: 0 },
        config: defaultConfigForKind("input.prompt"), selectedOutputAssetId: null }],
      edges: [
        { id: "incoming", sourceNodeId: "prompt", sourcePortId: "text", targetNodeId: sourceId, targetPortId: "prompt", sortOrder: 0 },
        ...initial.edges,
        { id: "downstream", sourceNodeId: targetId, sourcePortId: "image", targetNodeId: "other", targetPortId: "reference", sortOrder: 0 },
      ],
    };
    const session = createSpaceEditorSession({ id: "execution-chain", version: 1, document });
    render(<SpaceEditorProvider session={session}><SpaceEdgeGradients /><svg>
      {document.edges.map(edge => <g key={edge.id} data-testid={edge.id}>
        <SpaceEdge {...edgeProps} id={spaceFlowId(edge.id)} source={spaceFlowId(edge.sourceNodeId)}
          target={spaceFlowId(edge.targetNodeId)} data={{ edgeId: edge.id }} />
      </g>)}
    </svg></SpaceEditorProvider>);
    act(() => { session.setRuntime(sourceId, { execution: execution("processing", sourceId) }); });
    expect(screen.getByTestId("incoming").querySelectorAll("[stroke-dasharray]")).toHaveLength(1);
    expect(screen.getByTestId(edgeId).querySelectorAll("[stroke-dasharray]")).toHaveLength(1);
    expect(screen.getByTestId("downstream").querySelector("[stroke-dasharray]")).toBeNull();
    act(() => { session.setRuntime(sourceId, { execution: execution("completed", sourceId) }); });
    for (const edge of document.edges) expect(screen.getByTestId(edge.id).querySelector("[stroke-dasharray]")).toBeNull();
  });

  it.each(["source", "target"] as const)("suppresses activity on a paused edge with active %s and reacts to pause changes", nodeId => {
    // Pause is a real canonical command; use wire-valid IDs here while the
    // presentation-only fixtures above retain their arbitrary-ID coverage.
    const ids = { source: "source", target: "target", edge: "paused-edge" };
    const session = nodeId === "source" ? reservedResultFixture({ paused: true, ids })
      : fixture({ sourceKind: "input.prompt", port: "text", targetKind: "generate.image", targetPort: "prompt", paused: true, ids });
    session.setRuntime(nodeId, { execution: execution("processing", nodeId) });
    const { container } = render(scene(session, { id: ids.edge, source: ids.source, target: ids.target, data: { edgeId: ids.edge }, selected: true }));
    expect(container.querySelector("[stroke-dasharray]")).toBeNull();
    expect(screen.getByRole("img", { name: "Paused edge" })).toBeInTheDocument();
    expect(gradientFor(path(container)).querySelector("stop")).toHaveAttribute("stop-color", "#ea580c");
    act(() => {
      const result = session.dispatch({ type: "edge.pause", edgeId: ids.edge, hasPause: false });
      expect(result, JSON.stringify(result)).toMatchObject({ ok: true });
    });
    expect(container.querySelectorAll("[stroke-dasharray]")).toHaveLength(1);
    act(() => { expect(session.dispatch({ type: "edge.pause", edgeId: ids.edge, hasPause: true })).toMatchObject({ ok: true }); });
    expect(container.querySelector("[stroke-dasharray]")).toBeNull();
    const paused = flow.rendered.mock.calls.length;
    act(() => { session.setRuntime(nodeId, { execution: execution("completed", nodeId) }); });
    expect(flow.rendered).toHaveBeenCalledTimes(paused);
    act(() => { expect(session.dispatch({ type: "edge.pause", edgeId: ids.edge, hasPause: false })).toMatchObject({ ok: true }); });
    expect(container.querySelector("[stroke-dasharray]")).toBeNull();
  });

  it("keeps source execution visible and selection responsive on a read-only canvas without enabling edge editing", () => {
    const session = reservedResultFixture({ writable: false }), original = session.getDocument(), durable = vi.fn();
    session.subscribeDurable(durable);
    session.setRuntime(sourceId, { execution: execution("processing", sourceId) });
    const { container } = render(scene(session, { selected: true }, "angular"));
    expect(container.querySelectorAll("[stroke-dasharray]")).toHaveLength(1);
    expect(handle(container)).toBeNull();
    expect(gradientFor(path(container)).querySelector("stop")).toHaveAttribute("stop-opacity", "0.25");
    act(() => session.select([sourceId]));
    expect(gradientFor(path(container)).querySelector("stop")).toHaveAttribute("stop-opacity", "1");
    expect(container.querySelectorAll("[stroke-dasharray]")).toHaveLength(1);
    expect(handle(container)).toBeNull();
    expect(session.getDocument()).toBe(original);
    expect(durable).not.toHaveBeenCalled();
  });

  it("keeps the active glow static when reduced motion changes and releases the media subscription", () => {
    let reduced = false;
    const listeners = new Set<() => void>();
    vi.stubGlobal("matchMedia", () => ({ matches: reduced,
      addEventListener: (_event: string, listener: () => void) => listeners.add(listener),
      removeEventListener: (_event: string, listener: () => void) => listeners.delete(listener) }));
    const session = reservedResultFixture();
    session.setRuntime(sourceId, { execution: execution("processing", sourceId) });
    const { container, unmount } = render(scene(session));
    const pulse = () => container.querySelector<SVGPathElement>("[stroke-dasharray]")!;
    expect(pulse()).toBeInTheDocument();
    const originalPath = pulse().getAttribute("d");
    expect(pulse().style.animation).not.toBe("none");
    act(() => { reduced = true; listeners.forEach(listener => listener()); });
    expect(pulse()).toHaveStyle({ animation: "none" });
    expect(pulse().getAttribute("d")).toBe(originalPath);
    expect(pulse().parentElement?.querySelectorAll("path")).toHaveLength(3);
    act(() => { reduced = false; listeners.forEach(listener => listener()); });
    expect(pulse().style.animation).not.toBe("none");
    unmount();
    expect(listeners.size).toBe(0);
  });
});

describe("execution-owned edge activity", () => {
  it("keeps an old completed result still while a newly reserved result is admitted, bound and rerun", () => {
    const sourceId = "producer", targetId = "old-result", edgeId = "old-result-edge";
    const initial = reservedResultFixture({ ids: { source: sourceId, target: targetId, edge: edgeId },
      targetConfig: { assetId: "old-asset", resultSource: pendingResult({
        nodeId: sourceId, executionId: "previous-execution", state: "completed",
      }) } }).getDocument();
    const document: SpaceEditorDocument = { ...initial,
      nodes: initial.nodes.map(node => node.id === "other" ? { ...node, config: { assetId: null,
        resultSource: pendingResult({ nodeId: sourceId, executionId: null }) } } : node),
      edges: [...initial.edges, { ...initial.edges[0], id: "new-result-edge", targetNodeId: "other" }],
    };
    const session = createSpaceEditorSession({ id: "rerun-results", version: 1, document });
    session.setRuntime(sourceId, { execution: { ...execution("completed", sourceId), executionId: "previous-execution" } });
    render(<SpaceEditorProvider session={session}><SpaceEdgeGradients /><svg>
      {document.edges.map(edge => <g key={edge.id} data-testid={edge.id}>
        <SpaceEdge {...edgeProps} id={spaceFlowId(edge.id)} source={spaceFlowId(edge.sourceNodeId)}
          target={spaceFlowId(edge.targetNodeId)} data={{ edgeId: edge.id }} />
      </g>)}
    </svg></SpaceEditorProvider>);
    const oldPulse = () => screen.getByTestId(edgeId).querySelector("[stroke-dasharray]");
    const newPulse = () => screen.getByTestId("new-result-edge").querySelector("[stroke-dasharray]");
    expect(oldPulse()).toBeNull();
    expect(newPulse()).toBeNull();
    act(() => { session.patchRuntime(sourceId, { submissionPending: true, resultReservationIds: ["other"] }); });
    expect(oldPulse()).toBeNull();
    expect(newPulse()).toBeInTheDocument();
    act(() => {
      expect(session.applySystemTransaction(current => ({ ...current, nodes: current.nodes.map(node => node.id === "other"
        ? { ...node, config: { assetId: null, resultSource: pendingResult({ nodeId: sourceId, executionId: "new-execution" }) } } : node) })))
        .toMatchObject({ ok: true });
      session.setRuntime(sourceId, { execution: { ...execution("processing", sourceId), executionId: "new-execution" } });
    });
    expect(oldPulse()).toBeNull();
    expect(newPulse()).toBeInTheDocument();
    act(() => { session.setRuntime(sourceId, { execution: { ...execution("completed", sourceId), executionId: "new-execution" } }); });
    expect(oldPulse()).toBeNull();
    expect(newPulse()).toBeNull();
    act(() => { session.setRuntime(sourceId, { execution: { ...execution("pending", sourceId), executionId: "next-execution" } }); });
    expect(oldPulse()).toBeNull();
    expect(newPulse()).toBeNull();
  });

  it.each([
    { state: "completed" }, { state: "failed" }, { state: "cancelled" },
    { nodeId: "different-producer" }, { portId: "different-port" }, { executionId: "different-execution" },
    { executionId: null },
  ] satisfies Partial<ResultSourceSnapshot>[])("does not animate a result outside this active run: %j", mismatch => {
    const session = reservedResultFixture({ targetConfig: { assetId: null, resultSource: pendingResult(mismatch) } });
    session.setRuntime(sourceId, { execution: execution("processing", sourceId) });
    const { container } = render(scene(session));
    expect(container.querySelector("[stroke-dasharray]")).toBeNull();
  });

  it.each(["input.image", "input.video", "input.audio", "output.gallery"] as const)(
    "keeps an ordinary passive %s connection still even with stale endpoint executions", targetKind => {
      const media = targetKind === "input.video" ? "video" : targetKind === "input.audio" ? "audio" : "image";
      const session = fixture({ sourceKind: `generate.${media}`, port: media, targetKind,
        targetPort: targetKind === "input.image" ? "reference" : media });
      session.setRuntime(sourceId, { execution: execution("processing", sourceId) });
      session.setRuntime(targetId, { execution: execution("pending") });
      const { container } = render(scene(session));
      expect(container.querySelector("[stroke-dasharray]")).toBeNull();
    },
  );

  it("animates an old completed result when it is consumed as an active executable target's input", () => {
    const initial = fixture({ targetKind: "generate.image", targetPort: "primary" }).getDocument();
    const session = createSpaceEditorSession({ id: "consume-old-result", version: 1, document: { ...initial,
      nodes: initial.nodes.map(node => node.id === sourceId ? { ...node, config: { assetId: "old-asset",
        resultSource: pendingResult({ nodeId: "old-producer", executionId: "old-execution", state: "completed" }) } } : node),
    } });
    session.setRuntime(targetId, { execution: execution("processing") });
    const { container } = render(scene(session));
    expect(container.querySelectorAll("[stroke-dasharray]")).toHaveLength(1);
    act(() => { session.setRuntime(targetId, { execution: execution("completed") }); });
    expect(container.querySelector("[stroke-dasharray]")).toBeNull();
    act(() => { session.patchRuntime(targetId, { submissionPending: true }); });
    expect(container.querySelectorAll("[stroke-dasharray]")).toHaveLength(1);
  });

  it.each([{ resultReservationIds: undefined }, { resultReservationIds: [] }, { resultReservationIds: ["another-reservation"] }])(
    "does not admit an unbound result with reservation IDs %j", ({ resultReservationIds }) => {
      const session = reservedResultFixture({ targetConfig: { assetId: null, resultSource: pendingResult({ executionId: null }) } });
      session.setRuntime(sourceId, { execution: execution("processing", sourceId), submissionPending: true, resultReservationIds });
      const { container } = render(scene(session));
      expect(container.querySelector("[stroke-dasharray]")).toBeNull();
    },
  );

  it.each([undefined, "completed", "failed", "cancelled"] as const)(
    "admits only the explicitly reserved unbound result while the previous execution is %s", status => {
      const session = reservedResultFixture({ targetConfig: { assetId: null, resultSource: pendingResult({ executionId: null }) } });
      session.setRuntime(sourceId, { execution: status ? execution(status, sourceId) : undefined,
        submissionPending: true, resultReservationIds: [targetId] });
      const { container } = render(scene(session));
      expect(container.querySelectorAll("[stroke-dasharray]")).toHaveLength(1);
      act(() => { session.patchRuntime(sourceId, { submissionPending: false }); });
      expect(container.querySelector("[stroke-dasharray]")).toBeNull();
    },
  );

  it.each(["source", "target"] as const)("ignores an execution belonging to another node at the %s endpoint", endpoint => {
    const session = endpoint === "source" ? reservedResultFixture()
      : fixture({ sourceKind: "input.prompt", port: "text", targetKind: "generate.image", targetPort: "prompt" });
    session.setRuntime(endpoint === "source" ? sourceId : targetId, { execution: {
      ...execution("processing", endpoint === "source" ? sourceId : targetId), graphNodeId: "different-node",
    } });
    const { container } = render(scene(session));
    expect(container.querySelector("[stroke-dasharray]")).toBeNull();
  });

  it.each([
    { state: "completed" }, { state: "failed" }, { state: "cancelled" },
    { nodeId: "different-producer" }, { portId: "different-port" }, { executionId: "different-execution" },
  ] satisfies Partial<GeneratedResultGalleryItem>[])("keeps a gallery still without a matching pending item: %j", mismatch => {
    const session = galleryFixture([galleryItem(mismatch)]);
    session.setRuntime(sourceId, { execution: execution("processing", sourceId) });
    const { container } = render(scene(session));
    expect(container.querySelector("[stroke-dasharray]")).toBeNull();
  });

  it("animates a mixed gallery only for its matching pending item without progress or array-only rerenders", () => {
    const sourceId = "producer", targetId = "gallery", edgeId = "gallery-edge";
    const old = galleryItem({ nodeId: sourceId, state: "completed", executionId: "old-execution", assetId: "old-asset" });
    const current = galleryItem({ nodeId: sourceId, executionId: `execution-${sourceId}`, index: 1 });
    const unrelated = galleryItem({ nodeId: sourceId, executionId: "different-execution", index: 2 });
    const session = galleryFixture([old, current, unrelated], { ids: { source: sourceId, target: targetId, edge: edgeId } });
    session.setRuntime(sourceId, { execution: execution("pending", sourceId) });
    const { container } = render(scene(session, { id: edgeId, source: sourceId, target: targetId, data: { edgeId } }));
    expect(container.querySelectorAll("[stroke-dasharray]")).toHaveLength(1);
    const active = flow.rendered.mock.calls.length;
    act(() => {
      session.setRuntime(sourceId, { execution: { ...execution("uploading", sourceId), progress: 0.9 } });
      expect(session.applySystemTransaction(document => ({ ...document, nodes: document.nodes.map(node => node.id === targetId
        ? { ...node, config: { ...defaultConfigForKind("output.gallery"), resultItems: [{ ...old }, { ...current },
          { ...unrelated, state: "failed" }] } } : node.id === sourceId
          ? { ...node, selectedOutputAssetId: "different-selected-asset" } : node) }))).toMatchObject({ ok: true });
    });
    expect(flow.rendered).toHaveBeenCalledTimes(active);
    act(() => {
      expect(session.applySystemTransaction(document => ({ ...document, nodes: document.nodes.map(node => node.id === targetId
        ? { ...node, config: { ...defaultConfigForKind("output.gallery"), resultItems: [old,
          { ...current, state: "completed", assetId: "new-asset" }, unrelated] } } : node) }))).toMatchObject({ ok: true });
    });
    expect(container.querySelector("[stroke-dasharray]")).toBeNull();
    const completed = flow.rendered.mock.calls.length;
    act(() => { session.setRuntime(sourceId, { execution: { ...execution("processing", sourceId), executionId: "next-execution" },
      submissionPending: true, resultReservationIds: [crypto.randomUUID()] }); });
    expect(container.querySelector("[stroke-dasharray]")).toBeNull();
    expect(flow.rendered).toHaveBeenCalledTimes(completed);
  });

  it("requires the pending gallery item reservation ID rather than the gallery node ID during admission", () => {
    const item = galleryItem({ executionId: null });
    const session = galleryFixture([galleryItem({ state: "completed", executionId: "old-execution", assetId: "old-asset" }), item]);
    session.setRuntime(sourceId, { execution: execution("completed", sourceId), submissionPending: true });
    const { container } = render(scene(session));
    expect(container.querySelector("[stroke-dasharray]")).toBeNull();
    act(() => { session.patchRuntime(sourceId, { resultReservationIds: [targetId, "unrelated-item"] }); });
    expect(container.querySelector("[stroke-dasharray]")).toBeNull();
    act(() => { session.patchRuntime(sourceId, { resultReservationIds: [item.id] }); });
    expect(container.querySelectorAll("[stroke-dasharray]")).toHaveLength(1);
    act(() => { session.patchRuntime(sourceId, { submissionPending: false }); });
    expect(container.querySelector("[stroke-dasharray]")).toBeNull();
  });

  it.each(["completed", "failed", "cancelled"] as const)("stops a bound pending gallery when its producer is %s", status => {
    const session = galleryFixture([galleryItem()]);
    session.setRuntime(sourceId, { execution: execution("processing", sourceId) });
    const { container } = render(scene(session));
    expect(container.querySelectorAll("[stroke-dasharray]")).toHaveLength(1);
    act(() => { session.setRuntime(sourceId, { execution: execution(status, sourceId), submissionPending: true,
      resultReservationIds: [crypto.randomUUID()] }); });
    expect(container.querySelector("[stroke-dasharray]")).toBeNull();
  });

  it("keeps a paused gallery edge still during both admission and an accepted execution", () => {
    const sourceId = "producer", targetId = "gallery", edgeId = "gallery-edge";
    const item = galleryItem({ nodeId: sourceId, executionId: null });
    const session = galleryFixture([item], { paused: true, ids: { source: sourceId, target: targetId, edge: edgeId } });
    session.setRuntime(sourceId, { submissionPending: true, resultReservationIds: [item.id] });
    const { container } = render(scene(session, { id: edgeId, source: sourceId, target: targetId, data: { edgeId } }));
    expect(container.querySelector("[stroke-dasharray]")).toBeNull();
    act(() => {
      expect(session.applySystemTransaction(document => ({ ...document, nodes: document.nodes.map(node => node.id === targetId
        ? { ...node, config: { ...defaultConfigForKind("output.gallery"), resultItems: [galleryItem({ id: item.id,
          nodeId: sourceId, executionId: `execution-${sourceId}` })] } } : node) }))).toMatchObject({ ok: true });
      session.setRuntime(sourceId, { execution: execution("processing", sourceId) });
    });
    expect(container.querySelector("[stroke-dasharray]")).toBeNull();
  });
});

describe("transient angular edge geometry", () => {
  it("drags the selected path at the current zoom and releases without a document, history or autosave write", () => {
    const session = fixture(), original = session.getSnapshot(), durable = vi.fn();
    const unsubscribe = session.subscribeDurable(durable);
    const { container } = render(scene(session, { selected: true }, "angular"));
    const initialPath = path(container).getAttribute("d");
    expect(handle(container)).toHaveAttribute("cx", "200");
    fireEvent.pointerDown(handle(container), { button: 0, pointerId: 1, clientX: 100, clientY: 100 });
    fireEvent.pointerMove(document, { pointerId: 2, clientX: 180 });
    expect(handle(container)).toHaveAttribute("cx", "200");
    fireEvent.pointerMove(document, { pointerId: 1, clientX: 180 });
    expect(handle(container)).toHaveAttribute("cx", "240");
    expect(path(container).getAttribute("d")).not.toBe(initialPath);
    fireEvent.pointerUp(document, { pointerId: 1 });
    fireEvent.pointerMove(document, { pointerId: 1, clientX: 300 });
    expect(handle(container)).toHaveAttribute("cx", "240");
    expect(session.getSnapshot()).toBe(original);
    expect(durable).not.toHaveBeenCalled(); unsubscribe();
  });

  it.each(["Escape", "pointercancel", "blur"])("cancels on %s and rolls back only the current drag", reason => {
    const session = fixture(), { container } = render(scene(session, { selected: true }, "angular"));
    drag(container); fireEvent.pointerUp(document, { pointerId: 1 });
    drag(container);
    expect(handle(container)).toHaveAttribute("cx", "280");
    if (reason === "Escape") fireEvent.keyDown(document, { key: "Escape" });
    else if (reason === "pointercancel") fireEvent.pointerCancel(document, { pointerId: 1 });
    else fireEvent(window, new Event("blur"));
    expect(handle(container)).toHaveAttribute("cx", "240");
    fireEvent.pointerMove(document, { pointerId: 1, clientX: 500 });
    expect(handle(container)).toHaveAttribute("cx", "240");
    expect(session.getSnapshot().history.undo).toHaveLength(0);
  });

  it.each(["unmount", "Space switch", "read-only", "curved"])("releases all document listeners on %s", reason => {
    const session = fixture(), initial = session.getSnapshot();
    const { container, rerender, unmount } = render(scene(session, { selected: true }, "angular"));
    const added = vi.spyOn(document, "addEventListener"), removed = vi.spyOn(document, "removeEventListener");
    const addedWindow = vi.spyOn(window, "addEventListener"), removedWindow = vi.spyOn(window, "removeEventListener");
    drag(container);
    const listeners = added.mock.calls.filter(([type]) => ["pointermove", "pointerup", "pointercancel", "keydown"].includes(type));
    expect(listeners).toHaveLength(4);
    if (reason === "unmount") unmount();
    else if (reason === "Space switch") rerender(scene(fixture({ id: "another-space" }), { selected: true }, "angular"));
    else if (reason === "read-only") act(() => { session.reset({ id: initial.id, version: 1, document: initial.document, writable: false }); });
    else rerender(scene(session, { selected: true }, "curved"));
    for (const call of listeners) expect(removed.mock.calls).toContainEqual(call);
    for (const call of addedWindow.mock.calls.filter(([type]) => type === "blur")) expect(removedWindow.mock.calls).toContainEqual(call);
    const after = path(container)?.getAttribute("d");
    fireEvent.pointerMove(document, { pointerId: 1, clientX: 500 });
    expect(path(container)?.getAttribute("d")).toBe(after);
    if (reason === "Space switch") expect(handle(container)).toHaveAttribute("cx", "200");
    if (reason === "read-only" || reason === "curved") expect(handle(container)).toBeNull();
    expect(session.getDocument()).toBe(initial.document);
    expect(session.getSnapshot().history.undo).toHaveLength(0);
  });

  it("shows a drag handle only for selected, writable angular edges", () => {
    const session = fixture(), { container, rerender } = render(scene(session, { selected: false }, "angular"));
    expect(handle(container)).toBeNull();
    rerender(scene(session, { selected: true }));
    expect(handle(container)).toBeNull();
    rerender(scene(fixture({ writable: false }), { selected: true }, "angular"));
    expect(handle(container)).toBeNull();
  });
});
