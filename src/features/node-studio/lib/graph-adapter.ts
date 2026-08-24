import type {
  GenerationGraphEdgeDto,
  GenerationGraphSnapshotDto,
  UpdateGenerationGraphDto,
} from "../model/graph-types";
import type {
  GenerationGraphFlowEdge,
  ImageGenerationFlowNode,
} from "../model/flow-types";

function edgeLabel(kind: GenerationGraphEdgeDto["kind"]) {
  return kind === "primary" ? "Primary" : "Reference";
}

export function graphSnapshotToFlow(graph: GenerationGraphSnapshotDto) {
  const nodes: ImageGenerationFlowNode[] = graph.nodes.map((node) => ({
    id: node.id,
    type: "imageGeneration",
    position: node.position,
    data: {
      configVersion: node.configVersion,
      config: node.config,
      selectedOutputImageId: node.selectedOutputImageId,
    },
  }));
  const edges: GenerationGraphFlowEdge[] = graph.edges.map((edge) => ({
    id: edge.id,
    source: edge.sourceNodeId,
    target: edge.targetNodeId,
    sourceHandle: edge.sourceHandle ?? undefined,
    targetHandle: edge.targetHandle ?? undefined,
    data: { kind: edge.kind },
    label: edgeLabel(edge.kind),
    ariaLabel: `${edgeLabel(edge.kind)} connection`,
    style:
      edge.kind === "primary"
        ? { stroke: "var(--primary)", strokeWidth: 2 }
        : { stroke: "var(--accent-purple)", strokeWidth: 2, strokeDasharray: "6 5" },
  }));
  return { nodes, edges };
}

export function flowToUpdateGraph(
  title: string,
  expectedVersion: number,
  nodes: ImageGenerationFlowNode[],
  edges: GenerationGraphFlowEdge[],
): UpdateGenerationGraphDto {
  return {
    title,
    expectedVersion,
    nodes: nodes.map((node) => ({
      id: node.id,
      type: "imageGeneration",
      position: node.position,
      configVersion: node.data.configVersion,
      config: node.data.config,
      selectedOutputImageId: node.data.selectedOutputImageId,
    })),
    edges: edges.map((edge) => ({
      id: edge.id,
      sourceNodeId: edge.source,
      targetNodeId: edge.target,
      kind: edge.data?.kind ?? "reference",
      sourceHandle: edge.sourceHandle ?? null,
      targetHandle: edge.targetHandle ?? null,
    })),
  };
}

export function createImageGenerationFlowNode(
  id: string,
  position: { x: number; y: number },
): ImageGenerationFlowNode {
  return {
    id,
    type: "imageGeneration",
    position,
    data: {
      configVersion: 1,
      config: { prompt: "", modelKey: null, parameters: {} },
      selectedOutputImageId: null,
    },
  };
}
