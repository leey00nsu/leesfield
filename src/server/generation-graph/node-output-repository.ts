import { Prisma } from "@prisma/client";

import { prisma } from "@/server/db/prisma";
import { NodeExecutionNodeNotFoundError } from "@/server/node-executions/node-execution-errors";

const displayNodeSelect = {
  id: true,
  kind: true,
  config: true,
  incomingEdges: {
    orderBy: [
      { targetPortId: "asc" as const },
      { sortOrder: "asc" as const },
      { createdAt: "asc" as const },
      { id: "asc" as const },
    ],
    select: {
      id: true,
      sourcePortId: true,
      targetPortId: true,
      sortOrder: true,
      sourceNode: {
        select: {
          id: true,
          kind: true,
          config: true,
          selectedOutputAssetId: true,
          outputs: {
            orderBy: [{ portId: "asc" as const }, { sortOrder: "asc" as const }],
            select: { portId: true, sortOrder: true, assetId: true },
          },
        },
      },
    },
  },
} satisfies Prisma.GenerationGraphNodeSelect;

export type StoredDisplayNode = Prisma.GenerationGraphNodeGetPayload<{
  select: typeof displayNodeSelect;
}>;

async function getOwnedDisplayNode(ownerEmail: string, graphId: string, nodeId: string) {
  const node = await prisma.generationGraphNode.findFirst({
    where: { id: nodeId, graphId, graph: { ownerEmail } },
    select: displayNodeSelect,
  });
  if (!node) throw new NodeExecutionNodeNotFoundError();
  return node;
}

export const nodeOutputRepository = { getOwnedDisplayNode };
export type NodeOutputRepository = typeof nodeOutputRepository;
