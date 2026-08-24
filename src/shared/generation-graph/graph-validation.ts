export type GraphStructureNode = { id: string };

export type GraphStructureEdge = {
  id: string;
  sourceNodeId: string;
  targetNodeId: string;
  kind: "primary" | "reference";
  sourceHandle?: string | null;
  targetHandle?: string | null;
};

export type GraphStructureIssueCode =
  | "DUPLICATE_NODE_ID"
  | "DUPLICATE_EDGE_ID"
  | "EDGE_ENDPOINT_NOT_FOUND"
  | "SELF_EDGE"
  | "DUPLICATE_EDGE"
  | "PRIMARY_INPUT_LIMIT_EXCEEDED"
  | "GRAPH_CYCLE";

export type GraphStructureIssue = {
  code: GraphStructureIssueCode;
  edgeId?: string;
  nodeId?: string;
};

type GraphStructure = {
  nodes: GraphStructureNode[];
  edges: GraphStructureEdge[];
};

function collectDuplicateIds(
  values: string[],
  code: "DUPLICATE_NODE_ID" | "DUPLICATE_EDGE_ID",
): GraphStructureIssue[] {
  const seen = new Set<string>();
  const reported = new Set<string>();
  const issues: GraphStructureIssue[] = [];

  for (const value of values) {
    if (seen.has(value) && !reported.has(value)) {
      issues.push(code === "DUPLICATE_NODE_ID" ? { code, nodeId: value } : { code, edgeId: value });
      reported.add(value);
    }
    seen.add(value);
  }

  return issues;
}

function edgeIdentity(edge: GraphStructureEdge) {
  return JSON.stringify([
    edge.sourceNodeId,
    edge.targetNodeId,
    edge.kind,
    edge.sourceHandle ?? null,
    edge.targetHandle ?? null,
  ]);
}

function containsCycle(nodeIds: Set<string>, edges: GraphStructureEdge[]) {
  const indegree = new Map([...nodeIds].map((id) => [id, 0]));
  const adjacency = new Map([...nodeIds].map((id) => [id, [] as string[]]));

  for (const edge of edges) {
    if (!nodeIds.has(edge.sourceNodeId) || !nodeIds.has(edge.targetNodeId)) continue;
    adjacency.get(edge.sourceNodeId)?.push(edge.targetNodeId);
    indegree.set(edge.targetNodeId, (indegree.get(edge.targetNodeId) ?? 0) + 1);
  }

  const queue = [...indegree.entries()].filter(([, value]) => value === 0).map(([id]) => id);
  let visited = 0;

  for (let index = 0; index < queue.length; index += 1) {
    const nodeId = queue[index];
    visited += 1;
    for (const targetId of adjacency.get(nodeId) ?? []) {
      const next = (indegree.get(targetId) ?? 0) - 1;
      indegree.set(targetId, next);
      if (next === 0) queue.push(targetId);
    }
  }

  return visited !== nodeIds.size;
}

export function validateGraphStructure({ nodes, edges }: GraphStructure): GraphStructureIssue[] {
  const issues = [
    ...collectDuplicateIds(
      nodes.map((node) => node.id),
      "DUPLICATE_NODE_ID",
    ),
    ...collectDuplicateIds(
      edges.map((edge) => edge.id),
      "DUPLICATE_EDGE_ID",
    ),
  ];
  const nodeIds = new Set(nodes.map((node) => node.id));
  const edgeIdentities = new Set<string>();
  const primaryTargets = new Map<string, number>();

  for (const edge of edges) {
    if (!nodeIds.has(edge.sourceNodeId) || !nodeIds.has(edge.targetNodeId)) {
      issues.push({ code: "EDGE_ENDPOINT_NOT_FOUND", edgeId: edge.id });
    }
    if (edge.sourceNodeId === edge.targetNodeId) {
      issues.push({ code: "SELF_EDGE", edgeId: edge.id, nodeId: edge.sourceNodeId });
    }

    const identity = edgeIdentity(edge);
    if (edgeIdentities.has(identity)) {
      issues.push({ code: "DUPLICATE_EDGE", edgeId: edge.id });
    }
    edgeIdentities.add(identity);

    if (edge.kind === "primary") {
      const count = (primaryTargets.get(edge.targetNodeId) ?? 0) + 1;
      primaryTargets.set(edge.targetNodeId, count);
      if (count === 2) {
        issues.push({
          code: "PRIMARY_INPUT_LIMIT_EXCEEDED",
          edgeId: edge.id,
          nodeId: edge.targetNodeId,
        });
      }
    }
  }

  if (containsCycle(nodeIds, edges)) issues.push({ code: "GRAPH_CYCLE" });
  return issues;
}
