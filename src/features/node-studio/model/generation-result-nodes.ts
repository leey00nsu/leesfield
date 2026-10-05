import type { GraphDraft } from "../hook/use-graph-autosave";
import type { NodeExecutionDto } from "./node-execution-types";
import { findNodeDefinition } from "@/shared/generation-graph/node-registry";
import { mediaOutputPorts } from "@/shared/generation-graph/media-output";

export type ResultSource = { nodeId: string; executionId: string | null; portId: string; index: number; outputCount?: number;
  state: "pending" | "completed" | "failed" | "cancelled" };
function record(value: unknown): Record<string, unknown> { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}; }
export function resultSource(config: unknown): ResultSource | null {
  const source = record(record(config).resultSource);
  return typeof source.nodeId === "string" && typeof source.portId === "string" && typeof source.index === "number"
    ? source as ResultSource : null;
}
export function automaticResultPorts(kind: string) {
  return kind !== "edit.image.splitGrid" && findNodeDefinition(kind)?.executionMode !== "none" ? mediaOutputPorts(kind) : [];
}

/** Placement uses saved positions; never moves existing user nodes. */
export function appendResultNodes(draft: GraphDraft, sourceId: string, executionId: string | null = null,
  slots = automaticResultPorts(draft.nodes.find(node => node.id === sourceId)?.kind ?? "").map(port => ({ portId: port.id, type: port.valueType, index: 0 }))) {
  const source = draft.nodes.find(node => node.id === sourceId);
  if (!source || slots.length === 0) return { draft, ids: [] as string[] };
  if (draft.nodes.length + slots.length > 500 || draft.edges.length + slots.length > 2000) throw new Error("RESULT_NODE_LIMIT_EXCEEDED");
  const occupied = [...draft.nodes.map(node => node.position)];
  const nodes = slots.map(slot => {
    const position = { x: source.position.x + 620, y: source.position.y };
    while (occupied.some(other => Math.abs(other.x - position.x) < 400 && Math.abs(other.y - position.y) < 400)) position.y += 440;
    occupied.push(position);
    return { id: crypto.randomUUID(), kind: `input.${slot.type}`, configVersion: 1, position, selectedOutputAssetId: null,
      config: { assetId: null, resultSource: { nodeId: sourceId, executionId, portId: slot.portId, index: slot.index, state: "pending" } } } as GraphDraft["nodes"][number];
  });
  return { ids: nodes.map(node => node.id), draft: { ...draft, nodes: [...draft.nodes, ...nodes], edges: [...draft.edges,
    ...nodes.map((node, index) => ({ id: crypto.randomUUID(), sourceNodeId: sourceId, sourcePortId: slots[index].portId,
      targetNodeId: node.id, targetPortId: slots[index].type === "image" ? "reference" : slots[index].type, sortOrder: 0 }))] } };
}

export function bindResultNodes(draft: GraphDraft, ids: readonly string[], executionId: string | null, state: ResultSource["state"] = "pending") {
  return { ...draft, nodes: draft.nodes.map(node => {
    const source = resultSource(node.config);
    return ids.includes(node.id) && source ? { ...node, config: { ...record(node.config), resultSource: { ...source, executionId, state } } } : node;
  }) } as GraphDraft;
}

/** An input captures one execution, never the producer's current selection. */
export function reconcileResultNodes(draft: GraphDraft, sourceId: string, execution: Pick<NodeExecutionDto, "executionId" | "status" | "outputAssetIds" | "outputBindings">) {
  if (!draft.nodes.some(node => node.id === sourceId)) return draft;
  const ports = automaticResultPorts(draft.nodes.find(node => node.id === sourceId)!.kind);
  const resultNodes = draft.nodes.filter(node => { const source = resultSource(node.config); return source?.nodeId === sourceId && source.executionId === execution.executionId; });
  if (!resultNodes.length) return draft;
  const assetsForPort = (portId: string) => execution.outputBindings?.length
    ? execution.outputBindings.filter(binding => binding.portId === portId).sort((a, b) => a.sortOrder - b.sortOrder).flatMap(binding => binding.assetId ? [binding.assetId] : [])
    : ports.length === 1 ? execution.outputAssetIds : [];
  let next = draft;
  if (execution.status === "completed") {
    const slots = ports.flatMap(port => {
      // Deleting a port's placeholder also deletes its future automatic output.
      const existing = resultNodes.filter(node => resultSource(node.config)?.portId === port.id);
      if (!existing.length) return [];
      const count = Math.max(...existing.map(node => resultSource(node.config)!.outputCount ?? 1));
      return assetsForPort(port.id).flatMap((_, index) => index >= count ? [{ portId: port.id, type: port.valueType, index }] : []);
    });
    if (slots.length) next = appendResultNodes(next, sourceId, execution.executionId, slots).draft;
  }
  const nodes = next.nodes.map(node => {
    const source = resultSource(node.config);
    if (!source || source.nodeId !== sourceId || source.executionId !== execution.executionId) return node;
    if (source.state !== "pending") return node;
    const assetId = execution.status === "completed" ? assetsForPort(source.portId)[source.index] ?? null : null;
    const state = execution.status === "completed" ? assetId ? "completed" : "failed"
      : execution.status === "failed" || execution.status === "cancelled" ? execution.status : "pending";
    const config = { ...record(node.config), assetId, resultSource: { ...source, state,
      ...(execution.status === "completed" ? { outputCount: assetsForPort(source.portId).length } : {}) } };
    return JSON.stringify(config) === JSON.stringify(node.config) ? node : { ...node, config };
  });
  return nodes.some((node, index) => node !== draft.nodes[index]) ? { ...next, nodes } as GraphDraft : draft;
}
