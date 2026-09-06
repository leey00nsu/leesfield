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

    const targetPortId = edge.data?.targetPortId ?? edge.targetHandle;
    const kind = targetPortId === "primary"
      ? "primary"
      : targetPortId === "references" || targetPortId === "reference"
        ? "reference"
        : null;
    if (!kind) continue;

    const kindReadiness = result[kind];
    kindReadiness.connectedCount += 1;
    result.connectedCount += 1;

    const selectedOutputAssetId = nodesById.get(edge.source)?.data.selectedOutputAssetId;
    if (selectedOutputAssetId) {
      kindReadiness.readyCount += 1;
      result.readyCount += 1;
      distinctSelectedOutputs.add(selectedOutputAssetId);
    } else {
      kindReadiness.missingCount += 1;
      result.missingCount += 1;
    }
  }

  result.resolvedCount = distinctSelectedOutputs.size;
  return result;
}
