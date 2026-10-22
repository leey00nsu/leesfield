import type { CanonicalNode } from "@/shared/generation-graph/canonical-graph";
import type { SpaceInputResolver } from "./space-editor-inputs";
import type { SpaceEditorDocument } from "./space-editor-types";
import { galleryEntries, isGalleryItem } from "./space-gallery-items";

function record(value: unknown): Record<string, unknown> { return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}; }

export function spaceOutputSource(node: CanonicalNode, inputs: SpaceInputResolver) {
  const configured = record(node.config).mediaType;
  const types = configured === "image" || configured === "video" || configured === "audio" ? [configured] : ["audio", "video", "image"] as const;
  for (const type of types) {
    const assetId = inputs.inputAssetId(node.id, type);
    if (assetId) return { assetId, type };
  }
  return null;
}

/** The wire supplying the visible item, excluding paused and empty sources. */
export function spaceOutputConnection(node: CanonicalNode, inputs: SpaceInputResolver) {
  const source = spaceOutputSource(node, inputs);
  if (!source) return null;
  const edge = inputs.incomingEdges(node.id, source.type).find(candidate => inputs.edgeAssetIds(candidate)[0] === source.assetId);
  return edge ? { ...source, edgeId: edge.id } : null;
}

/** Visible saved media in graph/Gallery order. Duplicate occurrences stay independent. */
export function selectedSpaceMediaAssetIds(document: SpaceEditorDocument, inputs: SpaceInputResolver, nodeIds: readonly string[]) {
  const selected = new Set(nodeIds);
  return document.nodes.flatMap(node => {
    if (!selected.has(node.id)) return [];
    if (node.kind === "input.image" || node.kind === "input.audio" || node.kind === "input.video")
      return inputs.sourceAssetIds(node.id, node.kind.slice(6)).slice(0, 1);
    if (node.kind === "generate.image" || node.kind === "generate.audio" || node.kind === "generate.video" || node.kind === "edit.image.annotation")
      return node.selectedOutputAssetId ? [node.selectedOutputAssetId] : [];
    if (node.kind === "output.gallery" && node.configVersion === 1)
      return galleryEntries(inputs, node.id, node.config).filter(isGalleryItem).map(item => item.assetId);
    if (node.kind === "output.single") {
      const source = spaceOutputSource(node, inputs);
      return source ? [source.assetId] : [];
    }
    return [];
  });
}
