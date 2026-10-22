import {
  analyzeCanonicalGraphSupport,
  graphDocumentV3Schema,
  pruneGroupsAfterNodeDeletion,
  type CanonicalEdge,
  type CanonicalJsonValue,
  type CanonicalNode,
} from "@/shared/generation-graph/canonical-graph";
import { defaultConfigForKind } from "@/shared/generation-graph/node-default-config";
import { isUnavailableEditNodeKind } from "@/shared/generation-graph/node-availability";
import { findNodeDefinition, findPortDefinition } from "@/shared/generation-graph/node-registry";

import { isSpaceNodeAuthorable } from "./space-editor-catalog";
import { copySpaceEditorSelection, prepareSpaceEditorPaste } from "./space-editor-clipboard";
import {
  SpaceEditorCommandError,
  type SpaceEditorCommand,
  type SpaceEditorCommandOptions,
  type SpaceEditorCommandResult,
  type SpaceEditorFailure,
  type SpaceEditorSuccess,
} from "./space-editor-command-types";
import { createSpaceEditorGroup, moveSpaceGroup, regroupMovedSpaceNodes, setSpaceGroupMembers, ungroupSpaceNodes } from "./space-editor-groups";
import { reconcileSpaceEditorDocument, spaceEditorValueEqual } from "./space-editor-history";
import type { SpaceEditorDocument, SpaceEditorTransactionOrigin } from "./space-editor-types";

