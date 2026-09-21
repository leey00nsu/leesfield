import { Prisma } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { copySpaceConfig } from "./copy-space-config";

import { prisma } from "@/server/db/prisma";
import {
  analyzeCanonicalGraphSupport,
  upgradeCanonicalGraphToV3,
  type CanonicalGroup,
  type CanonicalEdge,
  type CanonicalNode,
} from "@/shared/generation-graph/canonical-graph";
import { findNodeDefinition } from "@/shared/generation-graph/node-registry";

import { updateGenerationGraphSchema, type UpdateGenerationGraphInput } from "./generation-graph-contract";
import {
  GenerationGraphActiveExecutionError,
  GenerationGraphNotFoundError,
  GenerationGraphReferenceError,
  GenerationGraphVersionConflictError,
  GenerationGraphInputError,
} from "./generation-graph-errors";

const graphInclude = {
  nodes: { orderBy: { createdAt: "asc" as const } },
  edges: { orderBy: { createdAt: "asc" as const } },
} satisfies Prisma.GenerationGraphInclude;

type GraphRecord = Prisma.GenerationGraphGetPayload<{ include: typeof graphInclude }>;

export type GenerationGraphSummary = {
  id: string;
  title: string;
  version: number;
  schemaVersion: number;
  minimumWriterVersion: number;
  createdAt: Date;
  updatedAt: Date;
};

export type GenerationGraphSnapshot = GenerationGraphSummary & {
  groups: CanonicalGroup[];
  nodes: Array<{
    id: string;
    kind: string;
    position: { x: number; y: number };
    configVersion: number;
    config: Prisma.JsonValue;
    selectedOutputAssetId: string | null;
  }>;
  edges: Array<{
    id: string;
    sourceNodeId: string;
    targetNodeId: string;
    sourcePortId: string;
    targetPortId: string;
    sortOrder: number;
    hasPause?: boolean;
  }>;
  writable: boolean;
  readOnlyReason: string | null;
};

function mapGraph(record: GraphRecord): GenerationGraphSnapshot {
  const canonicalNodes: CanonicalNode[] = record.nodes.map((node) => ({
    id: node.id,
    kind: node.kind,
    position: { x: node.x, y: node.y },
    configVersion: node.configVersion,
    config: node.config as CanonicalNode["config"],
    selectedOutputAssetId: node.selectedOutputAssetId,
  }));
  const canonicalEdges: CanonicalEdge[] = record.edges.map((edge) => ({
    id: edge.id,
    sourceNodeId: edge.sourceNodeId,
    sourcePortId: edge.sourcePortId,
    targetNodeId: edge.targetNodeId,
    targetPortId: edge.targetPortId,
    sortOrder: edge.sortOrder,
    ...(edge.hasPause ? { hasPause: true } : {}),
  }));
  const document = upgradeCanonicalGraphToV3({
    schemaVersion: record.schemaVersion, minimumWriterVersion: record.minimumWriterVersion,
    id: record.id, title: record.title, version: record.version,
    nodes: canonicalNodes, edges: canonicalEdges,
    ...(record.schemaVersion === 3 ? { groups: record.groups } : {}),
  });
  const support = analyzeCanonicalGraphSupport(document);
  return {
    id: record.id,
    title: record.title,
    version: record.version,
    schemaVersion: 3,
    minimumWriterVersion: 3,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    nodes: document.nodes,
    edges: document.edges,
    groups: document.groups,
    writable: support.writable,
    readOnlyReason: support.readOnlyReason,
  };
}

async function create(ownerEmail: string, title: string): Promise<GenerationGraphSnapshot> {
  const record = await prisma.generationGraph.create({
    data: { ownerEmail, title, schemaVersion: 3, minimumWriterVersion: 3, groups: [] },
    include: graphInclude,
  });
  return mapGraph(record);
}

async function list(ownerEmail: string): Promise<GenerationGraphSummary[]> {
  return prisma.generationGraph.findMany({
    where: { ownerEmail },
    select: {
      id: true,
      title: true,
      version: true,
      schemaVersion: true,
      minimumWriterVersion: true,
      createdAt: true,
      updatedAt: true,
    },
    orderBy: { updatedAt: "desc" },
  });
}

