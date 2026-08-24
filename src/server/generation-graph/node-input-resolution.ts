import {
  NodeInputInvalidError,
  NodeInputSelectionRequiredError,
} from "./node-generation-errors";

export type NodeInputEdge = {
  id: string;
  kind: "primary" | "reference";
  createdAt: Date;
  sourceNodeId: string;
  sourceNode: {
    id: string;
    selectedOutputImageId: string | null;
    selectedOutputImage: {
      id: string;
      url: string;
      generation: {
        ownerEmail: string | null;
        graphNodeId: string | null;
        status: "pending" | "processing" | "completed" | "failed";
      };
    } | null;
  };
};

export type ResolvedNodeInput = {
  imageId: string;
  url: string;
  kind: "primary" | "reference";
  sourceNodeId: string;
  edgeId: string;
};

function compareInputEdges(left: NodeInputEdge, right: NodeInputEdge) {
  if (left.kind !== right.kind) return left.kind === "primary" ? -1 : 1;
  const createdAtDifference = left.createdAt.getTime() - right.createdAt.getTime();
  return createdAtDifference || left.id.localeCompare(right.id);
}

export function resolveNodeInputs(
  ownerEmail: string,
  incomingEdges: NodeInputEdge[],
): ResolvedNodeInput[] {
  const resolved: ResolvedNodeInput[] = [];
  const seenImageIds = new Set<string>();

  for (const edge of [...incomingEdges].sort(compareInputEdges)) {
    const details = { edgeId: edge.id, sourceNodeId: edge.sourceNodeId };
    if (!edge.sourceNode.selectedOutputImageId) {
      throw new NodeInputSelectionRequiredError(details);
    }

    const image = edge.sourceNode.selectedOutputImage;
    if (
      !image ||
      image.id !== edge.sourceNode.selectedOutputImageId ||
      image.generation.ownerEmail !== ownerEmail ||
      image.generation.graphNodeId !== edge.sourceNodeId ||
      image.generation.status !== "completed"
    ) {
      throw new NodeInputInvalidError(details);
    }

    if (seenImageIds.has(image.id)) continue;
    seenImageIds.add(image.id);
    resolved.push({
      imageId: image.id,
      url: image.url,
      kind: edge.kind,
      sourceNodeId: edge.sourceNodeId,
      edgeId: edge.id,
    });
  }

  return resolved;
}
