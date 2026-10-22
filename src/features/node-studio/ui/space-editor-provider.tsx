"use client";

import { createContext, useContext, useLayoutEffect, useMemo, useRef, type ComponentType, type ReactNode } from "react";
import { useStore } from "zustand";
import { createStore } from "zustand/vanilla";
import type { CanonicalNodeKind } from "@/shared/generation-graph/node-registry";
import type { CanonicalEdge } from "@/shared/generation-graph/canonical-graph";
import type { MediaAssetDto } from "@/shared/media-assets/media-asset-contract";
import type { SpaceVideoCapturePosition } from "../lib/space-video-capture";
import type { SpaceEditorSession, SpaceEditorState } from "../model/space-editor-store";
import type { SpaceEditorCommand, SpaceNewNode, SpaceNodeMeasurement, SpacePosition } from "../model/space-editor-command-types";
import { SpaceInputResolver, type SpaceInputRuntime } from "../model/space-editor-inputs";
import { spaceNodeSize } from "../model/space-editor-flow";
import { findSpaceNodeCatalogItem } from "../model/space-editor-catalog";
import type { SpaceModelCatalog } from "../model/space-editor-ports";
import type { SpacePortReference } from "../model/space-editor-types";

export type SpaceEditorCatalog = SpaceModelCatalog & {
  isLoading: boolean; error: string | null; retry: () => void; refresh?: () => Promise<void>;
  backgroundRemovalAvailable?: boolean;
};
export interface SpaceEditorServices {
  renderNode?: ComponentType<{ nodeId: string }>;
  createNode?: (kind: CanonicalNodeKind, position: { x: number; y: number }) => SpaceNewNode;
  runNode?: (nodeId: string) => void | Promise<unknown>;
  prepareNodeExecution?: () => Promise<number>;
  cancelNode?: (nodeId: string) => void | Promise<void>;
  browseModel?: (nodeId?: string) => void;
  expandNode?: (nodeId: string) => void;
  filesDrop?: (files: File[], position: { x: number; y: number }, replaceNodeId?: string) => void | Promise<void>;
  captureVideoFrame?: (sourceId: string, asset: MediaAssetDto, position: SpaceVideoCapturePosition) => Promise<boolean>;
  openMediaDetail?: (nodeId: string, asset: MediaAssetDto, returnFocus: HTMLElement, onClosed?: () => void) => void;
  portMediaRequest?: (input: { port: SpacePortReference; action: "upload" | "assets"; position: { x: number; y: number } }) => void;
  downloadSelected?: () => void | Promise<void>;
  downloadingSelected?: boolean;
  onError?: (error: Error) => void;
}
const emptyCatalog: SpaceEditorCatalog = { imageModels: [], isLoading: false, error: null, retry: () => {} };
const emptyServices: SpaceEditorServices = {};
const emptyRuntime: SpaceInputRuntime = {};

export type SpaceNodeResize = SpaceNodeMeasurement & { x?: number; y?: number };
export interface SpaceVideoPreview { asset?: MediaAssetDto; getVideo: () => HTMLVideoElement | null }

interface SpaceResizeGesture {
  nodeId: string;
  nodeIds: readonly string[];
  positions: ReadonlyMap<string, SpacePosition>;
  measurements: ReadonlyMap<string, SpaceNodeMeasurement | null>;
  bodyHeights: ReadonlyMap<string, number | undefined>;
  sizes: ReadonlyMap<string, SpaceNodeMeasurement>;
}

interface SpaceEditorViewState {
  epoch: number;
  catalog: SpaceEditorCatalog;
  services: SpaceEditorServices;
  inputRevisionByNode: ReadonlyMap<string, number>;
  expandedNodeIds: ReadonlySet<string>;
  panelHeightByNode: ReadonlyMap<string, number>;
  bodyHeightByNode: ReadonlyMap<string, number>;
  edgeStyle: "curved" | "angular";
  edgeById: ReadonlyMap<string, CanonicalEdge>;
  portRevisionByNode: ReadonlyMap<string, number>;
  videoPreviewByNode: ReadonlyMap<string, SpaceVideoPreview>;
}