async function get(ownerEmail: string, graphId: string): Promise<GenerationGraphSnapshot> {
  const record = await prisma.generationGraph.findFirst({
    where: { id: graphId, ownerEmail },
    include: graphInclude,
  });
  if (!record) throw new GenerationGraphNotFoundError();
  return mapGraph(record);
}

async function assertIdsBelongToGraph(
  tx: Prisma.TransactionClient,
  graphId: string,
  existing: {
    nodes?: readonly { id: string }[];
    edges?: readonly { id: string }[];
  },
  input: UpdateGenerationGraphInput,
) {
  const existingNodeIds = new Set((existing.nodes ?? []).map((node) => node.id));
  const existingEdgeIds = new Set((existing.edges ?? []).map((edge) => edge.id));
  const nodeIds = input.nodes
    .map((node) => node.id)
    .filter((id) => !existingNodeIds.has(id));
  const edgeIds = input.edges
    .map((edge) => edge.id)
    .filter((id) => !existingEdgeIds.has(id));
  if (nodeIds.length === 0 && edgeIds.length === 0) return;

  const [nodes, edges] = await Promise.all([
    tx.generationGraphNode.findMany({
      where: { id: { in: nodeIds } },
      select: { graphId: true },
    }),
    tx.generationGraphEdge.findMany({
      where: { id: { in: edgeIds } },
      select: { graphId: true },
    }),
  ]);
  if ([...nodes, ...edges].some((record) => record.graphId !== graphId)) {
    throw new GenerationGraphReferenceError("GRAPH_ID_CONFLICT");
  }
}

function sameJson(left: unknown, right: unknown): boolean {
  if (left === right) return true;
  if (Array.isArray(left) || Array.isArray(right)) {
    return Array.isArray(left) && Array.isArray(right)
      && left.length === right.length
      && left.every((value, index) => sameJson(value, right[index]));
  }
  if (left && typeof left === "object" && right && typeof right === "object") {
    const leftRecord = left as Record<string, unknown>;
    const rightRecord = right as Record<string, unknown>;
    const leftKeys = Object.keys(leftRecord).sort();
    const rightKeys = Object.keys(rightRecord).sort();
    return leftKeys.length === rightKeys.length
      && leftKeys.every((key, index) => key === rightKeys[index] && sameJson(leftRecord[key], rightRecord[key]));
  }
  return false;
}

function nodeBaseChanged(
  existing: {
    kind: string;
    x: number;
    y: number;
    configVersion: number;
    config: Prisma.JsonValue;
  },
  input: UpdateGenerationGraphInput["nodes"][number],
) {
  return existing.kind !== input.kind
    || existing.x !== input.position.x
    || existing.y !== input.position.y
    || existing.configVersion !== input.configVersion
    || !sameJson(existing.config, input.config);
}

function edgeChanged(
  existing: {
    sourceNodeId: string;
    targetNodeId: string;
    sourcePortId: string;
    targetPortId: string;
    sortOrder: number;
    hasPause: boolean;
  },
  input: UpdateGenerationGraphInput["edges"][number],
) {
  return existing.sourceNodeId !== input.sourceNodeId
    || existing.targetNodeId !== input.targetNodeId
    || existing.sourcePortId !== input.sourcePortId
    || existing.targetPortId !== input.targetPortId
    || existing.sortOrder !== input.sortOrder
    || existing.hasPause !== (input.hasPause ?? false);
}

async function updateNodesInBatch(
  tx: Prisma.TransactionClient,
  graphId: string,
  nodes: readonly UpdateGenerationGraphInput["nodes"][number][],
) {
  if (nodes.length === 0) return;
  const values = nodes.map((node) => Prisma.sql`(
    ${node.id}::text,
    ${node.kind}::text,
    ${node.position.x}::double precision,
    ${node.position.y}::double precision,
    ${node.configVersion}::integer,
    ${JSON.stringify(node.config)}::jsonb
  )`);
  const updated = await tx.$executeRaw(Prisma.sql`
    UPDATE "GenerationGraphNode" AS node
    SET "kind" = patch."kind",
        "x" = patch."x",
        "y" = patch."y",
        "configVersion" = patch."configVersion",
        "config" = patch."config",
        "updatedAt" = CURRENT_TIMESTAMP
    FROM (VALUES ${Prisma.join(values)}) AS patch("id", "kind", "x", "y", "configVersion", "config")
    WHERE node."id" = patch."id" AND node."graphId" = ${graphId}
  `);
  if (updated !== nodes.length) throw new GenerationGraphVersionConflictError();
}