function record(value: CanonicalJsonValue | undefined): Record<string, CanonicalJsonValue> {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function fail(error: unknown): SpaceEditorFailure {
  return error instanceof SpaceEditorCommandError
    ? { ok: false, code: error.code, message: error.message }
    : { ok: false, code: "INVALID_COMMAND", message: error instanceof Error ? error.message : "Invalid editor operation." };
}

/** Full admission before publication; parsed defaults never replace the candidate. */
export function validateSpaceEditorDocument(document: SpaceEditorDocument, previous?: SpaceEditorDocument): SpaceEditorFailure | null {
  if (document.nodes.length > 500) return { ok: false, code: "NODE_LIMIT", message: "The Space has reached its 500 node limit." };
  if (document.edges.length > 2_000) return { ok: false, code: "EDGE_LIMIT", message: "The Space has reached its 2000 edge limit." };
  if (document.groups.length > 500) return { ok: false, code: "GROUP_LIMIT", message: "The Space has reached its 500 group limit." };
  const parsed = graphDocumentV3Schema.safeParse({
    schemaVersion: document.schemaVersion, minimumWriterVersion: 3, id: "editor", version: 1,
    title: document.title, nodes: document.nodes, edges: document.edges, groups: document.groups,
  });
  if (!parsed.success) return { ok: false, code: "INVALID_GRAPH", message: parsed.error.issues.map((issue) => issue.message).join("; ") };
  const support = analyzeCanonicalGraphSupport(document);
  if (support.writable) return null;
  // Read-only legacy documents may receive unrelated authoritative system results.
  const oldIssues = new Set(previous ? analyzeCanonicalGraphSupport(previous).issues.map((issue) => JSON.stringify(issue)) : []);
  const introduced = support.issues.filter((issue) => !oldIssues.has(JSON.stringify(issue)));
  return introduced.length ? { ok: false, code: "INVALID_GRAPH", message: introduced[0].code, issues: introduced } : null;
}

/** Original persisted values, retained even while a local deletion is unsaved. */
export interface SpaceEditorPersistedRetired {
  nodes: ReadonlyMap<string, CanonicalNode>;
  edges: ReadonlyMap<string, CanonicalEdge>;
}

type RetiredTransactionOptions = {
  persistedRetired?: SpaceEditorPersistedRetired;
  /** History may restore only an unchanged entity that still exists on the server. */
  restorePersistedRetired?: boolean;
};

/** Enforce the server's retired-node write boundary for arbitrary user transforms too. */
function guardRetired(previous: SpaceEditorDocument, next: SpaceEditorDocument, options: RetiredTransactionOptions) {
  const nodes = new Map(previous.nodes.map((node) => [node.id, node]));
  const retired = new Set(previous.nodes.filter((node) => isUnavailableEditNodeKind(node.kind)).map((node) => node.id));
  const sameConfig = (original: CanonicalNode, node: CanonicalNode) => original.kind === node.kind
    && original.configVersion === node.configVersion && spaceEditorValueEqual(original.config, node.config);
  for (const node of next.nodes) {
    const original = nodes.get(node.id);
    const persisted = options.persistedRetired?.nodes.get(node.id);
    if (options.persistedRetired && (persisted || isUnavailableEditNodeKind(node.kind))
      && (!persisted || !sameConfig(persisted, node))) throw new SpaceEditorCommandError("RETIRED_NODE");
    const restoration = options.restorePersistedRetired && persisted && sameConfig(persisted, node);
    if (!original && !isSpaceNodeAuthorable(node.kind) && !restoration) throw new SpaceEditorCommandError(isUnavailableEditNodeKind(node.kind) ? "RETIRED_NODE" : "UNSUPPORTED_NODE");
    if (original && original.kind !== node.kind) throw new SpaceEditorCommandError("INVALID_COMMAND", "A node kind cannot be changed.");
    if (original && retired.has(node.id) && !sameConfig(original, node)) throw new SpaceEditorCommandError("RETIRED_NODE");
  }
  const edges = new Map(previous.edges.map((edge) => [edge.id, edge]));
  const nextRetired = new Set(next.nodes.filter((node) => isUnavailableEditNodeKind(node.kind)).map((node) => node.id));
  for (const edge of next.edges) {
    const original = edges.get(edge.id);
    const persisted = options.persistedRetired?.edges.get(edge.id);
    if (options.persistedRetired && (persisted || options.persistedRetired.nodes.has(edge.sourceNodeId) || options.persistedRetired.nodes.has(edge.targetNodeId))
      && (!persisted || !spaceEditorValueEqual(persisted, edge))) throw new SpaceEditorCommandError("RETIRED_NODE");
    // The old endpoints matter even when a replacement now joins two active nodes.
    if (!nextRetired.has(edge.sourceNodeId) && !nextRetired.has(edge.targetNodeId)
      && !(original && (retired.has(original.sourceNodeId) || retired.has(original.targetNodeId)))) continue;
    const restoration = options.restorePersistedRetired && !original && persisted && spaceEditorValueEqual(persisted, edge);
    if ((!original || !spaceEditorValueEqual(original, edge)) && !restoration) throw new SpaceEditorCommandError("RETIRED_NODE");
  }
}

/** Wire changes detach fixed bindings. Explicit asset replacement keeps provenance but releases the execution. */
function applyUserResultSemantics(previous: SpaceEditorDocument, next: SpaceEditorDocument): SpaceEditorDocument {
  const previousNodes = new Map(previous.nodes.map((node) => [node.id, node]));
  const wireKey = (edge: CanonicalEdge) => [edge.id, edge.sourceNodeId, edge.sourcePortId, edge.targetPortId];
  const wires = (document: SpaceEditorDocument, nodeId: string) => document.edges.filter((edge) => edge.targetNodeId === nodeId)
    .sort((a, b) => a.id.localeCompare(b.id)).map(wireKey);
  const nodes = next.nodes.map((node) => {
    // Legacy config is opaque; disconnecting a preserved wire may not rewrite it.
    if (isUnavailableEditNodeKind(node.kind)) return node;
    const original = previousNodes.get(node.id);
    if (!original) return node;
    const old = record(original.config), source = record(old.resultSource), config = record(node.config);
    if (node.kind === "output.gallery" && Array.isArray(config.resultItems)) {
      const connected = (document: SpaceEditorDocument, item: Record<string, CanonicalJsonValue>) => document.edges.some(edge =>
        edge.targetNodeId === node.id && edge.sourceNodeId === item.nodeId && edge.sourcePortId === item.portId && edge.targetPortId === item.mediaType);
      const items = config.resultItems.map(value => {
        const item = record(value);
        // Cutting a generating wire cancels its reservations. Completed snapshots remain owned by the Gallery.
        return item.state === "pending" && connected(previous, item) && !connected(next, item)
          ? { ...item, executionId: null, state: "cancelled" } : value;
      });
      if (items.some((item, index) => item !== (config.resultItems as CanonicalJsonValue[])[index])) return { ...node, config: { ...config, resultItems: items } };
      return node;
    }
    if (!Object.hasOwn(old, "resultSource")) return node;
    // Clearing an Input explicitly removes its binding even when no incoming
    // wire exists. Asset-only patches still keep provenance and release execution.
    if (!Object.hasOwn(config, "resultSource")) return node;
    if (!spaceEditorValueEqual(wires(previous, node.id), wires(next, node.id))) {
      const ordinary = { ...config };
      delete ordinary.resultSource;
      return { ...node, config: ordinary };
    }
    if (!spaceEditorValueEqual(old.assetId, config.assetId)) return {
      ...node, config: { ...config, resultSource: { ...source, executionId: null, state: typeof config.assetId === "string" ? "completed" : "cancelled" } },
    };
    return node;
  });
  return { ...next, nodes };
}

/** Shared writer admission for commands, user attachment transforms and system reconciliation. */
export function prepareSpaceEditorTransaction(
  previous: SpaceEditorDocument, candidate: SpaceEditorDocument,
  options: { origin: SpaceEditorTransactionOrigin; writable?: boolean; selectionNodeIds?: readonly string[]; normalizeResults?: boolean } & RetiredTransactionOptions,
): SpaceEditorCommandResult {
  try {
    if (options.origin === "user" && options.writable === false) throw new SpaceEditorCommandError("READ_ONLY");
    let document = candidate;
    if (options.origin === "user") {
      guardRetired(previous, document, options);
      if (options.normalizeResults !== false) document = applyUserResultSemantics(previous, document);
    }
    const invalid = validateSpaceEditorDocument(document, options.origin === "system" ? previous : undefined);
    if (invalid) return invalid;
    document = reconcileSpaceEditorDocument(previous, document);
    const oldNodes = new Map(previous.nodes.map((node) => [node.id, node]));
    const selectionNodeIds = options.origin === "user" ? [...new Set([
      ...(options.selectionNodeIds ?? []),
      ...document.nodes.filter((node) => oldNodes.has(node.id) && node.selectedOutputAssetId !== oldNodes.get(node.id)!.selectedOutputAssetId).map((node) => node.id),
    ])].filter((id) => document.nodes.some((node) => node.id === id)) : [];
    return { ok: true, document, changed: document !== previous, selectionNodeIds };
  } catch (error) { return fail(error); }
}

function mergeConfig(value: CanonicalJsonValue, patch: Record<string, CanonicalJsonValue>): CanonicalJsonValue {
  const original = record(value);
  return Object.fromEntries([...new Set([...Object.keys(original), ...Object.keys(patch)])].map((key) => {
    if (!Object.hasOwn(patch, key)) return [key, original[key]];
    const next = patch[key];
    return [key, next && typeof next === "object" && !Array.isArray(next) ? mergeConfig(Object.hasOwn(original, key) ? original[key] : {}, next) : next];
  }));
}

function setConfigField(config: CanonicalJsonValue, path: readonly string[], change: { value?: CanonicalJsonValue; remove?: boolean }): CanonicalJsonValue {
  if (!path.length) throw new SpaceEditorCommandError("INVALID_COMMAND", "A config field path must not be empty.");
  const [key, ...rest] = path, original = record(config);
  if (change.remove && !Object.hasOwn(original, key)) return config;
  if (rest.length) return { ...original, [key]: setConfigField(Object.hasOwn(original, key) ? original[key] : {}, rest, change) };
  const next = { ...original };
  if (change.remove) delete next[key];
  else return { ...next, [key]: change.value! };
  return next;
}

type CommandFeedback = Pick<SpaceEditorSuccess, "selectedNodeIds" | "idMaps"> & { selectionIntentIds: Set<string> };

function reduce(document: SpaceEditorDocument, command: SpaceEditorCommand, options: SpaceEditorCommandOptions, feedback: CommandFeedback): SpaceEditorDocument {
  const createId = options.createId ?? (() => crypto.randomUUID());
  const guardEditable = (id: string) => {
    const node = document.nodes.find((node) => node.id === id);
    if (node && isUnavailableEditNodeKind(node.kind)) throw new SpaceEditorCommandError("RETIRED_NODE");
  };
  const updateNode = (id: string, transform: (node: SpaceEditorDocument["nodes"][number]) => SpaceEditorDocument["nodes"][number]) => {
    if (!document.nodes.some((node) => node.id === id)) throw new SpaceEditorCommandError("NODE_NOT_FOUND");
    return { ...document, nodes: document.nodes.map((node) => node.id === id ? transform(node) : node) };
  };
  const updateGroup = (id: string, transform: (group: SpaceEditorDocument["groups"][number]) => SpaceEditorDocument["groups"][number]) => {
    if (!document.groups.some((group) => group.id === id)) throw new SpaceEditorCommandError("GROUP_NOT_FOUND");
    return { ...document, groups: document.groups.map((group) => group.id === id ? transform(group) : group) };
  };
  switch (command.type) {
    case "batch": {
      let next = document;
      for (const item of command.commands) next = reduce(next, item, options, feedback);
      return next;
    }
    case "title.set": return { ...document, title: command.title };
    case "node.add": {
      const definition = findNodeDefinition(command.node.kind);
      if (!definition || !isSpaceNodeAuthorable(command.node.kind)) throw new SpaceEditorCommandError(isUnavailableEditNodeKind(command.node.kind) ? "RETIRED_NODE" : "UNSUPPORTED_NODE");
      return { ...document, nodes: [...document.nodes, {
        ...command.node, id: command.node.id ?? createId(), configVersion: command.node.configVersion ?? definition.configVersion,
        config: command.node.config === undefined ? defaultConfigForKind(definition.kind) : command.node.config,
        selectedOutputAssetId: command.node.selectedOutputAssetId ?? null,
      }] };
    }
    case "node.config.replace":
      guardEditable(command.nodeId);
      return updateNode(command.nodeId, (node) => ({ ...node, config: command.config }));
    case "node.config.patch":
      guardEditable(command.nodeId);
      return updateNode(command.nodeId, (node) => ({ ...node, config: mergeConfig(node.config, command.patch) }));
    case "node.config.fields":
      guardEditable(command.nodeId);
      return updateNode(command.nodeId, (node) => ({ ...node, config: command.changes.reduce((config, change) => setConfigField(config, change.path, change), node.config) }));
    case "node.move": return reduce(document, { type: "nodes.move", positions: { [command.nodeId]: command.position }, updateMembership: command.updateMembership }, options, feedback);
    case "nodes.move": {
      const ids = new Set(Object.keys(command.positions));
      if (document.nodes.filter((node) => ids.has(node.id)).length !== ids.size) throw new SpaceEditorCommandError("NODE_NOT_FOUND");
      const moved = new Set<string>();
      const nodes = document.nodes.map((node) => {
        if (!ids.has(node.id) || spaceEditorValueEqual(node.position, command.positions[node.id])) return node;
        moved.add(node.id);
        return { ...node, position: command.positions[node.id] };
      });
      const next = { ...document, nodes };
      return command.updateMembership === false ? next : regroupMovedSpaceNodes(next, moved, options.measurements);
    }
    case "nodes.reorder": {
      const nodes = new Map(document.nodes.map((node) => [node.id, node]));
      if (command.nodeIds.length !== nodes.size || new Set(command.nodeIds).size !== nodes.size || command.nodeIds.some((id) => !nodes.has(id))) throw new SpaceEditorCommandError("INVALID_ORDER");
      return { ...document, nodes: command.nodeIds.map((id) => nodes.get(id)!) };
    }
    case "node.remove": return reduce(document, { type: "nodes.remove", nodeIds: [command.nodeId] }, options, feedback);
    case "nodes.remove": {
      const ids = new Set(command.nodeIds);
      return { ...document, nodes: document.nodes.filter((node) => !ids.has(node.id)),
        edges: document.edges.filter((edge) => !ids.has(edge.sourceNodeId) && !ids.has(edge.targetNodeId)),
        groups: pruneGroupsAfterNodeDeletion(document.groups, ids),
      };
    }
    case "output.clear": return reduce(document, { type: "output.select", nodeId: command.nodeId, assetId: null }, options, feedback);
    case "output.select":
      feedback.selectionIntentIds.add(command.nodeId);
      return updateNode(command.nodeId, (node) => ({ ...node, selectedOutputAssetId: command.assetId }));
    case "edge.connect":
    case "edge.replace": {
      guardEditable(command.edge.sourceNodeId);
      guardEditable(command.edge.targetNodeId);
      const target = document.nodes.find((node) => node.id === command.edge.targetNodeId);
      if (!target) throw new SpaceEditorCommandError("NODE_NOT_FOUND");
      let replaced: CanonicalEdge | undefined;
      let edges = document.edges;
      if (command.type === "edge.replace") {
        replaced = command.edgeId ? edges.find((edge) => edge.id === command.edgeId) : undefined;
        if (command.edgeId && !replaced) throw new SpaceEditorCommandError("EDGE_NOT_FOUND");
        edges = edges.filter((edge) => command.edgeId ? edge.id !== command.edgeId
          : edge.targetNodeId !== target.id || edge.targetPortId !== command.edge.targetPortId);
      }
      const port = findPortDefinition(target.kind, command.edge.targetPortId, "input");
      const nextOrder = port?.ordered ? Math.max(-1, ...edges.filter((edge) => edge.targetNodeId === target.id && edge.targetPortId === command.edge.targetPortId).map((edge) => edge.sortOrder)) + 1 : 0;
      const edge: CanonicalEdge = { ...command.edge, id: command.edge.id ?? replaced?.id ?? createId(), sortOrder: command.edge.sortOrder
        ?? (replaced?.targetNodeId === target.id && replaced?.targetPortId === command.edge.targetPortId ? replaced.sortOrder : nextOrder) };
      if (replaced && command.edge.hasPause === undefined && Object.hasOwn(replaced, "hasPause") && !Object.hasOwn(command.edge, "hasPause")) edge.hasPause = replaced.hasPause;
      const index = replaced ? document.edges.indexOf(replaced) : edges.length;
      edges = [...edges];
      edges.splice(Math.min(index, edges.length), 0, edge);
      const config = record(target.config);
      if (target.kind === "output.gallery" && Array.isArray(config.excludedAssetIds) && config.excludedAssetIds.length) {
        // This explicit connection releases the old asset-wide ban only for the
        // new/replaced wire. Previously hidden wires and frozen slots stay hidden.
        const scoped = Array.isArray(config.legacyExcludedEdgeIds) ? new Set(config.legacyExcludedEdgeIds) : null;
        const legacyExcludedEdgeIds = document.edges.filter(value => value.targetNodeId === target.id && value.id !== edge.id
          && (!scoped || scoped.has(value.id))).map(value => value.id);
        return { ...document, edges, nodes: document.nodes.map(node => node.id === target.id
          ? { ...node, config: { ...config, legacyExcludedEdgeIds } } : node) };
      }
      return { ...document, edges };
    }
    case "edge.disconnect": return reduce(document, { type: "edges.disconnect", edgeIds: [command.edgeId] }, options, feedback);
    case "edges.disconnect": return { ...document, edges: document.edges.filter((edge) => !command.edgeIds.includes(edge.id)) };
    case "edge.pause": {
      const original = document.edges.find((edge) => edge.id === command.edgeId);
      if (!original) throw new SpaceEditorCommandError("EDGE_NOT_FOUND");
      guardEditable(original.sourceNodeId);
      guardEditable(original.targetNodeId);
      return { ...document, edges: document.edges.map((edge) => {
        if (edge.id !== command.edgeId) return edge;
        const next = { ...edge };
        if (command.hasPause === undefined) delete next.hasPause;
        else next.hasPause = command.hasPause;
        return next;
      }) };
    }
    case "edge.reorder": {
      guardEditable(command.targetNodeId);
      const node = document.nodes.find((node) => node.id === command.targetNodeId);
      if (!node) throw new SpaceEditorCommandError("NODE_NOT_FOUND");
      const port = findPortDefinition(node.kind, command.targetPortId, "input");
      const incoming = document.edges.filter((edge) => edge.targetNodeId === node.id && edge.targetPortId === command.targetPortId);
      for (const edge of incoming) guardEditable(edge.sourceNodeId);
      const order = new Map(command.edgeIds.map((id, index) => [id, index]));
      if (!port?.ordered || incoming.length !== order.size || order.size !== command.edgeIds.length || incoming.some((edge) => !order.has(edge.id))) throw new SpaceEditorCommandError("INVALID_ORDER");
      let next = { ...document, edges: document.edges.map((edge) => order.has(edge.id) ? { ...edge, sortOrder: order.get(edge.id)! } : edge) };
      if ((node.kind === "edit.video.stitch" && port.id === "clips") || (node.kind === "edit.image.gif" && port.id === "frames")) {
        const config = record(node.config);
        next = { ...next, nodes: next.nodes.map((item) => item.id === node.id ? { ...item, config: { ...config, parameters: { ...record(config.parameters), clipOrder: [...command.edgeIds] } } } : item) };
      }
      return next;
    }
    case "group.create": return createSpaceEditorGroup(document, { ...command, id: command.id ?? createId() }, options.measurements);
    case "group.update": return updateGroup(command.groupId, (group) => ({ ...group, ...command.patch }));
    case "group.members": return setSpaceGroupMembers(document, command.groupId, command.memberNodeIds);
    case "group.ungroup": return { ...document, groups: ungroupSpaceNodes(document.groups, new Set(command.nodeIds)) };
    case "group.move": return moveSpaceGroup(document, command.groupId, command.delta);
    case "group.resize": return updateGroup(command.groupId, (group) => ({ ...group, bounds: { ...command.bounds, width: Math.max(200, command.bounds.width), height: Math.max(100, command.bounds.height) } }));
    case "group.delete": return { ...document, groups: document.groups.filter((group) => group.id !== command.groupId) };
    case "nodes.duplicate": return reduce(document, { type: "clipboard.paste", clipboard: copySpaceEditorSelection(document, command.nodeIds), offset: command.offset }, options, feedback);
    case "clipboard.paste": {
      if (document.nodes.length + command.clipboard.nodes.length > 500) throw new SpaceEditorCommandError("NODE_LIMIT");
      if (document.edges.length + command.clipboard.edges.length > 2_000) throw new SpaceEditorCommandError("EDGE_LIMIT");
      if (document.groups.length + command.clipboard.groups.length > 500) throw new SpaceEditorCommandError("GROUP_LIMIT");
      const { fragment, idMaps } = prepareSpaceEditorPaste(command.clipboard, { offset: command.offset, createId });
      feedback.selectedNodeIds = fragment.nodes.map((node) => node.id);
      feedback.idMaps = idMaps;
      return { ...document, nodes: [...document.nodes, ...fragment.nodes], edges: [...document.edges, ...fragment.edges], groups: [...document.groups, ...fragment.groups] };
    }
  }
}

export function applySpaceEditorCommand(document: SpaceEditorDocument, command: SpaceEditorCommand, options: SpaceEditorCommandOptions & Pick<RetiredTransactionOptions, "persistedRetired"> = {}): SpaceEditorCommandResult {
  try {
    if (options.writable === false || !analyzeCanonicalGraphSupport(document).writable) throw new SpaceEditorCommandError("READ_ONLY");
    const feedback: CommandFeedback = { selectionIntentIds: new Set() };
    const candidate = reduce(document, command, options, feedback);
    const result = prepareSpaceEditorTransaction(document, candidate, { origin: "user", writable: options.writable, selectionNodeIds: [...feedback.selectionIntentIds], persistedRetired: options.persistedRetired });
    return result.ok ? { ...result, ...(feedback.selectedNodeIds ? { selectedNodeIds: feedback.selectedNodeIds } : {}), ...(feedback.idMaps ? { idMaps: feedback.idMaps } : {}) } : result;
  } catch (error) { return fail(error); }
}
