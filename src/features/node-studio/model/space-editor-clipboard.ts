import type { CanonicalJsonValue } from "@/shared/generation-graph/canonical-graph";
import { isUnavailableEditNodeKind } from "@/shared/generation-graph/node-availability";
import { validateNodeConfig } from "@/shared/generation-graph/node-registry";

import {
  SpaceEditorCommandError,
  type SpaceEditorClipboard,
  type SpaceEditorIdMaps,
  type SpacePosition,
} from "./space-editor-command-types";
import type { SpaceEditorDocument } from "./space-editor-types";

const object = (value: CanonicalJsonValue | undefined): Record<string, CanonicalJsonValue> | undefined =>
  value !== null && typeof value === "object" && !Array.isArray(value) ? value : undefined;

export function copySpaceEditorSelection(document: SpaceEditorDocument, nodeIds: readonly string[]): SpaceEditorClipboard {
  const ids = new Set(nodeIds);
  const nodes = document.nodes.filter((node) => ids.has(node.id));
  if (nodes.length !== ids.size) throw new SpaceEditorCommandError("NODE_NOT_FOUND");
  for (const node of nodes) {
    if (isUnavailableEditNodeKind(node.kind)) throw new SpaceEditorCommandError("RETIRED_NODE");
    if (!validateNodeConfig(node.kind, node.configVersion, node.config).supported) throw new SpaceEditorCommandError("UNSUPPORTED_NODE");
  }
  // Snapshot the clipboard, so subsequent edits cannot change its contents.
  return structuredClone({
    version: 1 as const,
    nodes,
    edges: document.edges.filter((edge) => ids.has(edge.sourceNodeId) && ids.has(edge.targetNodeId)),
    groups: document.groups.filter((group) => group.memberNodeIds.some((id) => ids.has(id)))
      .map((group) => ({ ...group, memberNodeIds: group.memberNodeIds.filter((id) => ids.has(id)) })),
  });
}

/** Explicit graph references only: template-local IDs and assets are separate namespaces. */
export function remapSpaceEditorClipboardConfig(
  kind: string, value: CanonicalJsonValue, ids: SpaceEditorIdMaps,
  createId: () => string = () => crypto.randomUUID(),
): CanonicalJsonValue {
  const original = object(value);
  if (!original) return value;
  const config = { ...original };
  for (const key of ["templateSource", "splitSource"] as const) {
    const source = object(config[key]);
    if (!source || typeof source.nodeId !== "string") continue;
    const mapped = ids.nodes.get(source.nodeId);
    if (mapped) config[key] = { ...source, nodeId: mapped };
    else delete config[key];
  }
  const result = object(config.resultSource);
  if (result && typeof result.nodeId === "string") {
    config.resultSource = { ...result, nodeId: ids.nodes.get(result.nodeId) ?? result.nodeId };
  }
  if (kind === "output.gallery" && Array.isArray(config.resultItems)) {
    config.resultItems = config.resultItems.map((value) => {
      const item = object(value);
      if (!item || typeof item.nodeId !== "string") return value;
      const producerId = ids.nodes.get(item.nodeId);
      // A cloned producer has no original execution; a new slot cannot inherit
      // an unaccepted reservation either. Accepted runs on an uncopied producer remain observable.
      const detached = item.state === "pending" && (producerId !== undefined || !item.executionId);
      return { ...item, id: createId(), nodeId: producerId ?? item.nodeId,
        ...(detached ? { executionId: null, assetId: null, state: "cancelled" } : {}) };
    });
  }
  if (kind === "output.gallery" && Array.isArray(config.excludedOccurrences)) {
    config.excludedOccurrences = config.excludedOccurrences.flatMap(value => {
      const item = object(value);
      const edgeId = typeof item?.edgeId === "string" ? ids.edges.get(item.edgeId) : undefined;
      return item && edgeId ? [{ ...item, edgeId }] : [];
    });
  }
  if (kind === "output.gallery" && Array.isArray(config.legacyExcludedEdgeIds)) {
    config.legacyExcludedEdgeIds = config.legacyExcludedEdgeIds.flatMap(id => {
      const edgeId = typeof id === "string" ? ids.edges.get(id) : undefined;
      return edgeId ? [edgeId] : [];
    });
  }
  if (kind === "edit.video.stitch" || kind === "edit.image.gif") {
    const parameters = object(config.parameters);
    if (parameters && Array.isArray(parameters.clipOrder)) {
      config.parameters = { ...parameters, clipOrder: parameters.clipOrder.flatMap((id) => {
        const mapped = typeof id === "string" ? ids.edges.get(id) : undefined;
        return mapped ? [mapped] : [];
      }) };
    }
  }
  if (kind === "edit.image.splitGrid") {
    const materialization = object(config.materialization);
    if (materialization && Array.isArray(materialization.cells)) {
      const cells = materialization.cells.flatMap((value) => {
        const cell = object(value);
        const baseNodeId = typeof cell?.baseNodeId === "string" ? ids.nodes.get(cell.baseNodeId) : undefined;
        if (!cell || !baseNodeId) return [];
        return [{ ...cell, baseNodeId,
          nodeIds: Array.isArray(cell.nodeIds) ? cell.nodeIds.flatMap((id) => {
            const mapped = typeof id === "string" ? ids.nodes.get(id) : undefined;
            return mapped ? [mapped] : [];
          }) : [],
          groupId: typeof cell.groupId === "string" ? ids.groups.get(cell.groupId) ?? null : null,
        }];
      });
      if (cells.length) config.materialization = { ...materialization, cells };
      else delete config.materialization;
    }
  }
  return config;
}