async function updateNodeSelectionsInBatch(
  tx: Prisma.TransactionClient,
  graphId: string,
  nodes: readonly UpdateGenerationGraphInput["nodes"][number][],
) {
  if (nodes.length === 0) return;
  const values = nodes.map((node) => Prisma.sql`(
    ${node.id}::text,
    ${node.selectedOutputAssetId}::text
  )`);
  const updated = await tx.$executeRaw(Prisma.sql`
    UPDATE "GenerationGraphNode" AS node
    SET "selectedOutputAssetId" = patch."selectedOutputAssetId",
        "updatedAt" = CURRENT_TIMESTAMP
    FROM (VALUES ${Prisma.join(values)}) AS patch("id", "selectedOutputAssetId")
    WHERE node."id" = patch."id" AND node."graphId" = ${graphId}
  `);
  if (updated !== nodes.length) throw new GenerationGraphVersionConflictError();
}

async function updateEdgesInBatch(
  tx: Prisma.TransactionClient,
  graphId: string,
  edges: readonly UpdateGenerationGraphInput["edges"][number][],
) {
  if (edges.length === 0) return;
  const values = edges.map((edge) => Prisma.sql`(
    ${edge.id}::text,
    ${edge.sourceNodeId}::text,
    ${edge.targetNodeId}::text,
    ${edge.sourcePortId}::text,
    ${edge.targetPortId}::text,
    ${edge.sortOrder}::integer,
    ${(edge.hasPause ?? false)}::boolean
  )`);
  const updated = await tx.$executeRaw(Prisma.sql`
    UPDATE "GenerationGraphEdge" AS edge
    SET "sourceNodeId" = patch."sourceNodeId",
        "targetNodeId" = patch."targetNodeId",
        "sourcePortId" = patch."sourcePortId",
        "targetPortId" = patch."targetPortId",
        "sortOrder" = patch."sortOrder",
        "hasPause" = patch."hasPause",
        "updatedAt" = CURRENT_TIMESTAMP
    FROM (VALUES ${Prisma.join(values)}) AS patch("id", "sourceNodeId", "targetNodeId", "sourcePortId", "targetPortId", "sortOrder", "hasPause")
    WHERE edge."id" = patch."id" AND edge."graphId" = ${graphId}
  `);
  if (updated !== edges.length) throw new GenerationGraphVersionConflictError();
}