export function createSpaceEditorScope(session: SpaceEditorSession, initial: {
  catalog?: SpaceEditorCatalog; services?: SpaceEditorServices; inputRuntime?: SpaceInputRuntime;
} = {}) {
  const view = createStore<SpaceEditorViewState>(() => ({ epoch: 0, catalog: initial.catalog ?? emptyCatalog, services: initial.services ?? emptyServices,
    inputRevisionByNode: new Map(), expandedNodeIds: new Set(), panelHeightByNode: new Map(), bodyHeightByNode: new Map(), edgeStyle: "curved",
    edgeById: new Map(session.getDocument().edges.map(edge => [edge.id, edge])), portRevisionByNode: new Map(), videoPreviewByNode: new Map() }));
  let inputRuntime = initial.inputRuntime ?? emptyRuntime;
  const inputs = new SpaceInputResolver(session.getDocument(), inputRuntime);
  let stop: (() => void) | null = null;
  let indexedEdges = session.getDocument().edges;
  let activeResize: SpaceResizeGesture | null = null;
  let memoSizes = new Map<string, SpaceNodeMeasurement>();
  let syncingMemoSizes = false;
  const runPreparations = new Map<string, { epoch: number; prepare: () => boolean }>();
  const ownsGesture = (resize: SpaceResizeGesture) => {
    const gesture = session.getSnapshot().gesture;
    return gesture?.kind === "nodes" && gesture.nodeIds === resize.nodeIds;
  };
  const releaseResize = (nodeId?: string, restore = true) => {
    const resize = activeResize;
    if (!resize || (nodeId !== undefined && !resize.nodeIds.includes(nodeId))) return;
    activeResize = null;
    if (ownsGesture(resize)) session.cancelGesture();
    const bodyHeightByNode = new Map(view.getState().bodyHeightByNode);
    for (const id of resize.nodeIds) {
      const body = restore ? resize.bodyHeights.get(id) : undefined;
      if (body === undefined || !session.getSnapshot().nodeById.has(id)) bodyHeightByNode.delete(id);
      else bodyHeightByNode.set(id, body);
      if (restore) session.measure(id, resize.measurements.get(id) ?? null);
    }
    view.setState({ bodyHeightByNode });
  };
  const cancelResize = (nodeId?: string) => { releaseResize(nodeId); };
  // Canonical Memo size is authoritative after history/config changes. Publish the
  // index before measuring: measure synchronously notifies this same subscription.
  const refreshMemoSizes = (reset = false) => {
    if (syncingMemoSizes || session.getSnapshot().disposed) return;
    const next = new Map<string, SpaceNodeMeasurement>();
    const changed: [string, SpaceNodeMeasurement][] = [];
    for (const node of session.getDocument().nodes) {
      if (node.kind !== "note.memo") continue;
      const size = spaceNodeSize(node, { geometryByNode: {} }), previous = memoSizes.get(node.id);
      next.set(node.id, size);
      if (reset || !previous || previous.width !== size.width || previous.height !== size.height) changed.push([node.id, size]);
    }
    memoSizes = next;
    if (!changed.length) return;
    syncingMemoSizes = true;
    try {
      if (activeResize && changed.some(([id]) => activeResize?.nodeIds.includes(id))) cancelResize();
      const current = view.getState(), bodyHeightByNode = new Map(current.bodyHeightByNode);
      for (const [id, size] of changed) bodyHeightByNode.set(id, Math.max(100, size.height - (current.panelHeightByNode.get(id) ?? 0)));
      view.setState({ bodyHeightByNode });
      for (const [id, size] of changed) session.measure(id, size);
    } finally { syncingMemoSizes = false; }
  };
  const ensureResizeDimensions = () => {
    const state = session.getSnapshot();
    if (state.disposed) return;
    for (const node of state.document.nodes) {
      const bounds = findSpaceNodeCatalogItem(node.kind)?.geometry;
      if (!bounds) continue;
      const size = spaceNodeSize(node, state);
      const width = Math.max(size.width, bounds.minWidth), height = Math.max(size.height, bounds.minHeight);
      if (width === size.width && height === size.height) continue;
      // XYResizer assumes its starting size is inside the resize bounds. Apply
      // them before pointer input, without rewriting canonical node config.
      const current = view.getState();
      if (height !== size.height && current.bodyHeightByNode.has(node.id))
        view.setState({ bodyHeightByNode: new Map(current.bodyHeightByNode).set(node.id, Math.max(100, height - (current.panelHeightByNode.get(node.id) ?? 0))) });
      session.measure(node.id, { width, height });
    }
  };
  const refreshEdges = () => {
    const state = session.getSnapshot();
    if (state.document.edges === indexedEdges) return;
    const old = new Map(indexedEdges.map(edge => [edge.id, edge]));
    const dirty = new Set<string>();
    for (const edge of state.document.edges) { const before = old.get(edge.id); if (before !== edge) { dirty.add(edge.sourceNodeId); dirty.add(edge.targetNodeId); if (before) { dirty.add(before.sourceNodeId); dirty.add(before.targetNodeId); } } old.delete(edge.id); }
    for (const edge of old.values()) { dirty.add(edge.sourceNodeId); dirty.add(edge.targetNodeId); }
    const revisions = new Map(view.getState().portRevisionByNode);
    for (const id of dirty) if (state.nodeById.has(id)) revisions.set(id, (revisions.get(id) ?? 0) + 1); else revisions.delete(id);
    indexedEdges = state.document.edges;
    view.setState({ edgeById: new Map(indexedEdges.map(edge => [edge.id, edge])), portRevisionByNode: revisions });
  };
  const refreshInputs = () => {
    const dirty = inputs.updateGraph(session.getDocument(), inputRuntime);
    if (!dirty.size) return;
    const revisions = new Map(view.getState().inputRevisionByNode);
    for (const id of dirty) revisions.set(id, inputs.inputRevision(id));
    for (const id of revisions.keys()) if (!session.getSnapshot().nodeById.has(id)) revisions.delete(id);
    view.setState({ inputRevisionByNode: revisions });
  };
  const scope = {
    session, view, inputs,
    getInputRuntime: () => inputRuntime,
    registerNodeVideoPreview(nodeId: string, preview: SpaceVideoPreview) {
      const state = session.getSnapshot();
      if (state.disposed || !state.nodeById.has(nodeId)) return () => {};
      view.setState({ videoPreviewByNode: new Map(view.getState().videoPreviewByNode).set(nodeId, preview) });
      return () => {
        if (view.getState().videoPreviewByNode.get(nodeId) !== preview) return;
        const next = new Map(view.getState().videoPreviewByNode); next.delete(nodeId);
        view.setState({ videoPreviewByNode: next });
      };
    },
    registerNodeRunPreparation(nodeId: string, prepare: () => boolean) {
      const entry = { epoch: view.getState().epoch, prepare };
      runPreparations.set(nodeId, entry);
      return () => { if (runPreparations.get(nodeId) === entry) runPreparations.delete(nodeId); };
    },
    prepareNodeRun(nodeId: string) {
      const state = session.getSnapshot(), entry = runPreparations.get(nodeId);
      if (!state.writable || state.disposed || !state.nodeById.has(nodeId)) return false;
      if (!entry) return true;
      return entry.epoch === view.getState().epoch && entry.prepare();
    },
    start() {
      if (!stop) {
        refreshEdges();
        refreshInputs();
        refreshMemoSizes();
        ensureResizeDimensions();
        stop = session.store.subscribe((state, previous) => {
          const reset = state.revision === 0 && state.history !== previous.history;
          if (reset || state.disposed) view.setState({ epoch: view.getState().epoch + (reset ? 1 : 0), videoPreviewByNode: new Map() });
          if (activeResize && (reset || !state.writable || state.disposed || !ownsGesture(activeResize)
            || activeResize.nodeIds.some(id => !state.nodeById.has(id)))) releaseResize(undefined, !reset && !state.disposed);
          refreshEdges();
          if (state.document.nodes !== previous.document.nodes) {
            const current = view.getState(), ids = state.nodeById;
            for (const id of runPreparations.keys()) if (!ids.has(id)) runPreparations.delete(id);
            const filter = <T,>(map: ReadonlyMap<string, T>) => [...map.keys()].every(id => ids.has(id)) ? map : new Map([...map].filter(([id]) => ids.has(id)));
            const expandedNodeIds = [...current.expandedNodeIds].every(id => ids.has(id)) ? current.expandedNodeIds : new Set([...current.expandedNodeIds].filter(id => ids.has(id)));
            const panelHeightByNode = filter(current.panelHeightByNode), bodyHeightByNode = filter(current.bodyHeightByNode), portRevisionByNode = filter(current.portRevisionByNode), videoPreviewByNode = filter(current.videoPreviewByNode);
            if (expandedNodeIds !== current.expandedNodeIds || panelHeightByNode !== current.panelHeightByNode || bodyHeightByNode !== current.bodyHeightByNode || portRevisionByNode !== current.portRevisionByNode || videoPreviewByNode !== current.videoPreviewByNode)
              view.setState({ expandedNodeIds, panelHeightByNode, bodyHeightByNode, portRevisionByNode, videoPreviewByNode });
          }
          if (reset || state.document.nodes !== previous.document.nodes) { refreshMemoSizes(reset); ensureResizeDimensions(); }
          if (state.document !== previous.document) refreshInputs();
        });
      }
      return () => { cancelResize(); stop?.(); stop = null; runPreparations.clear(); view.setState({ videoPreviewByNode: new Map() }); };
    },
    configure(catalog: SpaceEditorCatalog, services: SpaceEditorServices, runtime: SpaceInputRuntime) {
      const current = view.getState();
      if (current.catalog !== catalog || current.services !== services) view.setState({ catalog, services });
      if (inputRuntime !== runtime) { inputRuntime = runtime; refreshInputs(); }
    },
    toggleExpanded(nodeId: string) {
      const next = new Set(view.getState().expandedNodeIds);
      if (next.has(nodeId)) next.delete(nodeId); else next.add(nodeId);
      view.setState({ expandedNodeIds: next });
    },
    setPanelHeight(nodeId: string, height: number) {
      const node = session.getSnapshot().nodeById.get(nodeId);
      if (!node || !Number.isFinite(height) || height < 0) return;
      const current = view.getState(), previous = current.panelHeightByNode.get(nodeId) ?? 0;
      if (Math.abs(previous - height) < 1) return;
      const size = spaceNodeSize(node, session.getSnapshot());
      const body = current.bodyHeightByNode.get(nodeId) ?? Math.max(100, size.height - previous);
      view.setState({ panelHeightByNode: new Map(current.panelHeightByNode).set(nodeId, height), bodyHeightByNode: new Map(current.bodyHeightByNode).set(nodeId, body) });
      session.measure(nodeId, { width: size.width, height: body + height });
    },
    beginResize(nodeId: string): boolean {
      if (activeResize?.nodeId === nodeId && ownsGesture(activeResize)) return true;
      if (activeResize) cancelResize();
      const state = session.getSnapshot();
      if (!state.writable || state.disposed || !state.nodeById.has(nodeId) || state.gesture) return false;
      const nodeIds = state.selectedNodeIds.includes(nodeId) ? state.selectedNodeIds : [nodeId];
      if (!session.beginGesture({ kind: "nodes", nodeIds }).ok) return false;
      const gesture = session.getSnapshot().gesture;
      if (gesture?.kind !== "nodes") return false;
      activeResize = { nodeId, nodeIds: gesture.nodeIds,
        positions: new Map(nodeIds.map(id => [id, state.nodeById.get(id)!.position])),
        measurements: new Map(nodeIds.map(id => [id, Object.hasOwn(state.geometryByNode, id) ? state.geometryByNode[id] : null])),
        bodyHeights: new Map(nodeIds.map(id => [id, view.getState().bodyHeightByNode.get(id)])),
        sizes: new Map(nodeIds.map(id => [id, spaceNodeSize(state.nodeById.get(id)!, state)])) };
      return true;
    },
    isResizing(nodeId: string): boolean { return Boolean(activeResize?.nodeIds.includes(nodeId) && ownsGesture(activeResize)); },
    cancelResize,
    resize(nodeId: string, size: SpaceNodeResize, finished: boolean) {
      if (!Number.isFinite(size.width) || !Number.isFinite(size.height) || size.width <= 0 || size.height <= 0) { cancelResize(nodeId); return; }
      // Width/height-only callers remain valid; real NodeResizers begin explicitly.
      if (!scope.beginResize(nodeId) || !activeResize) return;
      const resize = activeResize;
      const measurement = { width: size.width, height: size.height };
      const current = view.getState(), bodyHeightByNode = new Map(current.bodyHeightByNode);
      for (const id of resize.nodeIds) {
        bodyHeightByNode.set(id, Math.max(100, size.height - (current.panelHeightByNode.get(id) ?? 0)));
        session.measure(id, measurement);
      }
      view.setState({ bodyHeightByNode });
      if (Number.isFinite(size.x) || Number.isFinite(size.y)) {
        const position = session.getNodePosition(nodeId)!;
        const x = Number.isFinite(size.x) ? size.x! : position.x, y = Number.isFinite(size.y) ? size.y! : position.y;
        // Other selected nodes inherit dimensions, as before; only the active
        // north/west handle changes its node's origin.
        session.updateGesture({ positions: { [nodeId]: { x, y } } });
      }
      if (!finished) return;
      const gesture = session.getSnapshot().gesture;
      const commands: SpaceEditorCommand[] = [];
      if (gesture?.kind === "nodes" && Object.keys(gesture.positions).length) commands.push({ type: "nodes.move", positions: gesture.positions });
      for (const id of resize.nodeIds) {
        const before = resize.sizes.get(id)!;
        if (session.getSnapshot().nodeById.get(id)?.kind === "note.memo" && (before.width !== measurement.width || before.height !== measurement.height))
          commands.push({ type: "node.config.patch", nodeId: id, patch: { size: measurement } });
      }
      // The resize owns the gesture. Clear it without a separate move/history entry.
      activeResize = null;
      session.cancelGesture();
      if (commands.length) {
        const result = session.dispatch({ type: "batch", commands });
        if (!result.ok) {
          activeResize = resize;
          cancelResize();
          view.getState().services.onError?.(new Error(result.message));
        } else refreshMemoSizes();
      }
    },
    toggleEdgeStyle() { view.setState({ edgeStyle: view.getState().edgeStyle === "curved" ? "angular" : "curved" }); },
  };
  return scope;
}
export type SpaceEditorScope = ReturnType<typeof createSpaceEditorScope>;
export const SpacePortMenuContext = createContext<(port: SpacePortReference, position: { x: number; y: number }) => void>(() => {});
const Context = createContext<SpaceEditorScope | null>(null);

