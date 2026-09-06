import type { CanonicalNode } from "@/shared/generation-graph/canonical-graph";

/** Copies explicit graph-owned references only; asset IDs remain unchanged. */
export function copySpaceConfig(
  node: CanonicalNode,
  ids: Map<string, string>,
  newId: () => string,
  edgeIds: Map<string, string> = new Map(),
  groupIds: ReadonlyMap<string, string> = new Map(),
) {
  const config = structuredClone(node.config) as Record<string, unknown>;
  if (!config || typeof config !== "object" || Array.isArray(config)) return node.config;
  if (config.templateSource) {
    const source = config.templateSource as { nodeId: string };
    if (ids.has(source.nodeId)) config.templateSource = { ...source, nodeId: ids.get(source.nodeId)! };
    else delete config.templateSource;
  }
  if (node.kind === "edit.image.gif" || node.kind === "edit.video.stitch") {
    const parameters = config.parameters as Record<string, unknown> | undefined;
    if (parameters && Array.isArray(parameters.clipOrder)) {
      parameters.clipOrder = parameters.clipOrder.flatMap((id: string) => edgeIds.has(id) ? [edgeIds.get(id)!] : []);
    }
  }
  if (node.kind === "input.image" && config.splitSource) {
    const source = config.splitSource as { nodeId: string; index: number };
    if (ids.has(source.nodeId)) config.splitSource = { ...source, nodeId: ids.get(source.nodeId)! };
    else delete config.splitSource;
  }
  if (node.kind === "edit.image.splitGrid" && config.materialization) {
    const value = config.materialization as { rows: number; cols: number; cells: Array<{
      baseNodeId: string; nodeIds: string[]; group?: { id: string } | null; groupId?: string | null;
    }> };
    config.materialization = { ...value, cells: value.cells.flatMap<(typeof value.cells)[number]>((cell) => {
      const baseNodeId = ids.get(cell.baseNodeId);
      if (!baseNodeId) return [];
      if (Object.hasOwn(cell, "groupId")) {
        // The canonical group copy owns fresh IDs; Split holds a reference only.
        const provenance = { ...cell };
        delete provenance.group;
        return [{ ...provenance, baseNodeId,
          nodeIds: cell.nodeIds.flatMap((id) => ids.has(id) ? [ids.get(id)!] : []),
          groupId: cell.groupId ? groupIds.get(cell.groupId) ?? null : null }];
      }
      return [{ ...cell, baseNodeId, nodeIds: cell.nodeIds.flatMap((id) => ids.has(id) ? [ids.get(id)!] : []),
        group: cell.group ? { ...cell.group, id: newId() } : null }];
    }) };
  }
  return config as CanonicalNode["config"];
}
