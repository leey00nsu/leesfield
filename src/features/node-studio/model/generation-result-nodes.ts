import type { GraphDraft } from "../hook/use-graph-autosave";
import type { NodeExecutionDto } from "./node-execution-types";
import { findNodeDefinition, supportsVideoCaptureOutput, videoCaptureOutputPortId, type GeneratedResultGalleryItem, type PortDefinition, type ResultSourceSnapshot } from "@/shared/generation-graph/node-registry";
import { activeMediaOutputPorts, mediaOutputPorts } from "@/shared/generation-graph/media-output";

export type ResultSource = ResultSourceSnapshot;
type ResultSlot = { portId: string; type: "image" | "video" | "audio"; index: number };
type ResultExecution = Pick<NodeExecutionDto, "executionId" | "status" | "outputAssetIds" | "outputBindings">;
function record(value: unknown): Record<string, unknown> { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}; }
export function resultSource(config: unknown): ResultSource | null {
  const source = record(record(config).resultSource);
  return typeof source.nodeId === "string" && typeof source.portId === "string" && typeof source.index === "number"
    ? source as ResultSource : null;
}
function resultPorts(kind: string, ports = mediaOutputPorts(kind)) {
  const available = kind !== "edit.image.splitGrid" && findNodeDefinition(kind)?.executionMode !== "none" ? ports : [];
  return available.filter((port): port is PortDefinition & { valueType: "image" | "video" | "audio" } =>
    port.valueType === "image" || port.valueType === "video" || port.valueType === "audio");
}
export function automaticResultPorts(kind: string, config?: unknown) {
  return resultPorts(kind, activeMediaOutputPorts(kind, config));
}
function automaticResultSlots(draft: GraphDraft, sourceId: string) {
  const source = draft.nodes.find(node => node.id === sourceId);
  return automaticResultPorts(source?.kind ?? "", source?.config).map(port => ({ portId: port.id, type: port.valueType, index: 0 }));
}

export function resultGalleryItems(config: unknown): readonly GeneratedResultGalleryItem[] | null {
  const items = record(config).resultItems;
  return Array.isArray(items) ? items as GeneratedResultGalleryItem[] : null;
}
function nextPosition(draft: GraphDraft, sourceId: string) {
  const source = draft.nodes.find(node => node.id === sourceId)!;
  const position = { x: source.position.x + 620, y: source.position.y };
  while (draft.nodes.some(node => Math.abs(node.position.x - position.x) < 400 && Math.abs(node.position.y - position.y) < 400)) position.y += 440;
  return position;
}
function galleryConfig(items: readonly GeneratedResultGalleryItem[]) {
  const types = new Set(items.map(item => item.mediaType));
  return { mediaType: types.size === 1 ? items[0].mediaType : null, excludedAssetIds: [], resultItems: [...items] };
}
function appendResultGallery(draft: GraphDraft, sourceId: string, executionId: string | null, groups: readonly (readonly ResultSlot[])[]) {
  const slots = groups.flat(), ports = [...new Map(slots.map(slot => [slot.portId, slot])).values()];
  if (draft.nodes.length + 1 > 500 || draft.edges.length + ports.length > 2_000 || slots.length > 500) throw new Error("RESULT_NODE_LIMIT_EXCEEDED");
  const items: GeneratedResultGalleryItem[] = slots.map(slot => ({ id: crypto.randomUUID(), nodeId: sourceId, executionId,
    portId: slot.portId, index: slot.index, mediaType: slot.type, assetId: null, state: "pending" }));
  let offset = 0;
  const references = groups.map(group => { const ids = items.slice(offset, offset + group.length).map(item => item.id); offset += group.length; return ids; });
  const node = { id: crypto.randomUUID(), kind: "output.gallery", configVersion: 1, position: nextPosition(draft, sourceId),
    selectedOutputAssetId: null, config: galleryConfig(items) };
  return { groups: references, ids: items.map(item => item.id), draft: { ...draft, nodes: [...draft.nodes, node], edges: [...draft.edges,
    ...ports.map((slot, index) => ({ id: crypto.randomUUID(), sourceNodeId: sourceId, sourcePortId: slot.portId,
      targetNodeId: node.id, targetPortId: slot.type, sortOrder: index }))] } as GraphDraft };
}

/** A UI batch reserves one Gallery; slot IDs bind repeats independently of the producer selection. */
export function reserveResultNodes(draft: GraphDraft, sourceId: string, repeatCount = 1) {
  const slots = automaticResultSlots(draft, sourceId);
  if (!slots.length) return { draft, groups: [[]] as string[][] };
  if (repeatCount > 1 || slots.length > 1) return appendResultGallery(draft, sourceId, null, Array.from({ length: repeatCount }, () => slots));
  const appended = appendResultNodes(draft, sourceId);
  return { draft: appended.draft, groups: [appended.ids] };
}

