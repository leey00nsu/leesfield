import { z } from "zod";
import { nodeExecutionRepository } from "@/server/node-executions/node-execution-repository";
import { nodeExecutionService } from "@/server/node-executions/node-execution-service";
import { externalNodeSubmission, ExternalExecutionReplay } from "@/server/node-executions/external-node-submission";
import { externalExecutionQuerySchema, externalNodeExecutionSchema } from "@/shared/api/space-executions-contract";
import { NodeExecutionNotFoundError } from "@/server/node-executions/node-execution-errors";
import { decodePageCursor, encodePageCursor } from "./page-cursor";
import { queryNodeExecutionHistory } from "./node-execution-history";

export async function readExternalNodeExecution(ownerEmail: string, graphId: string, nodeId: string, executionId: string, cancel = false) {
  await nodeExecutionRepository.getOwnedNode(ownerEmail, graphId, nodeId);
  const [source] = await queryNodeExecutionHistory(ownerEmail, graphId, nodeId, { executionId, limit: 1 });
  if (!source) throw new NodeExecutionNotFoundError();
  const action = cancel ? nodeExecutionService.cancel : nodeExecutionService.get;
  return externalNodeExecutionSchema.parse(await action(ownerEmail, graphId, nodeId, executionId, source.kind));
}

export async function executeExternalNode(ownerEmail: string, apiKeyId: string, graphId: string, nodeId: string, expectedGraphVersion: number, idempotencyKey: string | null) {
  // Owner check always precedes replay, including after graph edits.
  await nodeExecutionRepository.getOwnedNode(ownerEmail, graphId, nodeId);
  const submission = externalNodeSubmission({ ownerEmail, apiKeyId, graphId, nodeId, expectedGraphVersion, idempotencyKey });
  let executionId = await submission.lookup();
  if (!executionId) {
    try {
      const result = await nodeExecutionService.execute(ownerEmail, graphId, nodeId, { expectedGraphVersion }, undefined, submission.context);
      executionId = result.record.id;
    } catch (error) {
      executionId = error instanceof ExternalExecutionReplay ? error.executionId : await submission.lookup();
      if (!executionId) throw error;
    }
  }
  return readExternalNodeExecution(ownerEmail, graphId, nodeId, executionId);
}

export async function listExternalNodeExecutions(ownerEmail: string, graphId: string, nodeId: string, query: z.infer<typeof externalExecutionQuerySchema>) {
  await nodeExecutionRepository.getOwnedNode(ownerEmail, graphId, nodeId);
  const binding = { resource: "node-executions", graphId, nodeId };
  const position = query.cursor ? decodePageCursor(query.cursor, ownerEmail, binding, z.object({ id: z.string(), createdAt: z.iso.datetime() }).strict()) : null;
  const rows = await queryNodeExecutionHistory(ownerEmail, graphId, nodeId, { position, limit: query.limit + 1 });
  const page = rows.slice(0, query.limit);
  const last = page.at(-1);
  return {
    items: await Promise.all(page.map(async row => externalNodeExecutionSchema.parse(await nodeExecutionService.get(ownerEmail, graphId, nodeId, row.id, row.kind)))),
    nextCursor: rows.length > query.limit && last ? encodePageCursor(ownerEmail, binding, { id: last.id, createdAt: last.createdAt.toISOString() }) : null,
  };
}
