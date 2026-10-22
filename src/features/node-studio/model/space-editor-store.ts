import { createStore, type StoreApi } from "zustand/vanilla";

import { analyzeCanonicalGraphSupport, pruneGroupsAfterNodeDeletion, type CanonicalGroup, type CanonicalNode } from "@/shared/generation-graph/canonical-graph";
import { isUnavailableEditNodeKind } from "@/shared/generation-graph/node-availability";

import type { GenerationGraphSnapshotDto } from "./graph-types";
import { applySpaceEditorCommand, prepareSpaceEditorTransaction, type SpaceEditorPersistedRetired } from "./space-editor-commands";
import type {
  SpaceEditorCommand,
  SpaceEditorCommandResult,
  SpaceEditorFailure,
  SpaceNodeMeasurement,
  SpaceNodeMeasurements,
  SpacePosition,
} from "./space-editor-command-types";
import { generationSnapshotToEditorDocument } from "./space-editor-document";
import { applySpaceEditorHistoryEntry, createSpaceEditorHistoryEntry, spaceEditorHistoryLimit, spaceEditorValueEqual, type SpaceEditorHistoryEntry } from "./space-editor-history";
import type { SpaceEditorDocument, SpaceEditorTransactionOrigin, SpaceNodeRuntime } from "./space-editor-types";

export type SpaceEditorSessionSnapshot = GenerationGraphSnapshotDto | {
  id: string;
  version: number;
  document: SpaceEditorDocument;
  writable?: boolean;
  readOnlyReason?: string | null;
  persistedNodeIds?: Iterable<string>;
  persistedEdgeIds?: Iterable<string>;
  persistedGroupIds?: Iterable<string>;
};

export type SpaceEditorGestureStart =
  | { kind: "nodes"; nodeIds: readonly string[] }
  | { kind: "group.move" | "group.resize"; groupId: string };

export type SpaceEditorGesture =
  | { kind: "nodes"; nodeIds: readonly string[]; positions: Readonly<Record<string, SpacePosition>> }
  | { kind: "group.move"; groupId: string; delta: SpacePosition }
  | { kind: "group.resize"; groupId: string; bounds: CanonicalGroup["bounds"] };

export interface SpaceEditorState {
  id: string;
  version: number;
  document: SpaceEditorDocument;
  nodeById: ReadonlyMap<string, CanonicalNode>;
  writable: boolean;
  readOnlyReason: string | null;
  persistedNodeIds: ReadonlySet<string>;
  persistedEdgeIds: ReadonlySet<string>;
  persistedGroupIds: ReadonlySet<string>;
  selectedNodeIds: readonly string[];
  selectedEdgeIds: readonly string[];
  hoveredNodeId: string | null;
  hoveredEdgeId: string | null;
  viewport: Readonly<{ x: number; y: number; zoom: number }>;
  geometryByNode: SpaceNodeMeasurements;
  gesture: SpaceEditorGesture | null;
  runtimeByNode: ReadonlyMap<string, SpaceNodeRuntime>;
  history: { undo: readonly SpaceEditorHistoryEntry[]; redo: readonly SpaceEditorHistoryEntry[] };
  revision: number;
  disposed: boolean;
}

export interface SpaceEditorDurableEvent {
  document: SpaceEditorDocument;
  previousDocument: SpaceEditorDocument;
  /** False for explicit selection of the already-selected representative asset. */
  documentChanged: boolean;
  origin: SpaceEditorTransactionOrigin;
  cause: string;
  selectionNodeIds: readonly string[];
  revision: number;
}

export interface SpaceEditorTransactionOptions {
  origin: SpaceEditorTransactionOrigin;
  label?: string;
  selectionNodeIds?: readonly string[];
}

export interface SpaceEditorAck {
  id?: string;
  version: number;
  persistedNodeIds?: Iterable<string>;
  persistedEdgeIds?: Iterable<string>;
  persistedGroupIds?: Iterable<string>;
}

