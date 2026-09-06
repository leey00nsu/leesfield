import { z } from "zod";

import {
  findPortDefinition,
  type PortValueType,
  validateNodeConfig,
} from "./node-registry";

const canonicalIdSchema = z
  .string()
  .trim()
  .min(1)
  .max(128)
  .regex(/^[A-Za-z0-9_-]+$/);

const positionSchema = z
  .object({
    x: z.number().finite(),
    y: z.number().finite(),
  })
  .strict();

export const canonicalJsonValueSchema = z.json();
export type CanonicalJsonValue = z.infer<typeof canonicalJsonValueSchema>;

export const canonicalNodeSchema = z
  .object({
    id: canonicalIdSchema,
    kind: z.string().trim().min(1).max(128),
    position: positionSchema,
    configVersion: z.number().int().positive(),
    config: canonicalJsonValueSchema,
    selectedOutputAssetId: canonicalIdSchema.nullable(),
  })
  .strict();

export const canonicalEdgeSchema = z
  .object({
    id: canonicalIdSchema,
    sourceNodeId: canonicalIdSchema,
    sourcePortId: canonicalIdSchema,
    targetNodeId: canonicalIdSchema,
    targetPortId: canonicalIdSchema,
    sortOrder: z.number().int().nonnegative(),
    hasPause: z.boolean().optional(),
  })
  .strict();

export const graphDocumentV2Schema = z
  .object({
    schemaVersion: z.literal(2),
    minimumWriterVersion: z.literal(2),
    id: canonicalIdSchema,
    version: z.number().int().positive(),
    title: z.string().trim().min(1).max(120),
    nodes: z.array(canonicalNodeSchema).max(500),
    edges: z.array(canonicalEdgeSchema).max(2_000),
  })
  .strict();

export type CanonicalNode = z.infer<typeof canonicalNodeSchema>;
export type CanonicalEdge = z.infer<typeof canonicalEdgeSchema>;
export type GraphDocumentV2 = z.infer<typeof graphDocumentV2Schema>;

export const canonicalGroupSchema = z.object({
  id: canonicalIdSchema,
  title: z.string().trim().min(1).max(120),
  color: z.enum(["neutral", "blue", "green", "purple", "orange", "red"]),
  bounds: z.object({
    x: z.number().finite(),
    y: z.number().finite(),
    width: z.number().finite().positive(),
    height: z.number().finite().positive(),
  }).strict(),
  locked: z.boolean(),
  memberNodeIds: z.array(canonicalIdSchema).max(500),
}).strict();

export type CanonicalGroup = z.infer<typeof canonicalGroupSchema>;

/** Graph-owned membership: no nesting, dangling IDs, or multiple owners. */
export const graphDocumentV3Schema = graphDocumentV2Schema.extend({
  schemaVersion: z.literal(3),
  minimumWriterVersion: z.literal(3),
  groups: z.array(canonicalGroupSchema).max(500),
}).superRefine((graph, ctx) => {
  const nodeIds = new Set(graph.nodes.map((node) => node.id));
  const groupIds = new Set<string>();
  const members = new Set<string>();
  graph.groups.forEach((group, index) => {
    if (groupIds.has(group.id)) {
      ctx.addIssue({ code: "custom", path: ["groups", index, "id"], message: "DUPLICATE_GROUP_ID" });
    }
    groupIds.add(group.id);
    group.memberNodeIds.forEach((id, memberIndex) => {
      const path = ["groups", index, "memberNodeIds", memberIndex];
      if (!nodeIds.has(id)) ctx.addIssue({ code: "custom", path, message: "GROUP_MEMBER_NOT_FOUND" });
      if (members.has(id)) ctx.addIssue({ code: "custom", path, message: "GROUP_MEMBER_DUPLICATE" });
      members.add(id);
    });
  });
  graph.nodes.forEach((node, nodeIndex) => {
    if (node.kind !== "edit.image.splitGrid" || node.configVersion !== 1) return;
    const config = jsonObject(node.config);
    const materialization = config?.materialization ? jsonObject(config.materialization) : null;
    if (!Array.isArray(materialization?.cells)) return;
    materialization.cells.forEach((value, cellIndex) => {
      const cell = jsonObject(value);
      if (typeof cell?.groupId === "string" && !groupIds.has(cell.groupId)) {
        ctx.addIssue({ code: "custom", path: ["nodes", nodeIndex, "config", "materialization", "cells", cellIndex, "groupId"],
          message: "SPLIT_GROUP_NOT_FOUND" });
      }
    });
  });
});

export type GraphDocumentV3 = z.infer<typeof graphDocumentV3Schema>;