export function unsubmittedResultIds(draft: Pick<GraphDraft, "nodes">, candidates?: readonly string[]) {
  const allowed = candidates ? new Set(candidates) : null;
  return draft.nodes.flatMap(node => {
    const items = node.kind === "output.gallery" ? resultGalleryItems(node.config) : null;
    if (items) return items.filter(item => item.state === "pending" && !item.executionId && (!allowed || allowed.has(item.id))).map(item => item.id);
    const source = resultSource(node.config);
    return source?.state === "pending" && !source.executionId && (!allowed || allowed.has(node.id)) ? [node.id] : [];
  });
}

/** Placement uses saved positions; never moves existing user nodes. */
export function appendResultNodes(draft: GraphDraft, sourceId: string, executionId: string | null = null,
  slots = automaticResultSlots(draft, sourceId)) {
  const source = draft.nodes.find(node => node.id === sourceId);
  if (!source || slots.length === 0) return { draft, ids: [] as string[] };
  if (slots.length > 1) return appendResultGallery(draft, sourceId, executionId, [slots]);
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

/** Captures use the same result node, wire, placement and frozen snapshot as generation. */
export function appendCapturedFrameResult(draft: GraphDraft, sourceId: string, assetId: string | null = null) {
  const source = draft.nodes.find(node => node.id === sourceId);
  if (!source || !supportsVideoCaptureOutput(source.kind)) throw new Error("CAPTURE_SOURCE_INVALID");
  const appended = appendResultNodes(draft, sourceId, null, [{ portId: videoCaptureOutputPortId, type: "image", index: 0 }]);
  const ids = new Set(appended.ids);
  return { ...appended, draft: { ...appended.draft, nodes: appended.draft.nodes.map(node => ids.has(node.id)
    ? { ...node, config: { ...record(node.config), assetId, resultSource: { ...resultSource(node.config)!, state: assetId ? "completed" : "pending" } } } : node) } as GraphDraft };
}

export function bindResultNodes(draft: GraphDraft, ids: readonly string[], executionId: string | null, state: ResultSource["state"] = "pending") {
  const selected = new Set(ids);
  const binds = (source: ResultSource, id: string) => selected.has(id) && source.state === "pending" && (!source.executionId || source.executionId === executionId);
  return { ...draft, nodes: draft.nodes.map(node => {
    const items = node.kind === "output.gallery" ? resultGalleryItems(node.config) : null;
    if (items) {
      const next = items.map(item => binds(item, item.id) ? { ...item, executionId, state } : item);
      return next.some((item, index) => item !== items[index]) ? { ...node, config: { ...record(node.config), resultItems: next } } : node;
    }
    const source = resultSource(node.config);
    return source && binds(source, node.id) ? { ...node, config: { ...record(node.config), resultSource: { ...source, executionId, state } } } : node;
  }) } as GraphDraft;
}

/** A binding's index includes missing slots: a later asset must not slide into a failed slot. */
function outputAssets(execution: ResultExecution, portId: string, singlePort: boolean): (string | null)[] {
  if (!execution.outputBindings?.length) return singlePort ? execution.outputAssetIds : [];
  const bindings = execution.outputBindings.filter(binding => binding.portId === portId);
  const count = bindings.reduce((max, item) => Math.max(max, item.sortOrder + 1), 0);
  if (count > 500) throw new Error("RESULT_NODE_LIMIT_EXCEEDED");
  const assets: (string | null)[] = Array.from({ length: count }, () => null);
  for (const binding of bindings) assets[binding.sortOrder] = binding.assetId;
  return assets;
}

/** Count may be unknown before acceptance. Only a pending automatic Input is promoted. */
function promoteMultipleOutputs(draft: GraphDraft, sourceId: string, execution: ResultExecution) {
  if (execution.status !== "completed") return draft;
  const ports = resultPorts(draft.nodes.find(node => node.id === sourceId)!.kind);
  const pending = draft.nodes.filter(node => {
    const source = resultSource(node.config);
    return node.kind.startsWith("input.") && source?.nodeId === sourceId && source.executionId === execution.executionId && source.state === "pending";
  });
  // Previously saved multi-node workflows stay as authored; native reservations use one Input or Gallery.
  if (pending.length !== 1) return draft;
  const original = pending[0], binding = resultSource(original.config)!;
  const port = ports.find(port => port.id === binding.portId);
  if (!port || binding.index !== 0) return draft;
  const assets = outputAssets(execution, port.id, ports.length === 1);
  if (assets.length <= 1) return draft;
  const slots = assets.map((_, index) => ({ portId: port.id, type: port.valueType, index }));
  // Preserve a user's explicit downstream extraction of the pending first result.
  if (draft.edges.some(edge => edge.sourceNodeId === original.id)) return appendResultGallery(draft, sourceId, execution.executionId, [slots]).draft;
  const items: GeneratedResultGalleryItem[] = slots.map(slot => ({ ...binding, id: crypto.randomUUID(), index: slot.index,
    mediaType: slot.type, assetId: null, state: "pending" }));
  const presentation = record(original.config).presentation;
  return { ...draft, nodes: draft.nodes.map(node => node.id === original.id ? { ...node, kind: "output.gallery",
    config: { ...galleryConfig(items), ...(presentation ? { presentation } : {}) } } : node),
    edges: draft.edges.map(edge => edge.targetNodeId === original.id && edge.sourceNodeId === sourceId && edge.sourcePortId === port.id
      ? { ...edge, targetPortId: port.valueType } : edge) } as GraphDraft;
}

/** Frozen result snapshots never follow a producer's later selection or execution. */
export function reconcileResultNodes(draft: GraphDraft, sourceId: string, execution: ResultExecution) {
  if (!draft.nodes.some(node => node.id === sourceId)) return draft;
  // Reservations retain their named ports even if the producer's mode has changed since acceptance.
  const ports = resultPorts(draft.nodes.find(node => node.id === sourceId)!.kind);
  let next = promoteMultipleOutputs(draft, sourceId, execution);
  const nodes = next.nodes.map(node => {
    const items = node.kind === "output.gallery" ? resultGalleryItems(node.config) : null;
    if (items) {
      const pending = items.filter(item => item.nodeId === sourceId && item.executionId === execution.executionId && item.state === "pending");
      if (!pending.length || !["completed", "failed", "cancelled"].includes(execution.status)) return node;
      let expanded = [...items];
      if (execution.status === "completed") for (const port of ports) {
        const existing = pending.filter(item => item.portId === port.id);
        if (!existing.length) continue;
        const count = Math.max(...existing.map(item => item.outputCount ?? item.index + 1));
        const assets = outputAssets(execution, port.id, ports.length === 1);
        for (let index = count; index < assets.length; index++) expanded.push({ ...existing[0], id: crypto.randomUUID(), index, assetId: null });
      }
      if (expanded.length > 500) throw new Error("RESULT_NODE_LIMIT_EXCEEDED");
      expanded = expanded.map(item => {
        if (item.nodeId !== sourceId || item.executionId !== execution.executionId || item.state !== "pending") return item;
        const assets = outputAssets(execution, item.portId, ports.length === 1);
        const assetId = execution.status === "completed" ? assets[item.index] ?? null : null;
        const state = execution.status === "completed" ? assetId ? "completed" : "failed" : execution.status as "failed" | "cancelled";
        return { ...item, assetId, state, ...(execution.status === "completed" ? { outputCount: assets.length } : {}) };
      });
      const order = new Map(items.map((item, index) => [item.id, index]));
      const parent = new Map(expanded.filter(item => !order.has(item.id)).map(item => [item.id,
        items.findIndex(original => original.nodeId === item.nodeId && original.executionId === item.executionId && original.portId === item.portId)]));
      expanded.sort((a, b) => (order.get(a.id) ?? parent.get(a.id) ?? 0) - (order.get(b.id) ?? parent.get(b.id) ?? 0) || a.index - b.index);
      return { ...node, config: { ...record(node.config), resultItems: expanded } };
    }
    const source = resultSource(node.config);
    if (!source || source.nodeId !== sourceId || source.executionId !== execution.executionId) return node;
    if (source.state !== "pending") return node;
    const assets = outputAssets(execution, source.portId, ports.length === 1);
    const assetId = execution.status === "completed" ? assets[source.index] ?? null : null;
    const state = execution.status === "completed" ? assetId ? "completed" : "failed"
      : execution.status === "failed" || execution.status === "cancelled" ? execution.status : "pending";
    const config = { ...record(node.config), assetId, resultSource: { ...source, state,
      ...(execution.status === "completed" ? { outputCount: assets.length } : {}) } };
    return JSON.stringify(config) === JSON.stringify(node.config) ? node : { ...node, config };
  });
  if (nodes.some((node, index) => node !== next.nodes[index])) next = { ...next, nodes } as GraphDraft;
  return next;
}