type SaveAcknowledgement = Pick<SpaceEditorState, "version" | "persistedNodeIds" | "persistedEdgeIds" | "persistedGroupIds">;

function capturePersistedRetired(state: SpaceEditorState): SpaceEditorPersistedRetired {
  const nodes = new Map(state.document.nodes.filter((node) => state.persistedNodeIds.has(node.id) && isUnavailableEditNodeKind(node.kind))
    .map((node) => [node.id, structuredClone(node)]));
  const edges = new Map(state.document.edges.filter((edge) => state.persistedEdgeIds.has(edge.id)
    && state.persistedNodeIds.has(edge.sourceNodeId) && state.persistedNodeIds.has(edge.targetNodeId)
    && (nodes.has(edge.sourceNodeId) || nodes.has(edge.targetNodeId))).map((edge) => [edge.id, structuredClone(edge)]));
  return { nodes, edges };
}

function initialState(snapshot: SpaceEditorSessionSnapshot): SpaceEditorState {
  const document = "document" in snapshot ? snapshot.document : generationSnapshotToEditorDocument(snapshot);
  const support = analyzeCanonicalGraphSupport(document);
  return {
    id: snapshot.id, version: snapshot.version, document,
    nodeById: new Map(document.nodes.map((node) => [node.id, node])),
    writable: snapshot.writable !== false && support.writable,
    readOnlyReason: snapshot.writable === false ? snapshot.readOnlyReason ?? "READ_ONLY" : support.readOnlyReason,
    persistedNodeIds: new Set(("persistedNodeIds" in snapshot ? snapshot.persistedNodeIds : undefined) ?? document.nodes.map((node) => node.id)),
    persistedEdgeIds: new Set(("persistedEdgeIds" in snapshot ? snapshot.persistedEdgeIds : undefined) ?? document.edges.map((edge) => edge.id)),
    persistedGroupIds: new Set(("persistedGroupIds" in snapshot ? snapshot.persistedGroupIds : undefined) ?? document.groups.map((group) => group.id)),
    selectedNodeIds: [], selectedEdgeIds: [], hoveredNodeId: null, hoveredEdgeId: null,
    viewport: { x: 0, y: 0, zoom: 1 }, geometryByNode: {}, gesture: null, runtimeByNode: new Map(),
    history: { undo: [], redo: [] }, revision: 0, disposed: false,
  };
}

function failure(code: SpaceEditorFailure["code"]): SpaceEditorFailure { return { ok: false, code, message: code }; }

