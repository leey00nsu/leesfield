import { withSpaceApi } from "@/server/external-api/spaces-http";
import { externalSpaceDto } from "@/server/external-api/spaces-dto";
import { generationGraphService } from "@/server/generation-graph/generation-graph-service";
import { externalSpaceUpdateSchema } from "@/shared/api/spaces-contract";
import { GRAPH_BODY_LIMIT_BYTES, readExternalJsonBody } from "@/server/http/bounded-body";
import { buildErrorResponse, buildInvalidRequestResponse, jsonWithNoStore } from "@/server/http/response";
import { canonicalJson } from "@/server/generation-admission/submission-ledger";

export const dynamic = "force-dynamic";
type Context = { params: Promise<{ spaceId: string }> };
export async function GET(request: Request, context: Context) {
  return withSpaceApi(request, async ({ ownerEmail }) => jsonWithNoStore(externalSpaceDto(await generationGraphService.get(ownerEmail, (await context.params).spaceId))));
}
export async function PUT(request: Request, context: Context) {
  return withSpaceApi(request, async ({ ownerEmail }) => {
    const body = await readExternalJsonBody(request, GRAPH_BODY_LIMIT_BYTES);
    if (!body.ok) return buildErrorResponse(body.code, body.status);
    const input = externalSpaceUpdateSchema.parse(body.body);
    const { spaceId } = await context.params;
    const previous = await generationGraphService.get(ownerEmail, spaceId);
    // Browser result placeholders are read-only through the external contract.
    const prior = new Map(previous.nodes.map(node => [node.id, node.config]));
    for (const node of input.nodes) {
      const config = node.config && typeof node.config === "object" && !Array.isArray(node.config) ? node.config : {};
      if (!("resultSource" in config)) continue;
      const old = prior.get(node.id);
      if (!old || typeof old !== "object" || Array.isArray(old) || canonicalJson(config.resultSource) !== canonicalJson(old.resultSource)) {
        return buildInvalidRequestResponse({ nodes: ["RESULT_SOURCE_READ_ONLY"] });
      }
    }
    return jsonWithNoStore(externalSpaceDto(await generationGraphService.update(ownerEmail, spaceId, input)));
  }, "write");
}
export async function DELETE(request: Request, context: Context) {
  return withSpaceApi(request, async ({ ownerEmail }) => {
    await generationGraphService.remove(ownerEmail, (await context.params).spaceId);
    return new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });
  }, "write");
}
