import type {
  GenerationGraphFlowEdge,
  ImageGenerationFlowNode,
} from "./flow-types";

export type NodeInputKindReadiness = {
  connectedCount: number;
  readyCount: number;
  missingCount: number;
};

export type ImageNodeInputReadiness = {
  primary: NodeInputKindReadiness;
  reference: NodeInputKindReadiness;
  connectedCount: number;
  readyCount: number;
  missingCount: number;
  resolvedCount: number;
};

function emptyKindReadiness(): NodeInputKindReadiness {
  return { connectedCount: 0, readyCount: 0, missingCount: 0 };
}

export function emptyImageNodeInputReadiness(): ImageNodeInputReadiness {
  return {
    primary: emptyKindReadiness(),
    reference: emptyKindReadiness(),
    connectedCount: 0,
    readyCount: 0,
    missingCount: 0,
    resolvedCount: 0,
  };
}

export function resolveImageNodeInputReadiness(
  targetNodeId: string,
  nodes: readonly ImageGenerationFlowNode[],
  edges: readonly GenerationGraphFlowEdge[],
): ImageNodeInputReadiness {
  const result = emptyImageNodeInputReadiness();
  const nodesById = new Map(nodes.map((node) => [node.id, node]));
  const distinctSelectedOutputs = new Set<string>();

  for (const edge of edges) {
    if (edge.target !== targetNodeId) continue;

    const kind = edge.data?.kind;
    if (kind !== "primary" && kind !== "reference") continue;

    const kindReadiness = result[kind];
    kindReadiness.connectedCount += 1;
    result.connectedCount += 1;

    const selectedOutputImageId = nodesById.get(edge.source)?.data
      .selectedOutputImageId;
    if (selectedOutputImageId) {
      kindReadiness.readyCount += 1;
      result.readyCount += 1;
      distinctSelectedOutputs.add(selectedOutputImageId);
    } else {
      kindReadiness.missingCount += 1;
      result.missingCount += 1;
    }
  }

  result.resolvedCount = distinctSelectedOutputs.size;
  return result;
}
