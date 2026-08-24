import { prisma } from "@/server/db/prisma";

import { NodeGenerationNotFoundError } from "./node-generation-errors";

async function getOwnedNode(
  ownerEmail: string,
  graphId: string,
  nodeId: string,
) {
  const node = await prisma.generationGraphNode.findFirst({
    where: {
      id: nodeId,
      graphId,
      graph: { ownerEmail },
    },
    select: {
      id: true,
      type: true,
      configVersion: true,
      config: true,
      graph: { select: { version: true } },
      incomingEdges: {
        select: {
          id: true,
          kind: true,
          createdAt: true,
          sourceNodeId: true,
          sourceNode: {
            select: {
              id: true,
              selectedOutputImageId: true,
              selectedOutputImage: {
                select: {
                  id: true,
                  url: true,
                  generation: {
                    select: {
                      ownerEmail: true,
                      graphNodeId: true,
                      status: true,
                    },
                  },
                },
              },
            },
          },
        },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      },
    },
  });
  if (!node) throw new NodeGenerationNotFoundError();
  return node;
}

async function list(
  ownerEmail: string,
  graphId: string,
  nodeId: string,
  take = 20,
) {
  await getOwnedNode(ownerEmail, graphId, nodeId);
  return prisma.imageGeneration.findMany({
    where: { ownerEmail, graphNodeId: nodeId },
    select: {
      requestId: true,
      status: true,
      progress: true,
      errorMessage: true,
      createdAt: true,
      modelKey: true,
      images: {
        select: {
          id: true,
          url: true,
          width: true,
          height: true,
        },
        orderBy: { createdAt: "asc" },
      },
    },
    orderBy: { createdAt: "desc" },
    take,
  });
}

export const nodeGenerationRepository = { getOwnedNode, list };
export type NodeGenerationRepository = typeof nodeGenerationRepository;
