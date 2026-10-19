import { Prisma } from "@prisma/client";
import { prisma } from "@/server/db/prisma";

// All branches constrain owner and node; the owning graph is checked by the facade.
// The current authoring kind must never choose the source of an old execution.
export type ExecutionHistoryRow = { id: string; kind: string; createdAt: Date };
export async function queryNodeExecutionHistory(ownerEmail: string, graphId: string, nodeId: string, options: {
  executionId?: string; position?: { id: string; createdAt: string } | null; limit: number;
}) {
  const source = Prisma.sql`
    SELECT "requestId" AS id, 'generate.image' AS kind, "createdAt" FROM "ImageGeneration" WHERE "ownerEmail"=${ownerEmail} AND "graphNodeId"=${nodeId}
    UNION ALL SELECT "requestId", 'generate.video', "createdAt" FROM "VideoGeneration" WHERE "ownerEmail"=${ownerEmail} AND "graphNodeId"=${nodeId}
    UNION ALL SELECT "requestId", 'generate.audio', "createdAt" FROM "AudioGeneration" WHERE "ownerEmail"=${ownerEmail} AND "graphNodeId"=${nodeId}
    UNION ALL SELECT id, 'generate.assistant', "createdAt" FROM "AssistantExecution" WHERE "ownerEmail"=${ownerEmail} AND "graphId"=${graphId} AND "graphNodeId"=${nodeId}
    UNION ALL SELECT id, type::text, "createdAt" FROM "MediaOperation" WHERE "ownerEmail"=${ownerEmail} AND "graphId"=${graphId} AND "graphNodeId"=${nodeId}
  `;
  const idFilter = options.executionId ? Prisma.sql`AND id=${options.executionId}` : Prisma.empty;
  const cursor = options.position ? Prisma.sql`AND ("createdAt", id) < (${new Date(options.position.createdAt)}, ${options.position.id})` : Prisma.empty;
  return prisma.$queryRaw<ExecutionHistoryRow[]>(Prisma.sql`
    SELECT * FROM (${source}) AS executions WHERE TRUE ${idFilter} ${cursor}
    ORDER BY "createdAt" DESC, id DESC LIMIT ${options.limit}
  `);
}
