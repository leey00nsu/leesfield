import { withSpaceApi } from "@/server/external-api/spaces-http";
import { externalSpaceDto } from "@/server/external-api/spaces-dto";
import { generationGraphService } from "@/server/generation-graph/generation-graph-service";
import { jsonWithNoStore } from "@/server/http/response";

export const dynamic = "force-dynamic";
export async function POST(request: Request, context: { params: Promise<{ spaceId: string }> }) {
  return withSpaceApi(request, async ({ ownerEmail }) => jsonWithNoStore(externalSpaceDto(await generationGraphService.copy(ownerEmail, (await context.params).spaceId)), { status: 201 }), "write");
}
