import type { CanonicalNode } from "@/shared/generation-graph/canonical-graph";
import type { GalleryExcludedOccurrence } from "@/shared/generation-graph/node-registry";
import type { MediaType } from "@/shared/media-assets/media-asset-contract";
import type { SpaceEditorCommand } from "./space-editor-command-types";
import type { SpaceInputResolver } from "./space-editor-inputs";

export type GalleryItem = {
  type: MediaType; assetId: string; key: string; resultId?: string;
  edgeId?: string; occurrence?: number;
};
export type GalleryStatus = { type: MediaType; state: "pending" | "failed" | "cancelled"; key: string; resultId: string };
export type GalleryEntry = GalleryItem | GalleryStatus;

function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
function exclusions(config: unknown): readonly GalleryExcludedOccurrence[] {
  const entries = record(config).excludedOccurrences;
  return Array.isArray(entries) ? entries as GalleryExcludedOccurrence[] : [];
}
const occurrenceKey = (entry: GalleryExcludedOccurrence) => JSON.stringify([entry.edgeId, entry.assetId, entry.occurrence]);
export function isGalleryItem(entry: GalleryEntry): entry is GalleryItem { return "assetId" in entry; }

/** Snapshots own ordinal slots; live manual inputs own an edge/asset occurrence. */
export function galleryEntries(inputs: SpaceInputResolver, nodeId: string, config: unknown): GalleryEntry[] {
  const legacy = record(config).excludedAssetIds;
  const excluded = new Set(Array.isArray(legacy) ? legacy : []);
  const legacyEdges = record(config).legacyExcludedEdgeIds;
  const scopedLegacy = Array.isArray(legacyEdges) ? new Set(legacyEdges) : undefined;
  const hidden = new Set(exclusions(config).map(occurrenceKey));
  const results = inputs.galleryResultItems(nodeId) ?? [];
  const represented = new Set(results.map(result => JSON.stringify([result.nodeId, result.portId])));
  const snapshots = results.flatMap((result): GalleryEntry[] => {
    const entry = { type: result.mediaType, key: JSON.stringify(["result", result.id]), resultId: result.id };
    if (result.state !== "completed") return [{ ...entry, state: result.state }];
    return result.assetId && !excluded.has(result.assetId) ? [{ ...entry, assetId: result.assetId }] : [];
  });
  const manual = (["image", "video", "audio"] as const).flatMap(type => inputs.incomingEdges(nodeId, type).flatMap(edge => {
    if (represented.has(JSON.stringify([edge.sourceNodeId, edge.sourcePortId]))) return [];
    const occurrences = new Map<string, number>();
    return inputs.edgeAssetIds(edge).flatMap((assetId): GalleryItem[] => {
      const occurrence = occurrences.get(assetId) ?? 0;
      occurrences.set(assetId, occurrence + 1);
      const identity = { edgeId: edge.id, assetId, occurrence };
      const legacyHidden = excluded.has(assetId) && (!scopedLegacy || scopedLegacy.has(edge.id));
      return assetId && !legacyHidden && !hidden.has(occurrenceKey(identity)) ? [{
        ...identity, type, key: JSON.stringify(["edge", edge.id, edge.sourceNodeId, edge.sourcePortId, assetId, occurrence]),
      }] : [];
    });
  }));
  return [...snapshots, ...manual];
}

/** Validate the clicked occurrence against current inputs before one atomic edit. */
export function galleryRemoveCommand(inputs: SpaceInputResolver, node: CanonicalNode, item: GalleryItem): SpaceEditorCommand | null {
  const entries = galleryEntries(inputs, node.id, node.config).filter(isGalleryItem);
  if (!entries.some(current => current.key === item.key && current.assetId === item.assetId && current.type === item.type)) return null;
  if (item.resultId) {
    const results = inputs.galleryResultItems(node.id) ?? [], selected = results.find(result => result.id === item.resultId);
    if (!selected) return null;
    const remaining = results.filter(result => result.id !== item.resultId);
    const referenced = remaining.some(result => result.nodeId === selected.nodeId && result.portId === selected.portId);
    const edgeIds = referenced ? [] : inputs.incomingEdges(node.id, item.type)
      .filter(edge => edge.sourceNodeId === selected.nodeId && edge.sourcePortId === selected.portId).map(edge => edge.id);
    return { type: "batch", commands: [
      { type: "node.config.patch", nodeId: node.id, patch: { resultItems: [...remaining] } },
      ...(edgeIds.length ? [{ type: "edges.disconnect" as const, edgeIds }] : []),
    ] };
  }
  if (!item.edgeId || item.occurrence === undefined) return null;
  // Remove stale edge references on each edit, keeping the persisted list bounded.
  const edges = new Map(inputs.incomingEdges(node.id).map(edge => [edge.id, edge]));
  const retained = exclusions(node.config).filter(entry => edges.has(entry.edgeId));
  const siblings = entries.some(entry => entry.key !== item.key && entry.edgeId === item.edgeId);
  if (!siblings) {
    const remaining = retained.filter(entry => entry.edgeId !== item.edgeId);
    return { type: "batch", commands: [
      { type: "edge.disconnect", edgeId: item.edgeId },
      ...(exclusions(node.config).length ? [{ type: "node.config.patch" as const, nodeId: node.id, patch: { excludedOccurrences: remaining } }] : []),
    ] };
  }
  return { type: "node.config.patch", nodeId: node.id, patch: {
    excludedOccurrences: [...retained, { edgeId: item.edgeId, assetId: item.assetId, occurrence: item.occurrence }],
  } };
}

export function galleryClearCommand(inputs: SpaceInputResolver, nodeId: string): SpaceEditorCommand {
  return { type: "batch", commands: [
    { type: "edges.disconnect", edgeIds: inputs.incomingEdges(nodeId).map(edge => edge.id) },
    { type: "node.config.patch", nodeId, patch: { resultItems: [], excludedAssetIds: [], legacyExcludedEdgeIds: [], excludedOccurrences: [] } },
    { type: "output.clear", nodeId },
  ] };
}
