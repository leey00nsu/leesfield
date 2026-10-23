import { lockQueueTransaction, withQueueTransaction } from "@/server/job-queue/job-queue-transaction";
import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/server/db/prisma";
import { countPending, DEFAULT_ADMISSION_LIMITS, hashIdempotencyKey, hashSubmissionPayload } from "@/server/generation-admission/submission-ledger";
import { NodeExecutionConfigError, NodeExecutionIdempotencyConflictError, NodeExecutionNodeNotFoundError, NodeExecutionQueueFullError, NodeExecutionVersionConflictError } from "./node-execution-errors";

export type ExternalNodeSubmission = {
  apiKeyId: string;
  commit<T>(snapshot: unknown, kind: string, modelKey: string | null, run: (tx: Prisma.TransactionClient, executionId: string) => Promise<T>): Promise<T>;
};
export class ExternalExecutionReplay extends Error {
  constructor(readonly executionId: string) { super("EXTERNAL_EXECUTION_REPLAY"); }
}

export function externalNodeSubmission(input: {
  ownerEmail: string; apiKeyId: string; graphId: string; nodeId: string;
  expectedGraphVersion: number; idempotencyKey: string | null;
}) {
  const { ownerEmail, apiKeyId, graphId, nodeId, expectedGraphVersion } = input;
  const scope = JSON.stringify([ownerEmail, apiKeyId, graphId, nodeId]);
  const idempotencyHash = input.idempotencyKey ? hashIdempotencyKey(scope, input.idempotencyKey) : null;
  const requestHash = hashSubmissionPayload({ graphId, nodeId, expectedGraphVersion });
  async function lookup(db: Pick<Prisma.TransactionClient, "nodeExecutionSubmission">) {
    if (!idempotencyHash) return null;
    const row = await db.nodeExecutionSubmission.findFirst({ where: { ownerEmail, apiKeyId, graphId, nodeId, idempotencyHash } });
    if (row && row.requestHash !== requestHash) throw new NodeExecutionIdempotencyConflictError();
    return row?.executionId ?? null;
  }
  return {
    lookup: () => lookup(prisma),
    context: {
      apiKeyId,
      async commit<T>(snapshot: unknown, kind: string, modelKey: string | null, run: (tx: Prisma.TransactionClient, executionId: string) => Promise<T>): Promise<T> {
        return withQueueTransaction(async tx => {
          await lockQueueTransaction(tx);
          // Same lock as classic generation admission: count + creation are indivisible.
          await tx.$queryRaw`SELECT CAST(pg_advisory_xact_lock(hashtext('leesfield:generation-admission')) AS TEXT)`;
          const existing = await lookup(tx);
          if (existing) throw new ExternalExecutionReplay(existing);
          const graphs = await tx.$queryRaw<Array<{ version: number }>>`SELECT "version" FROM "GenerationGraph" WHERE id = ${graphId} AND "ownerEmail" = ${ownerEmail} FOR UPDATE`;
          const node = await tx.generationGraphNode.findFirst({ where: { id: nodeId, graphId }, select: { kind: true } });
          if (!graphs.length || !node) throw new NodeExecutionNodeNotFoundError();
          if (graphs[0].version !== expectedGraphVersion || node.kind !== kind) throw new NodeExecutionVersionConflictError();
          if (modelKey) {
            const model = await tx.modelCatalog.findUnique({ where: { key: modelKey }, select: { type: true, isActive: true } });
            const expectedType = kind === "generate.assistant" ? "llm" : kind.slice("generate.".length);
            if (!model?.isActive || model.type !== expectedType) throw new NodeExecutionConfigError({ model: ["MODEL_NOT_FOUND"] });
          }
          const counts = await countPending(tx, ownerEmail, modelKey, new Date());
          if (counts.owner_count >= DEFAULT_ADMISSION_LIMITS.ownerPending) throw new NodeExecutionQueueFullError("OWNER_LIMIT");
          if (counts.global_count >= DEFAULT_ADMISSION_LIMITS.globalPending) throw new NodeExecutionQueueFullError("GLOBAL_LIMIT");
          if (modelKey && counts.provider_count >= DEFAULT_ADMISSION_LIMITS.providerPending) throw new NodeExecutionQueueFullError("PROVIDER_LIMIT");
          const executionId = randomUUID();
          const result = await run(tx, executionId);
          await tx.nodeExecutionSubmission.create({ data: {
            ownerEmail, apiKeyId, graphId, nodeId, idempotencyHash, requestHash, executionId, nodeKind: kind,
            inputSnapshot: JSON.parse(JSON.stringify(snapshot)) as Prisma.InputJsonValue,
          } });
          return result;
        });
      },
    } satisfies ExternalNodeSubmission,
  };
}