export function SpaceEditorProvider({ session, scope: providedScope, catalog = emptyCatalog, services = emptyServices, inputRuntime = emptyRuntime, children }: {
  session: SpaceEditorSession; scope?: SpaceEditorScope; catalog?: SpaceEditorCatalog; services?: SpaceEditorServices; inputRuntime?: SpaceInputRuntime; children: ReactNode;
}) {
  const scope = useMemo(() => providedScope ?? createSpaceEditorScope(session), [providedScope, session]);
  if (scope.session !== session) throw new Error("SPACE_EDITOR_SCOPE_SESSION_MISMATCH");
  useLayoutEffect(() => scope.start(), [scope]);
  useLayoutEffect(() => { scope.configure(catalog, services, inputRuntime); }, [scope, catalog, services, inputRuntime]);
  return <Context.Provider value={scope}>{children}</Context.Provider>;
}
export function useSpaceEditor() {
  const value = useContext(Context);
  if (!value) throw new Error("SPACE_EDITOR_PROVIDER_MISSING");
  return value;
}
export function useSpaceSelector<T>(selector: (state: SpaceEditorState) => T): T { return useStore(useSpaceEditor().session.store, selector); }
export function useSpaceViewSelector<T>(selector: (state: SpaceEditorViewState) => T): T { return useStore(useSpaceEditor().view, selector); }
export function useSpaceInputRevision(nodeId: string) { return useSpaceViewSelector(state => state.inputRevisionByNode.get(nodeId) ?? 0); }

/** Runtime-only player reference shared with the selection portal. */
export function useSpaceVideoPreview(nodeId: string, enabled: boolean, asset?: MediaAssetDto) {
  const scope = useSpaceEditor(), epoch = useSpaceViewSelector(state => state.epoch), video = useRef<HTMLVideoElement>(null);
  useLayoutEffect(() => {
    if (enabled) return scope.registerNodeVideoPreview(nodeId, { asset, getVideo: () => video.current });
  }, [scope, nodeId, enabled, asset, epoch]);
  return video;
}

/** The resolver mutates behind a stable reference; its revision is the read boundary. */
export function useSpaceResolvedInput<T>(nodeId: string, read: (inputs: SpaceInputResolver) => T): T {
  "use no memo";
  // Keep the actual React memo here. Compiler inference cannot see mutations
  // inside resolver methods and would otherwise drop the revision dependency.
  const scope = useSpaceEditor(), revision = useSpaceInputRevision(nodeId);
  return useMemo(() => {
    void nodeId; void revision;
    return read(scope.inputs);
  }, [scope, nodeId, revision, read]);
}