async function assertCanonicalAssets(
  tx: Prisma.TransactionClient,
  ownerEmail: string,
  input: UpdateGenerationGraphInput,
) {
  const outputSelections = input.nodes.flatMap((node) =>
    node.selectedOutputAssetId
      ? [{ nodeId: node.id, nodeKind: node.kind, assetId: node.selectedOutputAssetId }]
      : [],
  );
  const inputSelections = input.nodes.flatMap((node) => {
    if (!node.kind.startsWith("input.")) return [];
    const assetId = (node.config as Record<string, unknown>).assetId;
    if (typeof assetId !== "string") return [];
    const type = node.kind.slice("input.".length);
    return type === "image" || type === "audio" || type === "video"
      ? [{ assetId, type }]
      : [];
  });
  const ids = Array.from(
    new Set([
      ...outputSelections.map((selection) => selection.assetId),
      ...inputSelections.map((selection) => selection.assetId),
    ]),
  );
  if (ids.length === 0) return;

  const assets = await tx.mediaAsset.findMany({
    where: { id: { in: ids } },
    select: {
      id: true,
      ownerEmail: true,
      type: true,
      status: true,
      storageUrl: true,
      legacyUrl: true,
      graphNodeOutputs: { select: { graphNodeId: true } },
      imageGenerationImage: {
        select: { generation: { select: { graphNodeId: true } } },
      },
      videoGenerationVideo: {
        select: { generation: { select: { graphNodeId: true } } },
      },
      audioGenerationAudio: {
        select: { generation: { select: { graphNodeId: true } } },
      },
    },
  });
  const byId = new Map(assets.map((asset) => [asset.id, asset]));
  const invalidInput = inputSelections.some((selection) => {
    const asset = byId.get(selection.assetId);
    return (
      !asset ||
      asset.ownerEmail !== ownerEmail ||
      (asset.status !== "completed" && !(asset.status === "failed" && asset.storageUrl === null && asset.legacyUrl === null)) ||
      asset.type !== selection.type
    );
  });
  const invalidOutput = outputSelections.some((selection) => {
    const asset = byId.get(selection.assetId);
    const expectedType = findNodeDefinition(selection.nodeKind)?.ports.find(
      (port) => port.direction === "output",
    )?.valueType;
    const sourceNodeIds = asset
      ? [
          ...asset.graphNodeOutputs.map((output) => output.graphNodeId),
          asset.imageGenerationImage?.generation.graphNodeId ?? null,
          asset.videoGenerationVideo?.generation.graphNodeId ?? null,
          asset.audioGenerationAudio?.generation.graphNodeId ?? null,
        ]
      : [];
    return (
      !asset ||
      asset.ownerEmail !== ownerEmail ||
      (asset.status !== "completed" && !(asset.status === "failed" && asset.storageUrl === null && asset.legacyUrl === null)) ||
      asset.type !== expectedType ||
      !(asset.status === "failed" && asset.storageUrl === null && asset.legacyUrl === null) && !sourceNodeIds.includes(selection.nodeId)
    );
  });
  if (invalidInput || invalidOutput) {
    throw new GenerationGraphReferenceError("GRAPH_OUTPUT_INVALID");
  }
}

async function assertRuntimeTransitionIsIdle(
  tx: Prisma.TransactionClient,
  existing: {
    nodes: Array<{ id: string; kind: string }>;
  },
  input: UpdateGenerationGraphInput,
) {
  const requestedKinds = new Map(input.nodes.map((node) => [node.id, node.kind]));
  const changesRuntime = existing.nodes.some(
    (node) => !requestedKinds.has(node.id) || requestedKinds.get(node.id) !== node.kind,
  );
  if (!changesRuntime || existing.nodes.length === 0) return;

  const graphNodeIds = existing.nodes.map((node) => node.id);
  const activeCounts = await Promise.all([
    tx.imageGeneration.count({
      where: { graphNodeId: { in: graphNodeIds }, status: { in: ["pending", "processing", "uploading"] } },
    }),
    tx.videoGeneration.count({
      where: { graphNodeId: { in: graphNodeIds }, status: { in: ["pending", "processing", "uploading"] } },
    }),
    tx.audioGeneration.count({
      where: { graphNodeId: { in: graphNodeIds }, status: { in: ["pending", "processing", "uploading"] } },
    }),
    tx.mediaOperation.count({
      where: { graphNodeId: { in: graphNodeIds }, status: { in: ["pending", "processing", "uploading"] } },
    }),
  ]);
  if (activeCounts.some((count) => count > 0)) {
    throw new GenerationGraphActiveExecutionError();
  }
}

