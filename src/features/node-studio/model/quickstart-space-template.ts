import { graphDocumentV3Schema, validateCanonicalGraph } from "@/shared/generation-graph/canonical-graph";
import type { GenerationGraphEdgeDto, GenerationGraphNodeDto } from "./graph-types";
import type { SpacePresetWorkflow } from "./space-quickstart-types";

const presetKinds = new Set(["input.image", "input.prompt", "generate.image", "output.single"]);

/** Assign fresh graph IDs to a canonical preset without mutating the reusable template. */
export function createQuickstartSpaceDraft(workflow: SpacePresetWorkflow, createId: () => string = () => crypto.randomUUID()): {
  nodes: GenerationGraphNodeDto[];
  edges: GenerationGraphEdgeDto[];
  groups: [];
} {
  const document = graphDocumentV3Schema.parse({
    id: workflow.id, title: workflow.title, schemaVersion: workflow.schemaVersion, minimumWriterVersion: 3,
    version: 1, nodes: workflow.nodes, edges: workflow.edges, groups: workflow.groups,
  });
  if (document.groups.length || document.nodes.some(node => !presetKinds.has(node.kind)) || validateCanonicalGraph(document).length) {
    throw new Error("Unsupported Space template.");
  }
  const used = new Set<string>();
  const freshId = () => {
    const id = createId();
    if (!id || used.has(id)) throw new Error("Invalid template IDs.");
    used.add(id);
    return id;
  };
  const ids = new Map(document.nodes.map(node => [node.id, freshId()]));
  const nodes: GenerationGraphNodeDto[] = document.nodes.map(node => ({
    ...node, id: ids.get(node.id)!, position: { ...node.position },
    config: JSON.parse(JSON.stringify(node.config)), selectedOutputAssetId: null,
  }));
  const edges: GenerationGraphEdgeDto[] = document.edges.map(edge => ({
    ...edge, id: freshId(), sourceNodeId: ids.get(edge.sourceNodeId)!, targetNodeId: ids.get(edge.targetNodeId)!,
  }));
  return { nodes, edges, groups: [] };
}
