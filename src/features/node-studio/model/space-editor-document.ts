import {
  analyzeCanonicalGraphSupport,
  upgradeCanonicalGraphToV3,
  type CanonicalGraphSupport,
  type GraphDocumentV2,
  type GraphDocumentV3,
} from "@/shared/generation-graph/canonical-graph";

import type { GenerationGraphSnapshotDto } from "./graph-types";
import type {
  SpaceEditorDocument,
  SpaceEditorGraphIdentity,
} from "./space-editor-types";

/** Preserve saved JSON; registry defaults are for new authoring, not reads. */
export function canonicalGraphToEditorDocument(
  graph: GraphDocumentV2 | GraphDocumentV3,
): SpaceEditorDocument {
  const canonical = graph.schemaVersion === 2 ? upgradeCanonicalGraphToV3(graph) : graph;
  return {
    schemaVersion: 3,
    groups: canonical.groups,
    title: canonical.title,
    nodes: canonical.nodes.map((node) => ({
      id: node.id,
      kind: node.kind,
      position: node.position,
      configVersion: node.configVersion,
      config: node.config,
      selectedOutputAssetId: node.selectedOutputAssetId,
    })),
    edges: canonical.edges.map((edge) => ({ ...edge })),
  };
}

export function generationSnapshotToEditorDocument(
  graph: GenerationGraphSnapshotDto,
): SpaceEditorDocument {
  const content = {
    id: graph.id,
    version: graph.version,
    title: graph.title,
    nodes: graph.nodes,
    edges: graph.edges,
  };
  return canonicalGraphToEditorDocument(graph.schemaVersion === 2
    ? { ...content, schemaVersion: 2, minimumWriterVersion: 2 }
    : { ...content, schemaVersion: 3, minimumWriterVersion: 3, groups: graph.groups });
}

/**
 * Identity/version come from the server snapshot. selectionChanges remains
 * autosave request metadata and is not part of the canonical graph.
 */
export function editorDocumentToCanonicalGraph(
  document: SpaceEditorDocument,
  identity: SpaceEditorGraphIdentity,
): GraphDocumentV3 {
  return {
    schemaVersion: 3,
    minimumWriterVersion: 3,
    id: identity.id,
    version: identity.version,
    title: document.title,
    groups: document.groups,
    nodes: document.nodes.map((node) => ({
      id: node.id,
      kind: node.kind,
      position: node.position,
      configVersion: node.configVersion,
      config: node.config,
      selectedOutputAssetId: node.selectedOutputAssetId,
    })),
    edges: document.edges.map((edge) => ({ ...edge })),
  };
}

/** Validation reports support without replacing configs with parsed defaults. */
export function analyzeEditorDocumentSupport(
  document: SpaceEditorDocument,
): CanonicalGraphSupport {
  return analyzeCanonicalGraphSupport(document);
}
