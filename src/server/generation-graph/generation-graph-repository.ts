import { Prisma } from "@prisma/client";

import { prisma } from "@/server/db/prisma";

import type { UpdateGenerationGraphInput } from "./generation-graph-contract";
import {
  GenerationGraphNotFoundError,
  GenerationGraphReferenceError,
  GenerationGraphVersionConflictError,
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
  createdAt: Date;
  updatedAt: Date;
};

export type GenerationGraphSnapshot = GenerationGraphSummary & {
  nodes: Array<{
    id: string;
    type: "imageGeneration";
    position: { x: number; y: number };
    configVersion: number;
    config: Prisma.JsonValue;
    selectedOutputImageId: string | null;
  }>;
  edges: Array<{
    id: string;
    sourceNodeId: string;
    targetNodeId: string;
    kind: "primary" | "reference";
    sourceHandle: string | null;
    targetHandle: string | null;
  }>;
};

function mapGraph(record: GraphRecord): GenerationGraphSnapshot {
  return {
    id: record.id,
    title: record.title,
    version: record.version,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    nodes: record.nodes.map((node) => ({
      id: node.id,
      type: node.type,
      position: { x: node.x, y: node.y },
      configVersion: node.configVersion,
      config: node.config,
      selectedOutputImageId: node.selectedOutputImageId,
    })),
    edges: record.edges.map((edge) => ({
      id: edge.id,
      sourceNodeId: edge.sourceNodeId,
      targetNodeId: edge.targetNodeId,
      kind: edge.kind,
      sourceHandle: edge.sourceHandle,
      targetHandle: edge.targetHandle,
    })),
  };
}

async function create(ownerEmail: string, title: string): Promise<GenerationGraphSnapshot> {
  const record = await prisma.generationGraph.create({
    data: { ownerEmail, title },
    include: graphInclude,
  });
  return mapGraph(record);
}

async function list(ownerEmail: string): Promise<GenerationGraphSummary[]> {
  return prisma.generationGraph.findMany({
    where: { ownerEmail },
    select: { id: true, title: true, version: true, createdAt: true, updatedAt: true },
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
  input: UpdateGenerationGraphInput,
) {
  const [nodes, edges] = await Promise.all([
    tx.generationGraphNode.findMany({
      where: { id: { in: input.nodes.map((node) => node.id) } },
      select: { graphId: true },
    }),
    tx.generationGraphEdge.findMany({
      where: { id: { in: input.edges.map((edge) => edge.id) } },
      select: { graphId: true },
    }),
  ]);
  if ([...nodes, ...edges].some((record) => record.graphId !== graphId)) {
    throw new GenerationGraphReferenceError("GRAPH_ID_CONFLICT");
  }
}

async function assertSelectedOutputs(
  tx: Prisma.TransactionClient,
  ownerEmail: string,
  input: UpdateGenerationGraphInput,
) {
  const selections = input.nodes.filter(
    (node): node is typeof node & { selectedOutputImageId: string } =>
      node.selectedOutputImageId !== null,
  );
  if (selections.length === 0) return;

  const images = await tx.imageGenerationImage.findMany({
    where: { id: { in: selections.map((node) => node.selectedOutputImageId) } },
    select: { id: true, generation: { select: { ownerEmail: true, graphNodeId: true } } },
  });
  const byId = new Map(images.map((image) => [image.id, image.generation]));
  const invalid = selections.some((node) => {
    const generation = byId.get(node.selectedOutputImageId);
    return !generation || generation.ownerEmail !== ownerEmail || generation.graphNodeId !== node.id;
  });
  if (invalid) throw new GenerationGraphReferenceError("GRAPH_OUTPUT_INVALID");
}

async function update(
  ownerEmail: string,
  graphId: string,
  input: UpdateGenerationGraphInput,
): Promise<GenerationGraphSnapshot> {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.generationGraph.findFirst({
      where: { id: graphId, ownerEmail },
      select: { version: true },
    });
    if (!existing) throw new GenerationGraphNotFoundError();
    if (existing.version !== input.expectedVersion) {
      throw new GenerationGraphVersionConflictError();
    }

    await assertIdsBelongToGraph(tx, graphId, input);
    await assertSelectedOutputs(tx, ownerEmail, input);

    const versionUpdate = await tx.generationGraph.updateMany({
      where: { id: graphId, ownerEmail, version: input.expectedVersion },
      data: { title: input.title, version: { increment: 1 } },
    });
    if (versionUpdate.count !== 1) throw new GenerationGraphVersionConflictError();

    const edgeIds = input.edges.map((edge) => edge.id);
    await tx.generationGraphEdge.deleteMany({
      where: { graphId, ...(edgeIds.length > 0 ? { id: { notIn: edgeIds } } : {}) },
    });

    for (const node of input.nodes) {
      const data = {
        type: node.type,
        x: node.position.x,
        y: node.position.y,
        configVersion: node.configVersion,
        config: node.config as Prisma.InputJsonValue,
        selectedOutputImageId: node.selectedOutputImageId,
      };
      await tx.generationGraphNode.upsert({
        where: { id: node.id },
        create: { id: node.id, graphId, ...data },
        update: data,
      });
    }

    const nodeIds = input.nodes.map((node) => node.id);
    await tx.generationGraphNode.deleteMany({
      where: { graphId, ...(nodeIds.length > 0 ? { id: { notIn: nodeIds } } : {}) },
    });

    for (const edge of input.edges) {
      const data = {
        sourceNodeId: edge.sourceNodeId,
        targetNodeId: edge.targetNodeId,
        kind: edge.kind,
        sourceHandle: edge.sourceHandle,
        targetHandle: edge.targetHandle,
      };
      await tx.generationGraphEdge.upsert({
        where: { id: edge.id },
        create: { id: edge.id, graphId, ...data },
        update: data,
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

export const generationGraphRepository = { create, list, get, update, remove };
export type GenerationGraphRepository = typeof generationGraphRepository;
