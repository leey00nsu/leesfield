import type { CanonicalEdge, CanonicalNode } from "@/shared/generation-graph/canonical-graph";
import type { AssistantResults } from "@/shared/generation-graph/assistant-output";
import { mediaAssetIdsForPort, type MediaOutputBinding } from "@/shared/generation-graph/media-output";
import { findPortDefinition, videoCaptureOutputPortId, type GeneratedResultGalleryItem } from "@/shared/generation-graph/node-registry";
import { resolveGraphText } from "@/shared/generation-graph/prompt-constructor";
import { orderedFileSources, parseFileInputPort } from "@/shared/model-catalog/file-input-ports";

export type SpaceInputGraph = { nodes: readonly CanonicalNode[]; edges: readonly CanonicalEdge[] };
export type SpacePromptInput = { connected: boolean; text: string | null };
export type SpaceInputRuntime = {
  mediaOutputs?: ReadonlyMap<string, readonly MediaOutputBinding[]>;
  assistantResults?: AssistantResults;
};

function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
function relayPort(kind: string): string | null {
  return kind === "input.image" ? "reference" : kind === "input.audio" ? "audio" : kind === "input.video" ? "video" : null;
}
function equalArray<T>(left: readonly T[], right: readonly T[]) {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

/** Canonical lookup/index ownership, independent of canvas handles and render state. */
export class SpaceInputResolver {
  /** An async input token cannot cross an editor/account session. */
  readonly scope: object = Object.freeze({});
  private graph: SpaceInputGraph;
  private nodes = new Map<string, CanonicalNode>();
  private incoming = new Map<string, CanonicalEdge[]>();
  private outgoing = new Map<string, Set<string>>();
  private outputs: ReadonlyMap<string, readonly MediaOutputBinding[]>;
  private assistants: AssistantResults;
  private promptCache = new Map<string, SpacePromptInput>();
  private assetCache = new Map<string, Map<string, string[]>>();
  private slotCache = new Map<string, Map<string, (string | null)[]>>();
  private inputRevisions = new Map<string, number>();

  constructor(graph: SpaceInputGraph, runtime: SpaceInputRuntime = {}) {
    this.graph = graph;
    this.outputs = runtime.mediaOutputs ?? new Map();
    this.assistants = runtime.assistantResults ?? Object.create(null) as AssistantResults;
    this.reindex(graph);
  }

  private reindex(graph: SpaceInputGraph) {
    this.nodes = new Map(graph.nodes.map(node => [node.id, node]));
    this.incoming = new Map();
    this.outgoing = new Map();
    for (const edge of graph.edges) {
      const incoming = this.incoming.get(edge.targetNodeId) ?? [];
      incoming.push(edge);
      this.incoming.set(edge.targetNodeId, incoming);
      const downstream = this.outgoing.get(edge.sourceNodeId) ?? new Set();
      downstream.add(edge.targetNodeId);
      this.outgoing.set(edge.sourceNodeId, downstream);
    }
    for (const edges of this.incoming.values()) edges.sort((a, b) => a.sortOrder - b.sortOrder);
  }

  /** Positions, geometry, comments on unrelated nodes and progress do not flush all inputs. */
  updateGraph(graph: SpaceInputGraph, runtime: SpaceInputRuntime = {}): ReadonlySet<string> {
    const dirty = new Set<string>();
    const nextNodes = new Map(graph.nodes.map(node => [node.id, node]));
    for (const [id, previous] of this.nodes) {
      const next = nextNodes.get(id);
      if (!next || previous.kind !== next.kind || previous.configVersion !== next.configVersion
        || previous.config !== next.config || previous.selectedOutputAssetId !== next.selectedOutputAssetId) dirty.add(id);
    }
    for (const id of nextNodes.keys()) if (!this.nodes.has(id)) dirty.add(id);
    if (graph.edges !== this.graph.edges) {
      const previousEdges = new Map(this.graph.edges.map(edge => [edge.id, edge]));
      for (const edge of graph.edges) {
        const previous = previousEdges.get(edge.id);
        if (previous !== edge) {
          if (!previous || previous.sourceNodeId !== edge.sourceNodeId || previous.targetNodeId !== edge.targetNodeId
            || previous.sourcePortId !== edge.sourcePortId || previous.targetPortId !== edge.targetPortId
            || previous.sortOrder !== edge.sortOrder || previous.hasPause !== edge.hasPause) {
            dirty.add(edge.targetNodeId);
            if (previous) dirty.add(previous.targetNodeId);
          }
        }
        previousEdges.delete(edge.id);
      }
      for (const edge of previousEdges.values()) dirty.add(edge.targetNodeId);
    }
    const outputs = runtime.mediaOutputs ?? this.outputs;
    for (const id of new Set([...this.outputs.keys(), ...outputs.keys()])) {
      const previous = this.outputs.get(id) ?? [];
      const next = outputs.get(id) ?? [];
      if (previous !== next && (previous.length !== next.length || previous.some((binding, index) => {
        const other = next[index];
        return binding.assetId !== other.assetId || binding.portId !== other.portId || binding.sortOrder !== other.sortOrder;
      }))) dirty.add(id);
    }
    const assistants = runtime.assistantResults ?? this.assistants;
    for (const id of new Set([...Object.keys(this.assistants), ...Object.keys(assistants)])) {
      if (this.assistants[id] !== assistants[id]) dirty.add(id);
    }
    // Old and new paths both matter when a producer is removed or rewired.
    const previousOutgoing = this.outgoing;
    this.graph = graph;
    this.outputs = outputs;
    this.assistants = assistants;
    this.reindex(graph);
    const pending = [...dirty];
    for (let index = 0; index < pending.length; index++) {
      const id = pending[index];
      for (const downstream of new Set([...(previousOutgoing.get(id) ?? []), ...(this.outgoing.get(id) ?? [])])) {
        if (!dirty.has(downstream)) { dirty.add(downstream); pending.push(downstream); }
      }
    }
    for (const id of dirty) {
      this.promptCache.delete(id); this.assetCache.delete(id); this.slotCache.delete(id);
      this.inputRevisions.set(id, (this.inputRevisions.get(id) ?? 0) + 1);
    }
    return dirty;
  }

  getNode(nodeId: string) { return this.nodes.get(nodeId); }
  /** Validated Gallery config owns these assets independently of its producer/edges. */
  galleryResultItems(nodeId: string): readonly GeneratedResultGalleryItem[] | undefined {
    const node = this.nodes.get(nodeId), items = record(node?.config).resultItems;
    return node?.kind === "output.gallery" && Array.isArray(items) ? items as GeneratedResultGalleryItem[] : undefined;
  }
  inputRevision(nodeId: string) { return this.inputRevisions.get(nodeId) ?? 0; }
  incomingEdges(nodeId: string, portId?: string): readonly CanonicalEdge[] {
    const edges = this.incoming.get(nodeId) ?? [];
    return portId === undefined ? edges : edges.filter(edge => edge.targetPortId === portId);
  }
  isConnected(nodeId: string, portId: string) {
    return this.incomingEdges(nodeId, portId).some(edge => !edge.hasPause && !this.isRetainedSplitReference(edge));
  }
  private isRetainedSplitReference(edge: CanonicalEdge) {
    return edge.targetPortId === "reference" && this.nodes.get(edge.targetNodeId)?.kind === "input.image"
      && this.nodes.get(edge.sourceNodeId)?.kind === "edit.image.splitGrid";
  }

  promptInput(nodeId: string): SpacePromptInput {
    const cached = this.promptCache.get(nodeId);
    if (cached) return cached;
    // Preserve the existing UI forwarding filter; resolveGraphText owns relay/Constructor pause semantics.
    const edge = this.incomingEdges(nodeId).find(candidate => !candidate.hasPause && ["text", "prompt"].includes(candidate.targetPortId));
    let result: SpacePromptInput;
    if (!edge) result = { connected: false, text: null };
    else {
      try { result = { connected: true, text: resolveGraphText(this.graph, edge.sourceNodeId, new Set(), this.assistants, edge.sourcePortId) }; }
      catch { result = { connected: true, text: null }; }
    }
    this.promptCache.set(nodeId, result);
    return result;
  }

  sourceAssetIds(nodeId: string, sourcePortId: string, visited = new Set<string>()): string[] {
    if (sourcePortId === videoCaptureOutputPortId) return [];
    const source = this.nodes.get(nodeId);
    if (!source) return [];
    const config = record(source.config);
    const pass = relayPort(source.kind);
    if (pass && config.resultSource) return typeof config.assetId === "string" ? [config.assetId] : [];
    if (pass) {
      if (this.isConnected(nodeId, pass)) return this.resolveAssets(nodeId, pass, visited);
      if (source.selectedOutputAssetId) return [source.selectedOutputAssetId];
      return typeof config.assetId === "string" ? [config.assetId] : [];
    }
    return mediaAssetIdsForPort(source.kind, sourcePortId, source.selectedOutputAssetId, this.outputs.get(nodeId));
  }

  edgeAssetIds(edge: CanonicalEdge): readonly string[] {
    if (edge.hasPause || this.isRetainedSplitReference(edge)) return [];
    const values = this.sourceAssetIds(edge.sourceNodeId, edge.sourcePortId);
    const target = this.nodes.get(edge.targetNodeId);
    return findPortDefinition(target?.kind ?? "", edge.targetPortId, "input")?.valueShape === "ordered-list" ? values : values.slice(0, 1);
  }

  private resolveAssets(nodeId: string, portId: string, visited: Set<string>): string[] {
    // An ID and port can contain punctuation; nested maps/JSON avoid composite-key collisions.
    const key = JSON.stringify([nodeId, portId]);
    if (visited.has(key)) return [];
    const next = new Set(visited).add(key);
    const target = this.nodes.get(nodeId);
    const many = findPortDefinition(target?.kind ?? "", portId, "input")?.valueShape === "ordered-list";
    const results = this.galleryResultItems(nodeId), represented = new Map<string, Set<string>>();
    for (const item of results ?? []) {
      const ports = represented.get(item.nodeId) ?? new Set<string>();
      ports.add(item.portId);
      represented.set(item.nodeId, ports);
    }
    // Even a pending slot suppresses its producer's latest selection. A paused or
    // detached reference cannot erase completed assets owned by this Gallery.
    const snapshots = (results ?? []).filter(item => item.mediaType === portId && item.state === "completed"
      && typeof item.assetId === "string" && item.assetId.length > 0).map(item => item.assetId!);
    const connected = this.incomingEdges(nodeId, portId).filter(edge => !edge.hasPause && !this.isRetainedSplitReference(edge)
      && !represented.get(edge.sourceNodeId)?.has(edge.sourcePortId)).flatMap(edge => {
      const ids = this.sourceAssetIds(edge.sourceNodeId, edge.sourcePortId, next);
      return many ? ids : ids.slice(0, 1);
    });
    return [...snapshots, ...connected];
  }

  inputAssetIds(nodeId: string, portId: string): readonly string[] {
    let ports = this.assetCache.get(nodeId);
    if (!ports) { ports = new Map(); this.assetCache.set(nodeId, ports); }
    const cached = ports.get(portId);
    if (cached) return cached;
    const result = this.resolveAssets(nodeId, portId, new Set());
    ports.set(portId, result);
    return result;
  }
  inputAssetId(nodeId: string, portId: string) { return this.inputAssetIds(nodeId, portId)[0] ?? null; }

  inputAssetSlots(nodeId: string, portId: string): readonly (string | null)[] {
    let ports = this.slotCache.get(nodeId);
    if (!ports) { ports = new Map(); this.slotCache.set(nodeId, ports); }
    const cached = ports.get(portId);
    if (cached) return cached;
    const entries = this.incomingEdges(nodeId, portId).filter(edge => !edge.hasPause && !this.isRetainedSplitReference(edge)).flatMap(edge =>
      this.sourceAssetIds(edge.sourceNodeId, edge.sourcePortId).map((url, index) => ({ url, sortOrder: edge.sortOrder + index })));
    const config = record(this.nodes.get(nodeId)?.config);
    const dynamic = record(record(config.parameters).dynamicParams);
    const field = parseFileInputPort(portId)?.name;
    const marker = field && Object.hasOwn(dynamic, field) ? dynamic[field] : undefined;
    const result = orderedFileSources(entries, Array.isArray(marker) ? marker.length : 0);
    ports.set(portId, result);
    return result;
  }

  /** Build immutable binding maps once per query change; callers can preserve equal entries. */
  static outputMap(bindings: readonly (MediaOutputBinding & { graphNodeId: string })[], previous?: ReadonlyMap<string, readonly MediaOutputBinding[]>) {
    const next = new Map<string, MediaOutputBinding[]>();
    for (const { graphNodeId, ...binding } of bindings) {
      const values = next.get(graphNodeId) ?? [];
      values.push(binding);
      next.set(graphNodeId, values);
    }
    return new Map([...next].map(([id, values]) => {
      const old = previous?.get(id);
      return [id, old && old.length === values.length && values.every((value, index) => value.assetId === old[index].assetId
        && value.portId === old[index].portId && value.sortOrder === old[index].sortOrder) ? old : values] as const;
    }));
  }
}

export function equalSpaceAssetIds(left: readonly (string | null)[], right: readonly (string | null)[]) {
  return equalArray(left, right);
}
