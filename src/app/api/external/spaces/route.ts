import { withSpaceApi } from "@/server/external-api/spaces-http";
import { externalSpaceDto } from "@/server/external-api/spaces-dto";
import { listExternalSpaces } from "@/server/external-api/spaces-page";
import { generationGraphService } from "@/server/generation-graph/generation-graph-service";
import { externalSpaceCreateSchema, externalSpaceListQuerySchema } from "@/shared/api/spaces-contract";
import { readExternalJsonBody } from "@/server/http/bounded-body";
import { buildErrorResponse, jsonWithNoStore } from "@/server/http/response";

export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  return withSpaceApi(request, async ({ ownerEmail }) => jsonWithNoStore(await listExternalSpaces(ownerEmail, externalSpaceListQuerySchema.parse(Object.fromEntries(new URL(request.url).searchParams)))));
}
export async function POST(request: Request) {
  return withSpaceApi(request, async ({ ownerEmail }) => {
    const body = await readExternalJsonBody(request);
    if (!body.ok) return buildErrorResponse(body.code, body.status);
    return jsonWithNoStore(externalSpaceDto(await generationGraphService.create(ownerEmail, externalSpaceCreateSchema.parse(body.body))), { status: 201 });
  }, "write");
}
