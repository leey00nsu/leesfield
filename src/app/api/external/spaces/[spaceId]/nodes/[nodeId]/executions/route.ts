import { withSpaceApi } from "@/server/external-api/spaces-http";
import { executeExternalNode, listExternalNodeExecutions } from "@/server/external-api/space-executions";
import { externalExecuteNodeSchema } from "@/shared/api/spaces-contract";
import { externalExecutionQuerySchema, externalIdempotencyKeySchema } from "@/shared/api/space-executions-contract";
import { JSON_BODY_LIMIT_BYTES, readExternalJsonBody } from "@/server/http/bounded-body";
import { buildErrorResponse, jsonWithNoStore } from "@/server/http/response";

export const dynamic = "force-dynamic";
type Context = { params: Promise<{ spaceId: string; nodeId: string }> };
export async function GET(request: Request, context: Context) {
  return withSpaceApi(request, async ({ ownerEmail }) => {
    const { spaceId, nodeId } = await context.params;
    return jsonWithNoStore(await listExternalNodeExecutions(ownerEmail, spaceId, nodeId, externalExecutionQuerySchema.parse(Object.fromEntries(new URL(request.url).searchParams))));
  });
}
export async function POST(request: Request, context: Context) {
  return withSpaceApi(request, async ({ ownerEmail, apiKeyId }) => {
    const body = await readExternalJsonBody(request, JSON_BODY_LIMIT_BYTES);
    if (!body.ok) return buildErrorResponse(body.code, body.status);
    const { expectedGraphVersion } = externalExecuteNodeSchema.parse(body.body);
    const header = request.headers.get("Idempotency-Key");
    const key = header === null ? null : externalIdempotencyKeySchema.parse(header);
    const { spaceId, nodeId } = await context.params;
    return jsonWithNoStore({ execution: await executeExternalNode(ownerEmail, apiKeyId, spaceId, nodeId, expectedGraphVersion, key) }, { status: 202 });
  }, "execute");
}