async function update(
  ownerEmail: string,
  graphId: string,
  input: UpdateGenerationGraphInput,
): Promise<GenerationGraphSnapshot> {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.generationGraph.findFirst({
      where: { id: graphId, ownerEmail },
      select: {
        version: true,
        schemaVersion: true,
        minimumWriterVersion: true,
        nodes: {
          select: {
            id: true,
            kind: true,
            x: true,
            y: true,
            configVersion: true,
            config: true,
            selectedOutputAssetId: true,
          },
        },
        edges: {
          select: {
            id: true,
            sourceNodeId: true,
            targetNodeId: true,
            sourcePortId: true,
            targetPortId: true,
            sortOrder: true,
            hasPause: true,
          },
        },
      },
    });
    if (!existing) throw new GenerationGraphNotFoundError();
    if (existing.schemaVersion > 3 || existing.minimumWriterVersion > 3) {
      throw new GenerationGraphInputError({ graph: "UNSUPPORTED_SPACE_WRITER" });
    }
    if (existing.version !== input.expectedVersion) {
      throw new GenerationGraphVersionConflictError();
    }
    await assertIdsBelongToGraph(tx, graphId, existing, input);
    await assertCanonicalAssets(tx, ownerEmail, input);
    await assertRuntimeTransitionIsIdle(tx, existing, input);

    const versionUpdate = await tx.generationGraph.updateMany({
      where: { id: graphId, ownerEmail, version: input.expectedVersion },
      data: {
        title: input.title,
        version: { increment: 1 },
        schemaVersion: 3,
        minimumWriterVersion: 3,
        groups: input.groups as Prisma.InputJsonValue,
      },
    });
    if (versionUpdate.count !== 1) throw new GenerationGraphVersionConflictError();

    const existingNodes = existing.nodes ?? [];
    const existingEdges = existing.edges ?? [];
    const existingNodesById = new Map(existingNodes.map((node) => [node.id, node]));
    const existingEdgesById = new Map(existingEdges.map((edge) => [edge.id, edge]));
    const requestedNodeIds = new Set(input.nodes.map((node) => node.id));
    const requestedEdgeIds = new Set(input.edges.map((edge) => edge.id));
    const removedEdgeIds = existingEdges
      .map((edge) => edge.id)
      .filter((id) => !requestedEdgeIds.has(id));
    const removedNodeIds = existingNodes
      .map((node) => node.id)
      .filter((id) => !requestedNodeIds.has(id));

    if (removedEdgeIds.length > 0) {
      await tx.generationGraphEdge.deleteMany({
        where: { graphId, id: { in: removedEdgeIds } },
      });
    }
    const newNodes = input.nodes.filter((node) => !existingNodesById.has(node.id));
    if (newNodes.length > 0) {
      await tx.generationGraphNode.createMany({
        data: newNodes.map((node) => ({
          id: node.id,
          graphId,
          kind: node.kind,
          x: node.position.x,
          y: node.position.y,
          configVersion: node.configVersion,
          config: node.config as Prisma.InputJsonValue,
          selectedOutputAssetId: node.selectedOutputAssetId,
        })),
      });
    }

    const changedNodes = input.nodes.filter((node) => {
      const previous = existingNodesById.get(node.id);
      return previous ? nodeBaseChanged(previous, node) : false;
    });
    await updateNodesInBatch(tx, graphId, changedNodes);

    const selectionChanges = input.selectionChanges === undefined
      ? input.nodes.filter((node) => {
        const previous = existingNodesById.get(node.id);
        return previous && previous.selectedOutputAssetId !== node.selectedOutputAssetId;
      })
      : input.nodes.filter((node) => {
        const previous = existingNodesById.get(node.id);
        return previous
          && input.selectionChanges?.includes(node.id)
          && previous.selectedOutputAssetId !== node.selectedOutputAssetId;
      });
    await updateNodeSelectionsInBatch(tx, graphId, selectionChanges);

    const changedEdges = input.edges.filter((edge) => {
      const previous = existingEdgesById.get(edge.id);
      return previous ? edgeChanged(previous, edge) : false;
    });
    await updateEdgesInBatch(tx, graphId, changedEdges);

    const newEdges = input.edges.filter((edge) => !existingEdgesById.has(edge.id));
    if (newEdges.length > 0) {
      await tx.generationGraphEdge.createMany({
        data: newEdges.map((edge) => ({
          id: edge.id,
          graphId,
          sourceNodeId: edge.sourceNodeId,
          targetNodeId: edge.targetNodeId,
          sourcePortId: edge.sourcePortId,
          targetPortId: edge.targetPortId,
          sortOrder: edge.sortOrder,
          hasPause: edge.hasPause ?? false,
        })),
      });
    }
    // Delete nodes last so an edge can move away from a node in the same save
    // without the FK cascade removing that edge before its batch update.
    if (removedNodeIds.length > 0) {
      await tx.generationGraphNode.deleteMany({
        where: { graphId, id: { in: removedNodeIds } },
      });
    }

    const updated = await tx.generationGraph.findUniqueOrThrow({
      where: { id: graphId },
      include: graphInclude,
    });
    return mapGraph(updated);
  });
}

