import { withSpaceApi } from "@/server/external-api/spaces-http";
import { readExternalNodeExecution } from "@/server/external-api/space-executions";
import { nodeExecutionService } from "@/server/node-executions/node-execution-service";
import { nodeExecutionRepository } from "@/server/node-executions/node-execution-repository";
import { NodeExecutionConfigError } from "@/server/node-executions/node-execution-errors";
import { externalAssistantSelectionSchema, externalNodeExecutionSchema } from "@/shared/api/space-executions-contract";
import { JSON_BODY_LIMIT_BYTES, readExternalJsonBody } from "@/server/http/bounded-body";
import { buildErrorResponse, jsonWithNoStore } from "@/server/http/response";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ spaceId: string; nodeId: string; executionId: string }> };
export async function GET(request: Request, context: Context) {
  return withSpaceApi(request, async ({ ownerEmail }) => {
    const { spaceId, nodeId, executionId } = await context.params;
    return jsonWithNoStore({ execution: await readExternalNodeExecution(ownerEmail, spaceId, nodeId, executionId) });
  });
}
export async function DELETE(request: Request, context: Context) {
  return withSpaceApi(request, async ({ ownerEmail }) => {
    const { spaceId, nodeId, executionId } = await context.params;
    return jsonWithNoStore({ execution: await readExternalNodeExecution(ownerEmail, spaceId, nodeId, executionId, true) });
  }, "write");
}
export async function PATCH(request: Request, context: Context) {
  return withSpaceApi(request, async ({ ownerEmail }) => {
    const bounded = await readExternalJsonBody(request, JSON_BODY_LIMIT_BYTES);
    if (!bounded.ok) return buildErrorResponse(bounded.code, bounded.status);
    const input = externalAssistantSelectionSchema.parse(bounded.body);
    const { spaceId, nodeId, executionId } = await context.params;
    const node = await nodeExecutionRepository.getOwnedNode(ownerEmail, spaceId, nodeId);
    if (node.kind !== "generate.assistant") throw new NodeExecutionConfigError({ node: ["ASSISTANT_SELECTION_ONLY"] });
    return jsonWithNoStore({ execution: externalNodeExecutionSchema.parse(await nodeExecutionService.update(ownerEmail, spaceId, nodeId, executionId, input)) });
  }, "write");
}