/** One canonical document and stable actions per Space; no global store or runtime graph. */
export function createSpaceEditorSession(snapshot: SpaceEditorSessionSnapshot, options: { createId?: () => string } = {}) {
  const store = createStore<SpaceEditorState>(() => initialState(snapshot));
  const durableListeners = new Set<(event: SpaceEditorDurableEvent) => void>();
  const subscriptions = new Set<() => void>();
  let serverWritable = snapshot.writable !== false;
  let serverReadOnlyReason = snapshot.readOnlyReason ?? "READ_ONLY";
  let persistedRetired = capturePersistedRetired(store.getState());
  const revokedRetiredNodeIds = new Set<string>();
  const revokedRetiredEdgeIds = new Set<string>();

  const getDocument = () => store.getState().document;
  const getSnapshot = store.getState;
  const unchanged = (): SpaceEditorCommandResult => ({ ok: true, changed: false, document: getDocument(), selectionNodeIds: [] });

  function publish(result: SpaceEditorCommandResult, origin: SpaceEditorTransactionOrigin, cause: string, history?: SpaceEditorState["history"], acknowledgement?: SaveAcknowledgement): SpaceEditorCommandResult {
    if (!result.ok || (!result.changed && !result.selectionNodeIds.length)) {
      if (acknowledgement) store.setState(acknowledgement);
      return result;
    }
    const previous = store.getState(), document = result.document;
    if (!result.changed) {
      const revision = previous.revision + 1;
      store.setState({ ...acknowledgement, revision });
      const event: SpaceEditorDurableEvent = { document, previousDocument: previous.document, documentChanged: false, origin, cause, selectionNodeIds: result.selectionNodeIds, revision };
      for (const listener of [...durableListeners]) listener(event);
      return result;
    }
    const support = analyzeCanonicalGraphSupport(document);
    const nodeIds = new Set(document.nodes.map((node) => node.id)), edgeIds = new Set(document.edges.map((edge) => edge.id));
    const filterIds = (ids: readonly string[], allowed: ReadonlySet<string>) => ids.every((id) => allowed.has(id)) ? ids : ids.filter((id) => allowed.has(id));
    const runtimeByNode = [...previous.runtimeByNode.keys()].every((id) => nodeIds.has(id)) ? previous.runtimeByNode
      : new Map([...previous.runtimeByNode].filter(([id]) => nodeIds.has(id)));
    const geometryByNode = Object.keys(previous.geometryByNode).every((id) => nodeIds.has(id)) ? previous.geometryByNode
      : Object.fromEntries(Object.entries(previous.geometryByNode).filter(([id]) => nodeIds.has(id)));
    const revision = previous.revision + 1;
    const nextHistory = history ?? (origin === "user" ? {
      undo: [...previous.history.undo, createSpaceEditorHistoryEntry(previous.document, document, result.selectionNodeIds, cause)].slice(-spaceEditorHistoryLimit), redo: [],
    } : previous.history);
    store.setState({
      ...acknowledgement,
      document, nodeById: document.nodes === previous.document.nodes ? previous.nodeById : new Map(document.nodes.map((node) => [node.id, node])),
      writable: serverWritable && support.writable, readOnlyReason: serverWritable ? support.readOnlyReason : serverReadOnlyReason,
      selectedNodeIds: result.selectedNodeIds ?? filterIds(previous.selectedNodeIds, nodeIds),
      selectedEdgeIds: result.selectedNodeIds ? [] : filterIds(previous.selectedEdgeIds, edgeIds),
      hoveredNodeId: previous.hoveredNodeId && nodeIds.has(previous.hoveredNodeId) ? previous.hoveredNodeId : null,
      hoveredEdgeId: previous.hoveredEdgeId && edgeIds.has(previous.hoveredEdgeId) ? previous.hoveredEdgeId : null,
      runtimeByNode, geometryByNode, history: nextHistory, revision,
    });
    const event: SpaceEditorDurableEvent = { document, previousDocument: previous.document, documentChanged: true, origin, cause, selectionNodeIds: result.selectionNodeIds, revision };
    for (const listener of [...durableListeners]) listener(event);
    return result;
  }

  function dispatch(command: SpaceEditorCommand): SpaceEditorCommandResult {
    const state = store.getState();
    if (state.disposed) return failure("DISPOSED");
    return publish(applySpaceEditorCommand(state.document, command, { writable: state.writable, measurements: state.geometryByNode, createId: options.createId, persistedRetired }), "user", command.type);
  }

  function transact(transform: (document: SpaceEditorDocument) => SpaceEditorDocument, transaction: SpaceEditorTransactionOptions = { origin: "user" }): SpaceEditorCommandResult {
    const state = store.getState();
    if (state.disposed) return failure("DISPOSED");
    if (transaction.origin === "user" && !state.writable) return failure("READ_ONLY");
    let candidate: SpaceEditorDocument;
    try { candidate = transform(state.document); }
    catch (error) { return { ok: false, code: "INVALID_COMMAND", message: error instanceof Error ? error.message : "Invalid editor transaction." }; }
    return publish(prepareSpaceEditorTransaction(state.document, candidate, { ...transaction, writable: state.writable, persistedRetired }), transaction.origin, transaction.label ?? transaction.origin);
  }

  function applySystemTransaction(transform: (document: SpaceEditorDocument) => SpaceEditorDocument): SpaceEditorCommandResult {
    return transact(transform, { origin: "system" });
  }

  function travel(direction: "undo" | "redo"): SpaceEditorCommandResult {
    const state = store.getState();
    if (state.disposed) return failure("DISPOSED");
    if (!state.writable) return failure("READ_ONLY");
    const entry = state.history[direction].at(-1);
    if (!entry) return unchanged();
    const historical = applySpaceEditorHistoryEntry(state.document, entry, direction);
    // A deletion acknowledged by the server cannot be undone into a new retired
    // entity. Drop only those restorations so the entry cannot block older edits.
    const revokedNodes = new Set(historical.nodes.filter((node) => isUnavailableEditNodeKind(node.kind)
      && revokedRetiredNodeIds.has(node.id)).map((node) => node.id));
    const nodes = historical.nodes.filter((node) => !revokedNodes.has(node.id));
    const retiredIds = new Set(nodes.filter((node) => isUnavailableEditNodeKind(node.kind)).map((node) => node.id));
    const candidate = { ...historical, nodes,
      edges: historical.edges.filter((edge) => !revokedRetiredNodeIds.has(edge.sourceNodeId) && !revokedRetiredNodeIds.has(edge.targetNodeId)
        && !(revokedRetiredEdgeIds.has(edge.id) && (retiredIds.has(edge.sourceNodeId) || retiredIds.has(edge.targetNodeId)))),
      groups: pruneGroupsAfterNodeDeletion(historical.groups, revokedRetiredNodeIds),
    };
    const result = prepareSpaceEditorTransaction(state.document, candidate, { origin: "user", writable: state.writable, selectionNodeIds: entry.selectionNodeIds, normalizeResults: false, persistedRetired, restorePersistedRetired: true });
    if (!result.ok) return result;
    const opposite = direction === "undo" ? "redo" : "undo";
    // Capture actual owned values at traversal time (e.g. a newly added node's
    // result arrived before undo). Redo restores that entity's current data.
    const inverse = direction === "undo"
      ? createSpaceEditorHistoryEntry(result.document, state.document, entry.selectionNodeIds, entry.label)
      : createSpaceEditorHistoryEntry(state.document, result.document, entry.selectionNodeIds, entry.label);
    const history = { ...state.history, [direction]: state.history[direction].slice(0, -1), [opposite]: [...state.history[opposite], inverse].slice(-spaceEditorHistoryLimit) };
    if (!result.changed) store.setState({ history });
    return publish(result, "user", direction, history);
  }

  function ack(value: SpaceEditorAck): void {
    const state = store.getState();
    if (state.disposed || (value.id !== undefined && value.id !== state.id) || !Number.isInteger(value.version) || value.version < state.version) return;
    const acknowledgement: SaveAcknowledgement = { version: value.version,
      persistedNodeIds: value.persistedNodeIds ? new Set(value.persistedNodeIds) : state.persistedNodeIds,
      persistedEdgeIds: value.persistedEdgeIds ? new Set(value.persistedEdgeIds) : state.persistedEdgeIds,
      persistedGroupIds: value.persistedGroupIds ? new Set(value.persistedGroupIds) : state.persistedGroupIds,
    };
    const removedNodeIds = new Set([...persistedRetired.nodes.keys()].filter((id) => !acknowledgement.persistedNodeIds.has(id)));
    const removedEdgeIds = new Set([...persistedRetired.edges].filter(([id, edge]) => !acknowledgement.persistedEdgeIds.has(id)
      || !acknowledgement.persistedNodeIds.has(edge.sourceNodeId) || !acknowledgement.persistedNodeIds.has(edge.targetNodeId)).map(([id]) => id));
    const previousRetired = persistedRetired;
    for (const id of removedNodeIds) revokedRetiredNodeIds.add(id);
    for (const id of removedEdgeIds) revokedRetiredEdgeIds.add(id);
    // IDs can confirm preservation/removal, never grant new retired authoring or
    // substitute a locally edited config for the original persisted JSON.
    persistedRetired = {
      nodes: new Map([...persistedRetired.nodes].filter(([id]) => !removedNodeIds.has(id))),
      edges: new Map([...persistedRetired.edges].filter(([id]) => !removedEdgeIds.has(id))),
    };
    if (!removedNodeIds.size && !removedEdgeIds.size) { store.setState(acknowledgement); return; }
    if (removedEdgeIds.size) acknowledgement.persistedEdgeIds = new Set([...acknowledgement.persistedEdgeIds].filter((id) => !removedEdgeIds.has(id)));
    // Undo can run while a deletion save is in flight. Once its ack arrives,
    // that retired entity cannot be saved again; remove only that restoration,
    // retaining all unrelated local edits, system results and history.
    const removedNodes = new Set(state.document.nodes.filter((node) => removedNodeIds.has(node.id) && isUnavailableEditNodeKind(node.kind)).map((node) => node.id));
    const candidate = { ...state.document,
      nodes: state.document.nodes.filter((node) => !removedNodes.has(node.id)),
      edges: state.document.edges.filter((edge) => !removedNodes.has(edge.sourceNodeId) && !removedNodes.has(edge.targetNodeId)
        && !(removedEdgeIds.has(edge.id) && (previousRetired.nodes.has(edge.sourceNodeId) || previousRetired.nodes.has(edge.targetNodeId)))),
      groups: pruneGroupsAfterNodeDeletion(state.document.groups, removedNodes),
    };
    publish(prepareSpaceEditorTransaction(state.document, candidate, { origin: "system" }), "system", "ack.retired-removal", undefined, acknowledgement);
  }

  function setAccess(writable: boolean, reason: string | null = null): void {
    const state = store.getState();
    if (state.disposed) return;
    serverWritable = writable;
    serverReadOnlyReason = reason ?? "READ_ONLY";
    const support = analyzeCanonicalGraphSupport(state.document);
    const nextWritable = serverWritable && support.writable;
    const readOnlyReason = serverWritable ? support.readOnlyReason : serverReadOnlyReason;
    if (state.writable !== nextWritable || state.readOnlyReason !== readOnlyReason) store.setState({
      writable: nextWritable, readOnlyReason, ...(!nextWritable ? { gesture: null } : {}),
    });
  }

  function reset(value: SpaceEditorSessionSnapshot): void {
    if (store.getState().disposed) return;
    serverWritable = value.writable !== false;
    serverReadOnlyReason = value.readOnlyReason ?? "READ_ONLY";
    const next = initialState(value);
    persistedRetired = capturePersistedRetired(next);
    revokedRetiredNodeIds.clear();
    revokedRetiredEdgeIds.clear();
    store.setState(next, true);
  }

  function select(nodeIds: readonly string[], edgeIds: readonly string[] = []): void {
    const state = store.getState();
    if (state.disposed) return;
    const selectedNodeIds = [...new Set(nodeIds)].filter((id) => state.nodeById.has(id));
    const selectedEdgeIds = [...new Set(edgeIds)].filter((id) => state.document.edges.some((edge) => edge.id === id));
    if (spaceEditorValueEqual(state.selectedNodeIds, selectedNodeIds) && spaceEditorValueEqual(state.selectedEdgeIds, selectedEdgeIds)) return;
    store.setState({ selectedNodeIds, selectedEdgeIds });
  }

  function hover(nodeId: string | null, edgeId: string | null = null): void {
    const state = store.getState();
    if (state.disposed) return;
    const hoveredNodeId = nodeId && state.nodeById.has(nodeId) ? nodeId : null;
    const hoveredEdgeId = edgeId && state.document.edges.some((edge) => edge.id === edgeId) ? edgeId : null;
    if (state.hoveredNodeId !== hoveredNodeId || state.hoveredEdgeId !== hoveredEdgeId) store.setState({ hoveredNodeId, hoveredEdgeId });
  }

  function measure(nodeId: string, measurement: SpaceNodeMeasurement | null): void {
    const state = store.getState();
    if (state.disposed || !state.nodeById.has(nodeId)) return;
    if (measurement && (!Number.isFinite(measurement.width) || !Number.isFinite(measurement.height) || measurement.width <= 0 || measurement.height <= 0)) return;
    if (spaceEditorValueEqual(Object.hasOwn(state.geometryByNode, nodeId) ? state.geometryByNode[nodeId] : null, measurement)) return;
    const geometryByNode = { ...state.geometryByNode };
    if (measurement) Object.defineProperty(geometryByNode, nodeId, { value: measurement, enumerable: true, configurable: true, writable: true });
    else delete geometryByNode[nodeId];
    store.setState({ geometryByNode });
  }

  function setRuntime(nodeId: string, runtime: SpaceNodeRuntime | undefined): void {
    const state = store.getState();
    if (state.disposed || !state.nodeById.has(nodeId) || state.runtimeByNode.get(nodeId) === runtime) return;
    const runtimeByNode = new Map(state.runtimeByNode);
    if (runtime) runtimeByNode.set(nodeId, runtime);
    else runtimeByNode.delete(nodeId);
    store.setState({ runtimeByNode });
  }

  function patchRuntime(nodeId: string, patch: Partial<SpaceNodeRuntime>): void {
    const current = store.getState().runtimeByNode.get(nodeId);
    if (current && Object.entries(patch).every(([key, value]) => Object.is(current[key as keyof SpaceNodeRuntime], value))) return;
    setRuntime(nodeId, { ...current, ...patch });
  }

  function setViewport(viewport: SpaceEditorState["viewport"]): void {
    if (!store.getState().disposed && Number.isFinite(viewport.x) && Number.isFinite(viewport.y) && Number.isFinite(viewport.zoom) && viewport.zoom > 0 && !spaceEditorValueEqual(store.getState().viewport, viewport)) store.setState({ viewport });
  }

  function beginGesture(input: SpaceEditorGestureStart = { kind: "nodes", nodeIds: store.getState().selectedNodeIds }): SpaceEditorCommandResult {
    const state = store.getState();
    if (state.disposed) return failure("DISPOSED");
    if (!state.writable) return failure("READ_ONLY");
    if (state.gesture) return failure("GESTURE_ACTIVE");
    let gesture: SpaceEditorGesture;
    if (input.kind === "nodes") {
      if (input.nodeIds.some((id) => !state.nodeById.has(id))) return failure("NODE_NOT_FOUND");
      gesture = { ...input, nodeIds: [...new Set(input.nodeIds)], positions: {} };
    } else {
      const group = state.document.groups.find((group) => group.id === input.groupId);
      if (!group) return failure("GROUP_NOT_FOUND");
      gesture = input.kind === "group.move" ? { kind: "group.move", groupId: input.groupId, delta: { x: 0, y: 0 } }
        : { kind: "group.resize", groupId: input.groupId, bounds: group.bounds };
    }
    store.setState({ gesture });
    return unchanged();
  }

  function updateGesture(update: { positions?: Readonly<Record<string, SpacePosition>>; delta?: SpacePosition; bounds?: CanonicalGroup["bounds"] }): SpaceEditorCommandResult {
    const state = store.getState(), gesture = state.gesture;
    if (state.disposed) return failure("DISPOSED");
    if (!gesture) return failure("NO_GESTURE");
    if (gesture.kind === "nodes" && update.positions) {
      if (Object.entries(update.positions).some(([id, position]) => !gesture.nodeIds.includes(id) || !Number.isFinite(position.x) || !Number.isFinite(position.y))) return failure("INVALID_COMMAND");
      store.setState({ gesture: { ...gesture, positions: { ...gesture.positions, ...update.positions } } });
    } else if (gesture.kind === "group.move" && update.delta) {
      if (!Number.isFinite(update.delta.x) || !Number.isFinite(update.delta.y)) return failure("INVALID_COMMAND");
      store.setState({ gesture: { ...gesture, delta: update.delta } });
    } else if (gesture.kind === "group.resize" && update.bounds) {
      if (Object.values(update.bounds).some((value) => !Number.isFinite(value))) return failure("INVALID_COMMAND");
      store.setState({ gesture: { ...gesture, bounds: { ...update.bounds, width: Math.max(200, update.bounds.width), height: Math.max(100, update.bounds.height) } } });
    } else return failure("INVALID_COMMAND");
    return unchanged();
  }

  function cancelGesture(): void { if (!store.getState().disposed && store.getState().gesture) store.setState({ gesture: null }); }

  function commitGesture(): SpaceEditorCommandResult {
    const gesture = store.getState().gesture;
    if (store.getState().disposed) return failure("DISPOSED");
    if (!gesture) return failure("NO_GESTURE");
    cancelGesture();
    if (gesture.kind === "nodes") return dispatch({ type: "nodes.move", positions: gesture.positions });
    if (gesture.kind === "group.move") return dispatch({ type: "group.move", groupId: gesture.groupId, delta: gesture.delta });
    return dispatch({ type: "group.resize", groupId: gesture.groupId, bounds: gesture.bounds });
  }

  function getNodePosition(nodeId: string): SpacePosition | undefined {
    const state = store.getState(), node = state.nodeById.get(nodeId), gesture = state.gesture;
    if (!node) return undefined;
    if (gesture?.kind === "nodes" && Object.hasOwn(gesture.positions, nodeId)) return gesture.positions[nodeId];
    if (gesture?.kind === "group.move" && state.document.groups.find((group) => group.id === gesture.groupId)?.memberNodeIds.includes(nodeId)) return { x: node.position.x + gesture.delta.x, y: node.position.y + gesture.delta.y };
    return node.position;
  }

  function subscribeDurable(listener: (event: SpaceEditorDurableEvent) => void): () => void {
    if (store.getState().disposed) return () => {};
    durableListeners.add(listener);
    return () => { durableListeners.delete(listener); };
  }

  function subscribeSelector<T>(selector: (state: SpaceEditorState) => T, listener: (value: T, previous: T) => void, equal: (a: T, b: T) => boolean = Object.is): () => void {
    if (store.getState().disposed) return () => {};
    let value = selector(store.getState());
    const unsubscribe = store.subscribe((state) => {
      const next = selector(state);
      if (equal(value, next)) return;
      const previous = value;
      value = next;
      listener(next, previous);
    });
    const release = () => { unsubscribe(); subscriptions.delete(release); };
    subscriptions.add(release);
    return release;
  }

  function dispose(): void {
    if (store.getState().disposed) return;
    durableListeners.clear();
    for (const release of [...subscriptions]) release();
    store.setState({ disposed: true, gesture: null, runtimeByNode: new Map(), geometryByNode: {}, history: { undo: [], redo: [] } });
  }

  const actions = {
    getDocument, getSnapshot, getNodePosition, dispatch, transact, applySystemTransaction,
    undo: () => travel("undo"), redo: () => travel("redo"), ack, setAccess, reset, dispose,
    beginGesture, updateGesture, commitGesture, cancelGesture, select, hover, measure,
    setRuntime, patchRuntime, setViewport, subscribeDurable, subscribeSelector,
  };
  const readableStore: Pick<StoreApi<SpaceEditorState>, "getState" | "getInitialState" | "subscribe"> = {
    getState: store.getState, getInitialState: store.getInitialState, subscribe: store.subscribe,
  };
  return { store: readableStore, actions, ...actions };
}

export type SpaceEditorSession = ReturnType<typeof createSpaceEditorSession>;