async function remove(ownerEmail: string, graphId: string) {
  const result = await prisma.generationGraph.deleteMany({ where: { id: graphId, ownerEmail } });
  if (result.count !== 1) throw new GenerationGraphNotFoundError();
}

async function copy(ownerEmail: string, graphId: string): Promise<GenerationGraphSnapshot> {
  return prisma.$transaction(async (tx) => {
    const source = await tx.generationGraph.findFirst({
      where: { id: graphId, ownerEmail }, include: graphInclude,
    });
    if (!source) throw new GenerationGraphNotFoundError();
    const snapshot = mapGraph(source);
    if (!snapshot.writable) throw new GenerationGraphInputError({ graph: "UNSUPPORTED_SPACE" });
    const input = updateGenerationGraphSchema.parse({ title: snapshot.title, nodes: snapshot.nodes, edges: snapshot.edges,
      schemaVersion: 3, groups: snapshot.groups, expectedVersion: source.version });
    await assertCanonicalAssets(tx, ownerEmail, input);
    const ids = new Map(snapshot.nodes.map((node) => [node.id, randomUUID()]));
    const edgeIds = new Map(snapshot.edges.map((edge) => [edge.id, randomUUID()]));
    const groupIds = new Map(snapshot.groups.map((group) => [group.id, randomUUID()]));
    const copied = await tx.generationGraph.create({
      data: { ownerEmail, title: `${source.title.slice(0, 113)} (Copy)`, schemaVersion: 3, minimumWriterVersion: 3,
        groups: snapshot.groups.map((group) => ({ ...group, id: groupIds.get(group.id)!,
          memberNodeIds: group.memberNodeIds.map((id) => ids.get(id)!) })) },
    });
    for (const node of input.nodes) {
      await tx.generationGraphNode.create({ data: {
        id: ids.get(node.id)!, graphId: copied.id, kind: node.kind, x: node.position.x, y: node.position.y,
        configVersion: node.configVersion,
        config: copySpaceConfig(node, ids, randomUUID, edgeIds, groupIds) as Prisma.InputJsonValue,
        selectedOutputAssetId: node.selectedOutputAssetId,
      } });
    }
    if (snapshot.edges.length) await tx.generationGraphEdge.createMany({ data: snapshot.edges.map((edge) => ({
      ...edge, id: edgeIds.get(edge.id)!, graphId: copied.id,
      sourceNodeId: ids.get(edge.sourceNodeId)!, targetNodeId: ids.get(edge.targetNodeId)!,
    })) });
    // Current output bindings are a display snapshot, not copied execution history.
    // Keep ordered Split collections and selected outputs valid after the next save.
    const outputs = await tx.generationGraphNodeOutput.findMany({ where: { graphNodeId: { in: [...ids.keys()] } },
      include: { asset: { select: { ownerEmail: true, status: true } } } });
    if (outputs.some((output) => output.asset.ownerEmail !== ownerEmail || output.asset.status !== "completed")) {
      throw new GenerationGraphReferenceError("GRAPH_OUTPUT_INVALID");
    }
    const bindings = outputs.map(({ graphNodeId, portId, assetId, sortOrder }) => ({
      graphNodeId: ids.get(graphNodeId)!, portId, assetId, sortOrder,
    }));
    for (const node of snapshot.nodes) {
      if (!node.selectedOutputAssetId || bindings.some((binding) => binding.graphNodeId === ids.get(node.id) && binding.assetId === node.selectedOutputAssetId)) continue;
      const port = findNodeDefinition(node.kind)?.ports.find((port) => port.direction === "output");
      if (port) bindings.push({ graphNodeId: ids.get(node.id)!, portId: port.id, assetId: node.selectedOutputAssetId,
        sortOrder: Math.max(-1, ...bindings.filter((binding) => binding.graphNodeId === ids.get(node.id) && binding.portId === port.id).map((binding) => binding.sortOrder)) + 1 });
    }
    if (bindings.length) await tx.generationGraphNodeOutput.createMany({ data: bindings });
    return mapGraph(await tx.generationGraph.findUniqueOrThrow({ where: { id: copied.id }, include: graphInclude }));
  }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
}

export const generationGraphRepository = { create, list, get, update, remove, copy };
export type GenerationGraphRepository = typeof generationGraphRepository;