const legacySplitGroupSchema = z.object({
  id: canonicalIdSchema,
  name: canonicalGroupSchema.shape.title,
  color: canonicalGroupSchema.shape.color,
  position: positionSchema,
  size: canonicalGroupSchema.shape.bounds.pick({ width: true, height: true }),
  locked: z.boolean().optional(),
}).strict();

const legacySplitMaterializationSchema = z.object({
  rows: z.number().int().positive(),
  cols: z.number().int().positive(),
  cells: z.array(z.object({
    baseNodeId: canonicalIdSchema,
    nodeIds: z.array(canonicalIdSchema).max(500),
    group: legacySplitGroupSchema.nullable(),
  }).strict()).max(500),
}).strict();

function jsonObject(value: CanonicalJsonValue): Record<string, CanonicalJsonValue> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value : null;
}

/** Additive read conversion only. The caller persists it atomically with the v3 writer cutover. */
export function upgradeCanonicalGraphToV3(value: unknown): GraphDocumentV3 {
  if (typeof value === "object" && value !== null && "schemaVersion" in value && value.schemaVersion === 3) {
    return graphDocumentV3Schema.parse(value);
  }
  const graph = graphDocumentV2Schema.parse(value);
  const nodeIds = new Set(graph.nodes.map((node) => node.id));
  const groups: CanonicalGroup[] = [];
  const nodes = graph.nodes.map((node): CanonicalNode => {
    if (node.kind !== "edit.image.splitGrid" || node.configVersion !== 1) return node;
    const config = jsonObject(node.config);
    if (!config || config.materialization === undefined) return node;
    // Reject malformed/ambiguous legacy ownership instead of silently losing frames.
    const materialization = legacySplitMaterializationSchema.parse(config.materialization);
    const cells = materialization.cells.map(({ group, ...cell }) => {
      if (group) groups.push({
        id: group.id, title: group.name, color: group.color, locked: group.locked ?? false,
        bounds: { ...group.position, ...group.size },
        // Deleted nodes can remain in old Split provenance, but cannot own a live group.
        memberNodeIds: cell.nodeIds.filter((id) => nodeIds.has(id)),
      });
      return { ...cell, groupId: group?.id ?? null };
    });
    return { ...node, config: { ...config, materialization: { ...materialization, cells } } };
  });
  return graphDocumentV3Schema.parse({ ...graph, schemaVersion: 3, minimumWriterVersion: 3, nodes, groups });
}

/** Match upstream pruning: only deletion that empties a group removes it. */
export function pruneGroupsAfterNodeDeletion(
  groups: readonly CanonicalGroup[],
  removedNodeIds: ReadonlySet<string>,
): CanonicalGroup[] {
  return groups.flatMap((group) => {
    const members = group.memberNodeIds.filter((id) => !removedNodeIds.has(id));
    if (members.length === group.memberNodeIds.length) return [group];
    return members.length ? [{ ...group, memberNodeIds: members }] : [];
  });
}

export type CanonicalGraphIssueCode =
  | "DUPLICATE_NODE_ID"
  | "DUPLICATE_EDGE_ID"
  | "EDGE_ENDPOINT_NOT_FOUND"
  | "SELF_EDGE"
  | "GRAPH_CYCLE"
  | "UNKNOWN_NODE_KIND"
  | "UNKNOWN_CONFIG_VERSION"
  | "INVALID_NODE_CONFIG"
  | "SOURCE_PORT_NOT_FOUND"
  | "TARGET_PORT_NOT_FOUND"
  | "PORT_VALUE_TYPE_MISMATCH"
  | "PORT_CARDINALITY_EXCEEDED"
  | "PORT_ORDER_DUPLICATE"
  | "PORT_ORDER_INVALID"
  | "MIXED_MEDIA_NOT_ALLOWED";

export type CanonicalGraphIssue = {
  code: CanonicalGraphIssueCode;
  nodeId?: string;
  edgeId?: string;
  portId?: string;
};

export type CanonicalGraphSupport = {
  writable: boolean;
  readOnlyReason: CanonicalGraphIssueCode | null;
  issues: CanonicalGraphIssue[];
};

function collectDuplicateIds(
  ids: string[],
  code: "DUPLICATE_NODE_ID" | "DUPLICATE_EDGE_ID",
): CanonicalGraphIssue[] {
  const seen = new Set<string>();
  const reported = new Set<string>();
  const issues: CanonicalGraphIssue[] = [];
  for (const id of ids) {
    if (seen.has(id) && !reported.has(id)) {
      issues.push(code === "DUPLICATE_NODE_ID" ? { code, nodeId: id } : { code, edgeId: id });
      reported.add(id);
    }
    seen.add(id);
  }
  return issues;
}

