import type { NodeBananaRuntimeNode } from "@node-banana-runtime/runtime-entry";

import { splitMaterialization } from "./split-grid-materialization";

const object = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value)
  ? value as Record<string, unknown> : {};

/** Remap ownership metadata before the canvas changes pasted node IDs/positions. */
export function remapSplitClipboardNodes(
  nodes: NodeBananaRuntimeNode[],
  idMap: Record<string, string>,
  _offset: { x: number; y: number } = { x: 0, y: 0 },
  groupIds: Record<string, string> = {},
): NodeBananaRuntimeNode[] {
  // The shared runtime callback supplies the offset; canonical group bounds are
  // translated there, not in Split provenance.
  void _offset;
  const copiedIds = new Set(nodes.map((node) => node.id));
  const copiedSplits = new Set(nodes.filter((node) => node.data.canonicalKind === "edit.image.splitGrid").map((node) => node.id));
  const mappedId = (id: string) => copiedIds.has(id) && Object.hasOwn(idMap, id) ? idMap[id] : undefined;
  return nodes.map((original) => {
    let node = original;
    const originalConfig = object(original.data.config), provenance = object(originalConfig.templateSource);
    if (originalConfig.templateSource) {
      const nextConfig = { ...originalConfig };
      const sourceId = typeof provenance.nodeId === "string" && copiedSplits.has(provenance.nodeId) ? mappedId(provenance.nodeId) : undefined;
      if (sourceId) nextConfig.templateSource = { ...provenance, nodeId: sourceId };
      else delete nextConfig.templateSource;
      node = { ...original, data: { ...original.data, config: nextConfig } };
    }
    const config = object(node.data.config);
    if (node.data.canonicalKind === "edit.image.splitGrid") {
      const materialization = splitMaterialization(config);
      if (!materialization) return node;
      const cells = materialization.cells.flatMap((cell) => {
        const baseNodeId = mappedId(cell.baseNodeId);
        if (!baseNodeId) return [];
        return [{
          ...cell,
          baseNodeId,
          nodeIds: cell.nodeIds.flatMap((id) => mappedId(id) ? [mappedId(id)!] : []),
          groupId: cell.groupId && Object.hasOwn(groupIds, cell.groupId) ? groupIds[cell.groupId] : null,
        }];
      });
      const nextConfig = { ...config };
      if (cells.length) nextConfig.materialization = { ...materialization, cells };
      else delete nextConfig.materialization;
      return { ...node, data: { ...node.data, config: nextConfig } };
    }
    if (node.data.canonicalKind === "input.image" && Object.hasOwn(config, "splitSource")) {
      const splitSource = object(config.splitSource);
      const sourceId = typeof splitSource.nodeId === "string" && copiedSplits.has(splitSource.nodeId)
        ? mappedId(splitSource.nodeId) : undefined;
      const nextConfig = { ...config };
      if (sourceId) nextConfig.splitSource = { ...splitSource, nodeId: sourceId };
      else delete nextConfig.splitSource;
      return { ...node, data: { ...node.data, config: nextConfig } };
    }
    return node;
  });
}