/** Build all three maps before remapping any config (clipOrder contains edge IDs). */
export function prepareSpaceEditorPaste(
  clipboard: SpaceEditorClipboard,
  options: { offset?: SpacePosition; createId?: () => string } = {},
): { fragment: SpaceEditorClipboard; idMaps: SpaceEditorIdMaps } {
  if (clipboard.version !== 1) throw new SpaceEditorCommandError("INVALID_CLIPBOARD");
  const createId = options.createId ?? (() => crypto.randomUUID());
  const offset = options.offset ?? { x: 50, y: 50 };
  if (!Number.isFinite(offset.x) || !Number.isFinite(offset.y)) throw new SpaceEditorCommandError("INVALID_CLIPBOARD");
  for (const node of clipboard.nodes) {
    if (isUnavailableEditNodeKind(node.kind)) throw new SpaceEditorCommandError("RETIRED_NODE");
    if (!validateNodeConfig(node.kind, node.configVersion, node.config).supported) throw new SpaceEditorCommandError("UNSUPPORTED_NODE");
  }
  const allocate = (items: readonly { id: string }[]) => {
    const result = new Map(items.map((item) => [item.id, createId()]));
    if (result.size !== items.length || new Set(result.values()).size !== items.length) throw new SpaceEditorCommandError("DUPLICATE_ID");
    return result;
  };
  const idMaps: SpaceEditorIdMaps = {
    nodes: allocate(clipboard.nodes), edges: allocate(clipboard.edges), groups: allocate(clipboard.groups),
  };
  const fragment: SpaceEditorClipboard = {
    version: 1,
    nodes: clipboard.nodes.map((node) => ({ ...node, id: idMaps.nodes.get(node.id)!,
      position: { x: node.position.x + offset.x, y: node.position.y + offset.y },
      config: remapSpaceEditorClipboardConfig(node.kind, node.config, idMaps, createId),
    })),
    edges: clipboard.edges.map((edge) => {
      const sourceNodeId = idMaps.nodes.get(edge.sourceNodeId), targetNodeId = idMaps.nodes.get(edge.targetNodeId);
      if (!sourceNodeId || !targetNodeId) throw new SpaceEditorCommandError("INVALID_CLIPBOARD");
      return { ...edge, id: idMaps.edges.get(edge.id)!, sourceNodeId, targetNodeId };
    }),
    groups: clipboard.groups.map((group) => ({ ...group, id: idMaps.groups.get(group.id)!,
      bounds: { ...group.bounds, x: group.bounds.x + offset.x, y: group.bounds.y + offset.y },
      memberNodeIds: group.memberNodeIds.map((id) => {
        const mapped = idMaps.nodes.get(id);
        if (!mapped) throw new SpaceEditorCommandError("INVALID_CLIPBOARD");
        return mapped;
      }),
    })),
  };
  return { fragment, idMaps };
}
