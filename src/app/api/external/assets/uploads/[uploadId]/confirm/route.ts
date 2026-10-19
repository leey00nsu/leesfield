import { withSpaceApi } from "@/server/external-api/spaces-http";
import { mediaAssetService } from "@/server/media-assets/media-asset-service";
import { externalAssetResponseSchema, externalUploadConfirmSchema } from "@/shared/api/assets-contract";
import { readExternalJsonBody } from "@/server/http/bounded-body";
import { buildErrorResponse, jsonWithNoStore } from "@/server/http/response";

export const dynamic = "force-dynamic";
export async function POST(request: Request, context: { params: Promise<{ uploadId: string }> }) {
  return withSpaceApi(request, async ({ ownerEmail }) => {
    const body = await readExternalJsonBody(request);
    if (!body.ok) return buildErrorResponse(body.code, body.status);
    return jsonWithNoStore(externalAssetResponseSchema.parse({ asset: await mediaAssetService.confirmUpload(ownerEmail, (await context.params).uploadId, externalUploadConfirmSchema.parse(body.body)) }));
  }, "write");
}
