import { validateGraphStructure, type GraphStructureIssue } from "@/shared/generation-graph/graph-validation";

import type {
  GenerationGraphFlowEdge,
  ImageGenerationFlowNode,
} from "../model/flow-types";

type FlowConnectionLike = {
  source: string;
  target: string;
  sourceHandle?: string | null;
  targetHandle?: string | null;
};

export function connectionKind(connection: FlowConnectionLike) {
  if (connection.targetHandle === "primary") return "primary" as const;
  if (connection.targetHandle === "reference") return "reference" as const;
  return null;
}

export function validateFlowConnection(
  nodes: ImageGenerationFlowNode[],
  edges: GenerationGraphFlowEdge[],
  connection: FlowConnectionLike,
): { valid: boolean; kind: "primary" | "reference" | null; issues: GraphStructureIssue[] } {
  const kind = connectionKind(connection);
  if (!kind) {
    return {
      valid: false,
      kind,
      issues: [{ code: "EDGE_ENDPOINT_NOT_FOUND" }],
    };
  }

  const issues = validateGraphStructure({
    nodes,
    edges: [
      ...edges.map((edge) => ({
        id: edge.id,
        sourceNodeId: edge.source,
        targetNodeId: edge.target,
        kind: edge.data?.kind ?? "reference",
        sourceHandle: edge.sourceHandle,
        targetHandle: edge.targetHandle,
      })),
      {
        id: "__candidate__",
        sourceNodeId: connection.source,
        targetNodeId: connection.target,
        kind,
        sourceHandle: connection.sourceHandle,
        targetHandle: connection.targetHandle,
      },
    ],
  });

  return { valid: issues.length === 0, kind, issues };
}
