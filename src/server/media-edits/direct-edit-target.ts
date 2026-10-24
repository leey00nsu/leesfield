import { mediaAssetIdsForPort } from "@/shared/generation-graph/media-output";
import { editMediaType, editOutputPort, isDirectEditPort, type DirectEditSnapshot } from "@/shared/media-assets/direct-media-edit";

type Node = { id: string; kind: string; config: unknown; selectedOutputAssetId: string | null;
  outputs?: Array<{ portId: string; sortOrder: number; assetId: string | null }> };
type Edge = { id: string; sourceNodeId: string; targetNodeId: string; sourcePortId: string; targetPortId: string; sortOrder: number; hasPause?: boolean };
export type EditGraph = { nodes: Node[]; edges: Edge[] };
export const objectRecord = (v: unknown): Record<string, unknown> => v && typeof v === "object" && !Array.isArray(v) ? v as Record<string, unknown> : {};

/** Same frozen-input and passthrough semantics as the canvas; never trust a posted URL. */
export function displayedEditAsset(graph: EditGraph, nodeId: string): string | null {
  const byId = new Map(graph.nodes.map(node => [node.id, node]));
  const incoming = (id: string, port: string) => graph.edges.filter(e => e.targetNodeId === id && e.targetPortId === port && !e.hasPause)
    .sort((a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id));
  const fromEdge = (edge: Edge, seen: Set<string>): string | null => {
    if (edge.sourcePortId === "capturedFrame" || isDirectEditPort(edge.sourcePortId)) return null;
    const n = byId.get(edge.sourceNodeId);
    if (!n || seen.has(n.id)) return null;
    if (n.kind.startsWith("input.")) return resolve(n, new Set(seen).add(n.id));
    return mediaAssetIdsForPort(n.kind, edge.sourcePortId, n.selectedOutputAssetId, n.outputs)[0] ?? null;
  };
  const resolve = (n: Node, seen: Set<string>): string | null => {
    const config = objectRecord(n.config);
    if (n.kind === "output.single") {
      const types = typeof config.mediaType === "string" ? [config.mediaType] : ["audio", "video", "image"];
      for (const type of types) for (const edge of incoming(n.id, type)) {
        const asset = fromEdge(edge, seen); if (asset) return asset;
      }
      return null;
    }
    if (!["input.image", "input.video", "input.audio"].includes(n.kind)) return null;
    if (!config.resultSource) {
      const wires = incoming(n.id, n.kind === "input.image" ? "reference" : n.kind.slice(6));
      if (wires.length) return fromEdge(wires[0], seen);
    }
    return typeof config.assetId === "string" ? config.assetId : n.selectedOutputAssetId;
  };
  const node = byId.get(nodeId);
  return node ? resolve(node, new Set([nodeId])) : null;
}

export function matchesEditReservation(graph: EditGraph, snapshot: DirectEditSnapshot) {
  const source = graph.nodes.find(n => n.id === snapshot.sourceNodeId), result = graph.nodes.find(n => n.id === snapshot.resultNodeId);
  if (!source || !["input.image", "input.video", "output.single"].includes(source.kind) || !result
    || result.kind !== "input." + editMediaType(snapshot.edit) || displayedEditAsset(graph, source.id) !== snapshot.sourceAssetId) return false;
  const binding = objectRecord(objectRecord(result.config).resultSource);
  return binding.nodeId === source.id && binding.executionId === snapshot.requestId && binding.portId === editOutputPort(snapshot.edit)
    && binding.index === 0 && binding.state === "pending" && graph.edges.some(e => e.id === snapshot.resultEdgeId
      && e.sourceNodeId === source.id && e.sourcePortId === editOutputPort(snapshot.edit) && e.targetNodeId === result.id
      && e.targetPortId === (snapshot.edit.kind === "image.crop" ? "reference" : "video") && !e.hasPause);
}
