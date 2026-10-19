import { withSpaceApi } from "@/server/external-api/spaces-http";
import { nodeOutputService } from "@/server/generation-graph/node-output-service";
import { externalNodeOutputResponseSchema } from "@/shared/api/space-executions-contract";
import { jsonWithNoStore } from "@/server/http/response";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ spaceId: string; nodeId: string }> };
export async function GET(request: Request, context: Context) {
  return withSpaceApi(request, async ({ ownerEmail }) => {
    const { spaceId, nodeId } = await context.params;
    return jsonWithNoStore(externalNodeOutputResponseSchema.parse({ output: await nodeOutputService.resolve(ownerEmail, spaceId, nodeId) }));
  });
}