function containsCycle(nodeIds: Set<string>, edges: CanonicalEdge[]) {
  const indegree = new Map([...nodeIds].map((id) => [id, 0]));
  const adjacency = new Map([...nodeIds].map((id) => [id, [] as string[]]));
  for (const edge of edges) {
    if (!nodeIds.has(edge.sourceNodeId) || !nodeIds.has(edge.targetNodeId)) continue;
    adjacency.get(edge.sourceNodeId)?.push(edge.targetNodeId);
    indegree.set(edge.targetNodeId, (indegree.get(edge.targetNodeId) ?? 0) + 1);
  }
  const queue = [...indegree].filter(([, count]) => count === 0).map(([id]) => id);
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

function compatibleValueTypes(source: PortValueType, target: PortValueType) {
  return source === target || (target === "media" && source !== "text" && source !== "media");
}

export function validateCanonicalGraph(
  graph: Pick<GraphDocumentV2, "nodes" | "edges">,
): CanonicalGraphIssue[] {
  const issues = [
    ...collectDuplicateIds(
      graph.nodes.map((node) => node.id),
      "DUPLICATE_NODE_ID",
    ),
    ...collectDuplicateIds(
      graph.edges.map((edge) => edge.id),
      "DUPLICATE_EDGE_ID",
    ),
  ];
  const nodes = new Map(graph.nodes.map((node) => [node.id, node]));
  const targetConnections = new Map<string, CanonicalEdge[]>();
  const homogeneousTypes = new Map<string, PortValueType>();

  for (const node of graph.nodes) {
    const validation = validateNodeConfig(node.kind, node.configVersion, node.config);
    if (!validation.supported) issues.push({ code: validation.reason, nodeId: node.id });
  }

  for (const edge of graph.edges) {
    const source = nodes.get(edge.sourceNodeId);
    const target = nodes.get(edge.targetNodeId);
    if (!source || !target) {
      issues.push({ code: "EDGE_ENDPOINT_NOT_FOUND", edgeId: edge.id });
      continue;
    }
    if (source.id === target.id) issues.push({ code: "SELF_EDGE", edgeId: edge.id, nodeId: source.id });

    const sourcePort = findPortDefinition(source.kind, edge.sourcePortId, "output");
    const targetPort = findPortDefinition(target.kind, edge.targetPortId, "input");
    if (!sourcePort) {
      issues.push({ code: "SOURCE_PORT_NOT_FOUND", edgeId: edge.id, portId: edge.sourcePortId });
    }
    if (!targetPort) {
      issues.push({ code: "TARGET_PORT_NOT_FOUND", edgeId: edge.id, portId: edge.targetPortId });
    }
    if (!sourcePort || !targetPort) continue;
    if (!compatibleValueTypes(sourcePort.valueType, targetPort.valueType)) {
      issues.push({ code: "PORT_VALUE_TYPE_MISMATCH", edgeId: edge.id });
      continue;
    }

    const targetKey = `${target.id}:${targetPort.id}`;
    const connections = targetConnections.get(targetKey) ?? [];
    connections.push(edge);
    targetConnections.set(targetKey, connections);
    if (targetPort.maxConnections !== null && connections.length > targetPort.maxConnections) {
      issues.push({ code: "PORT_CARDINALITY_EXCEEDED", edgeId: edge.id, portId: targetPort.id });
    }
    if (!targetPort.ordered && edge.sortOrder !== 0) {
      issues.push({ code: "PORT_ORDER_INVALID", edgeId: edge.id, portId: targetPort.id });
    }
    if (targetPort.ordered && connections.some((connection) => connection !== edge && connection.sortOrder === edge.sortOrder)) {
      issues.push({ code: "PORT_ORDER_DUPLICATE", edgeId: edge.id, portId: targetPort.id });
    }
    if (targetPort.homogeneous) {
      const firstType = homogeneousTypes.get(targetKey);
      if (firstType && firstType !== sourcePort.valueType) {
        issues.push({ code: "MIXED_MEDIA_NOT_ALLOWED", edgeId: edge.id, portId: targetPort.id });
      } else {
        homogeneousTypes.set(targetKey, sourcePort.valueType);
      }
    }
  }

  if (containsCycle(new Set(nodes.keys()), graph.edges)) issues.push({ code: "GRAPH_CYCLE" });
  return issues;
}

export function analyzeCanonicalGraphSupport(
  graph: Pick<GraphDocumentV2, "nodes" | "edges">,
): CanonicalGraphSupport {
  const issues = validateCanonicalGraph(graph);
  return {
    writable: issues.length === 0,
    readOnlyReason: issues[0]?.code ?? null,
    issues,
  };
}
