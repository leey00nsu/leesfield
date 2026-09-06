import { buildCellInstances, type NodeBananaRuntimeGraph } from "@node-banana-runtime/runtime-entry";
import { createCanonicalRuntimeNode } from "../runtime/node-banana/node-banana-runtime-adapter";
import { pruneGroupsAfterNodeDeletion, type CanonicalGroup } from "@/shared/generation-graph/canonical-graph";
import { splitTemplateSchema, type CanonicalSplitTemplate } from "@/shared/generation-graph/split-grid-template";
import { hostedSplitTemplate } from "./split-grid-template-adapter";

export type SplitCellGroup = {
  id: string; name: string; color: "neutral" | "blue" | "green" | "purple" | "orange" | "red";
  position: { x: number; y: number }; size: { width: number; height: number }; locked?: boolean;
};
export type SplitCell = { baseNodeId: string; nodeIds: string[]; groupId: string | null };
export type SplitMaterialization = { rows: number; cols: number; cells: SplitCell[] };
const object = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};

export function splitMaterialization(config: unknown): SplitMaterialization | undefined {
  const value = object(config).materialization;
  return value && typeof value === "object" && Array.isArray(object(value).cells) ? value as SplitMaterialization : undefined;
}

/** One graph replacement is one undo checkpoint; assets remain in History. */
export function materializeSplitResult(
  graph: NodeBananaRuntimeGraph,
  nodeId: string,
  outputAssetIds: string[],
  dimensions: { rows: number; cols: number },
  createId: () => string = () => crypto.randomUUID(),
): NodeBananaRuntimeGraph {
  const source = graph.nodes.find((node) => node.id === nodeId);
  if (!source || source.data.canonicalKind !== "edit.image.splitGrid") return graph;
  const config = object(source.data.config);
  const parameters = object(config.parameters);
  const rows = Number(parameters.rows ?? 2), cols = Number(parameters.cols ?? 2);
  if (rows !== dimensions.rows || cols !== dimensions.cols || outputAssetIds.length !== rows * cols) {
    throw new Error("SPLIT_GRID_CONFIGURATION_CHANGED_RERUN_REQUIRED");
  }
  const previous = splitMaterialization(config);
  const owned = (id: string) => graph.nodes.some((node) => node.id === id
    && node.data.canonicalKind === "input.image" && object(object(node.data.config).splitSource).nodeId === nodeId);
  const reuse = previous && previous.rows === rows && previous.cols === cols
    && previous.cells.length === rows * cols && previous.cells.some((cell) => owned(cell.baseNodeId));
  if (config.template && !reuse) return applySplitTemplate(graph, nodeId, splitTemplateSchema.parse(config.template), false, outputAssetIds, createId);
  let cells = previous?.cells ?? [];
  let nodes = graph.nodes;
  let edges = graph.edges;
  let groups: CanonicalGroup[] = graph.groups ?? [];
  if (!reuse) {
    const stale = new Set(previous?.cells.flatMap((cell) => cell.nodeIds.filter(owned)) ?? []);
    nodes = nodes.filter((node) => !stale.has(node.id));
    edges = edges.filter((edge) => !stale.has(edge.source) && !stale.has(edge.target));
    groups = pruneGroupsAfterNodeDeletion(groups, stale);
    if (nodes.length + rows * cols > 500) throw new Error("SPLIT_GRID_NODE_LIMIT_EXCEEDED");
    if (groups.length + rows * cols > 500) throw new Error("SPLIT_GRID_GROUP_LIMIT_EXCEEDED");
    // Actual upstream default-cell factory owns spacing, cell order and group bounds.
    const built = buildCellInstances({
      splitNode: { ...source, type: "splitGrid" },
      template: { baseNodeId: "cell-image", nodes: [{ id: "cell-image", type: "imageInput", position: { x: 0, y: 0 } }], edges: [] },
      rows, cols, makeNodeId: createId, makeGroupId: createId, groupColor: "neutral",
      makeEdgeData: () => ({}),
    });
    cells = built.cells.map((cell) => ({
      baseNodeId: cell.baseImageNodeId, nodeIds: cell.nodeIds,
      groupId: cell.groupId ?? null,
    }));
    groups = [...groups, ...built.cells.map((cell): CanonicalGroup => {
      const group = built.groups[cell.groupId!] as SplitCellGroup;
      return { id: group.id, title: group.name, color: group.color,
        bounds: { ...group.position, ...group.size }, locked: group.locked ?? false,
        memberNodeIds: [...cell.nodeIds] };
    })];
    nodes = [...nodes, ...built.nodes.map((node, index) => {
      const created = createCanonicalRuntimeNode("input.image", node.id, node.position);
      return { ...created, width: node.style?.width, height: node.style?.height,
        data: { ...created.data, config: { assetId: outputAssetIds[index],
          filename: `leesfield-split-${Math.floor(index / cols) + 1}-${index % cols + 1}.png`,
          splitSource: { nodeId, index } } } };
    })];
    edges = [...edges, ...built.edges.map((edge) => ({
      id: edge.id, source: edge.source, target: edge.target,
      sourceHandle: "reference", targetHandle: "reference", type: "reference",
      data: { sourcePortId: "images", targetPortId: "reference", sortOrder: 0 },
    }))];
  }
  const slots = new Map(cells.map((cell, index) => [cell.baseNodeId, index]));
  nodes = nodes.map((node) => {
    if (node.id === nodeId) return { ...node, data: { ...node.data,
      selectedOutputAssetId: outputAssetIds[0], config: { ...config, materialization: { rows, cols, cells } } } };
    const index = slots.get(node.id);
    if (index === undefined || object(object(node.data.config).splitSource).nodeId !== nodeId) return node;
    return { ...node, data: { ...node.data, config: { ...object(node.data.config), assetId: outputAssetIds[index] } } };
  });
  return { ...graph, nodes, edges, groups };
}

