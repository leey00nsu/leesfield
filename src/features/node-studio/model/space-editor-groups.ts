import type { CanonicalGroup, CanonicalNode } from "@/shared/generation-graph/canonical-graph";

import { findSpaceNodeCatalogItem } from "./space-editor-catalog";
import {
  SpaceEditorCommandError,
  type SpaceNodeMeasurements,
  type SpacePosition,
} from "./space-editor-command-types";
import type { SpaceEditorDocument } from "./space-editor-types";

export const spaceGroupColors = ["neutral", "blue", "green", "purple", "orange", "red"] as const;

export function spaceNodeSize(node: CanonicalNode, measurements: SpaceNodeMeasurements = {}) {
  if (Object.hasOwn(measurements, node.id)) return measurements[node.id];
  const config = node.config;
  if (node.kind === "note.memo" && config && typeof config === "object" && !Array.isArray(config)) {
    const size = config.size;
    if (size && typeof size === "object" && !Array.isArray(size)
      && typeof size.width === "number" && typeof size.height === "number") {
      return { width: size.width, height: size.height };
    }
  }
  return findSpaceNodeCatalogItem(node.kind)?.geometry ?? { width: 300, height: 280 };
}

export function boundsForSpaceNodes(nodes: readonly CanonicalNode[], measurements: SpaceNodeMeasurements = {}): CanonicalGroup["bounds"] {
  if (!nodes.length) throw new SpaceEditorCommandError("EMPTY_GROUP");
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const node of nodes) {
    const size = spaceNodeSize(node, measurements);
    minX = Math.min(minX, node.position.x);
    minY = Math.min(minY, node.position.y);
    maxX = Math.max(maxX, node.position.x + size.width);
    maxY = Math.max(maxY, node.position.y + size.height);
  }
  return { x: minX - 20, y: minY - 20, width: maxX - minX + 40, height: maxY - minY + 40 };
}

export function createSpaceEditorGroup(
  document: SpaceEditorDocument,
  input: { id: string; memberNodeIds: readonly string[]; title?: string; color?: CanonicalGroup["color"]; bounds?: CanonicalGroup["bounds"]; locked?: boolean },
  measurements: SpaceNodeMeasurements = {},
): SpaceEditorDocument {
  const selected = new Set(input.memberNodeIds);
  const members = document.nodes.filter((node) => selected.has(node.id));
  if (members.length !== selected.size) throw new SpaceEditorCommandError("NODE_NOT_FOUND");
  if (!members.length && !input.bounds) throw new SpaceEditorCommandError("EMPTY_GROUP");
  const group: CanonicalGroup = {
    id: input.id,
    title: input.title ?? `Group ${document.groups.length + 1}`,
    color: input.color ?? spaceGroupColors.find((color) => !document.groups.some((group) => group.color === color)) ?? "neutral",
    bounds: input.bounds ?? boundsForSpaceNodes(members, measurements),
    locked: input.locked ?? false,
    memberNodeIds: members.map((node) => node.id),
  };
  return { ...document, groups: [...ungroupSpaceNodes(document.groups, selected), group] };
}

/** Transfers and ungrouping preserve empty frames. Only deletion prunes them. */
export function ungroupSpaceNodes(groups: CanonicalGroup[], ids: ReadonlySet<string>): CanonicalGroup[] {
  let changed = false;
  const next = groups.map((group) => {
    const members = group.memberNodeIds.filter((id) => !ids.has(id));
    if (members.length === group.memberNodeIds.length) return group;
    changed = true;
    return { ...group, memberNodeIds: members };
  });
  return changed ? next : groups;
}

export function setSpaceGroupMembers(document: SpaceEditorDocument, groupId: string, nodeIds: readonly string[]): SpaceEditorDocument {
  if (!document.groups.some((group) => group.id === groupId)) throw new SpaceEditorCommandError("GROUP_NOT_FOUND");
  const ids = new Set(nodeIds);
  if (ids.size !== nodeIds.length) throw new SpaceEditorCommandError("INVALID_COMMAND", "Duplicate group member.");
  if (document.nodes.filter((node) => ids.has(node.id)).length !== ids.size) throw new SpaceEditorCommandError("NODE_NOT_FOUND");
  return { ...document, groups: ungroupSpaceNodes(document.groups, ids).map((group) => group.id === groupId
    ? { ...group, memberNodeIds: [...nodeIds] } : group) };
}

/** The first containing frame owns a dragged node, including locked frames. */
export function regroupMovedSpaceNodes(
  document: SpaceEditorDocument, movedIds: ReadonlySet<string>, measurements: SpaceNodeMeasurements = {},
): SpaceEditorDocument {
  if (!document.groups.length || !movedIds.size) return document;
  const memberships = new Map(document.groups.map((group) => [group.id, group.memberNodeIds.filter((id) => !movedIds.has(id))]));
  for (const node of document.nodes) {
    if (!movedIds.has(node.id)) continue;
    const size = spaceNodeSize(node, measurements);
    const x = node.position.x + size.width / 2, y = node.position.y + size.height / 2;
    const group = document.groups.find(({ bounds: b }) => x >= b.x && x <= b.x + b.width && y >= b.y && y <= b.y + b.height);
    if (group) memberships.get(group.id)!.push(node.id);
  }
  return { ...document, groups: document.groups.map((group) => {
    const members = memberships.get(group.id)!;
    return members.length === group.memberNodeIds.length && members.every((id, index) => id === group.memberNodeIds[index])
      ? group : { ...group, memberNodeIds: members };
  }) };
}

export function moveSpaceGroup(document: SpaceEditorDocument, groupId: string, delta: SpacePosition): SpaceEditorDocument {
  const original = document.groups.find((group) => group.id === groupId);
  if (!original) throw new SpaceEditorCommandError("GROUP_NOT_FOUND");
  if (!Number.isFinite(delta.x) || !Number.isFinite(delta.y)) throw new SpaceEditorCommandError("INVALID_COMMAND");
  if (!delta.x && !delta.y) return document;
  const ids = new Set(original.memberNodeIds);
  return {
    ...document,
    groups: document.groups.map((group) => group === original ? {
      ...group, bounds: { ...group.bounds, x: group.bounds.x + delta.x, y: group.bounds.y + delta.y },
    } : group),
    nodes: document.nodes.map((node) => ids.has(node.id) ? {
      ...node, position: { x: node.position.x + delta.x, y: node.position.y + delta.y },
    } : node),
  };
}