export function splitCellGroups(graph: NodeBananaRuntimeGraph) {
  const groups: Record<string, SplitCellGroup> = {};
  for (const group of graph.groups ?? []) {
    groups[group.id] = { id: group.id, name: group.title, color: group.color, locked: group.locked,
      position: { x: group.bounds.x, y: group.bounds.y },
      size: { width: group.bounds.width, height: group.bounds.height } };
  }
  return groups;
}

/** Build first, then publish once. Replacing existing cells always needs an explicit confirmation. */
export function applySplitTemplate(
  graph: NodeBananaRuntimeGraph, nodeId: string, input: CanonicalSplitTemplate,
  replaceConfirmed = false, outputAssetIds: string[] = [], createId: () => string = () => crypto.randomUUID(),
): NodeBananaRuntimeGraph {
  const template = splitTemplateSchema.parse(input);
  const source = graph.nodes.find((node) => node.id === nodeId);
  if (!source || source.data.canonicalKind !== "edit.image.splitGrid") throw new Error("Split Grid is unavailable.");
  const config = object(source.data.config), parameters = object(config.parameters);
  const rows = Number(parameters.rows ?? 2), cols = Number(parameters.cols ?? 2);
  const previous = splitMaterialization(config);
  const owned = new Set(graph.nodes.filter((node) => {
    const data = object(node.data.config);
    return object(data.templateSource).nodeId === nodeId || (node.data.canonicalKind === "input.image" && object(data.splitSource).nodeId === nodeId);
  }).map((node) => node.id));
  // Provenance, rather than arbitrary node IDs in the stored cell list, bounds deletion.
  const removed = new Set((previous?.cells.flatMap((cell) => cell.nodeIds) ?? []).filter((id) => owned.has(id)));
  const removedEdges = graph.edges.filter((edge) => removed.has(edge.source) || removed.has(edge.target));
  const nodes = graph.nodes.filter((node) => !removed.has(node.id));
  const groups = pruneGroupsAfterNodeDeletion(graph.groups ?? [], removed);
  if (!Number.isInteger(rows) || !Number.isInteger(cols) || rows < 1 || rows > 20 || cols < 1 || cols > 20) throw new Error("Invalid grid dimensions.");
  if (nodes.length + template.nodes.length * rows * cols > 500 || groups.length + rows * cols > 500) throw new Error("SPLIT_GRID_NODE_LIMIT_EXCEEDED");
  if (graph.edges.length - removedEdges.length + (template.edges.length + 1) * rows * cols > 2000) throw new Error("SPLIT_GRID_EDGE_LIMIT_EXCEEDED");
  if (removed.size && !replaceConfirmed) {
    const external = removedEdges.filter((edge) => !(removed.has(edge.source) && removed.has(edge.target)) && edge.source !== nodeId).length;
    throw new Error(`Replace ${removed.size} existing cell nodes and ${external} external connections? Cell edits and outputs will be removed from this Space; media remains in History.`);
  }
  const built = buildCellInstances({ splitNode: { ...source, type: "splitGrid" }, template: hostedSplitTemplate(template), rows, cols,
    makeNodeId: createId, makeGroupId: createId, groupColor: "neutral", makeEdgeData: () => ({}) });
  const cells = built.cells.map((cell) => ({ baseNodeId: cell.baseImageNodeId, nodeIds: cell.nodeIds, groupId: cell.groupId ?? null }));
  const generated = built.nodes.map((node, offset) => {
    const local = template.nodes[offset % template.nodes.length], index = Math.floor(offset / template.nodes.length);
    const created = createCanonicalRuntimeNode(local.kind, node.id, node.position);
    const oldBase = previous?.cells[index]?.baseNodeId;
    const oldAsset = graph.nodes.find((node) => node.id === oldBase)?.data.config;
    const assetId = outputAssetIds[index] ?? (previous?.rows === rows && previous.cols === cols ? object(oldAsset).assetId : null) ?? null;
    return { ...created, width: node.style?.width, height: node.style?.height, data: { ...created.data, canonicalKind: local.kind,
      config: { ...object(local.config), templateSource: { nodeId, localNodeId: local.id, index },
        ...(local.id === template.baseNodeId ? { assetId, splitSource: { nodeId, index } } : {}) } } };
  });
  const targetKinds = new Map(generated.map((node) => [node.id, node.data.canonicalKind]));
  const portCounts = new Map<string, number>();
  const edges = built.edges.map((edge) => {
    const reference = edge.source === nodeId;
    const targetPortId = reference ? "reference" : targetKinds.get(edge.target) === "generate.image"
      ? edge.targetHandle === "text" ? "prompt" : "primary" : edge.targetHandle;
    const key = `${edge.target}:${targetPortId}`, sortOrder = portCounts.get(key) ?? 0;
    portCounts.set(key, sortOrder + 1);
    return { id: edge.id, source: edge.source, target: edge.target, sourceHandle: edge.sourceHandle, targetHandle: edge.targetHandle,
      ...(reference ? { type: "reference" } : {}), data: { sourcePortId: reference ? "images" : edge.sourceHandle, targetPortId, sortOrder, hasPause: false } };
  });
  return { ...graph,
    nodes: [...nodes.map((node) => node.id === nodeId ? { ...node, data: { ...node.data, config: { ...config, template, materialization: { rows, cols, cells } } } } : node), ...generated],
    edges: [...graph.edges.filter((edge) => !removed.has(edge.source) && !removed.has(edge.target)), ...edges],
    groups: [...groups, ...built.cells.map((cell): CanonicalGroup => {
      const group = built.groups[cell.groupId!] as SplitCellGroup;
      return { id: group.id, title: group.name, color: group.color, bounds: { ...group.position, ...group.size }, locked: false, memberNodeIds: [...cell.nodeIds] };
    })],
  };
}
