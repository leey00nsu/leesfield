import { withSpaceApi } from "@/server/external-api/spaces-http";
import { mediaAssetService } from "@/server/media-assets/media-asset-service";
import { externalAssetUploadSchema, externalUploadResponseSchema } from "@/shared/api/assets-contract";
import { readExternalJsonBody } from "@/server/http/bounded-body";
import { buildErrorResponse, jsonWithNoStore } from "@/server/http/response";

export const dynamic = "force-dynamic";
export async function POST(request: Request) {
  return withSpaceApi(request, async ({ ownerEmail }) => {
    const body = await readExternalJsonBody(request);
    if (!body.ok) return buildErrorResponse(body.code, body.status);
    const upload = await mediaAssetService.createUpload(ownerEmail, externalAssetUploadSchema.parse(body.body));
    upload.upload.url = upload.upload.url.replace(/^\/api\/media-assets\//, "/api/external/assets/");
    return jsonWithNoStore(externalUploadResponseSchema.parse({ upload }), { status: 201 });
  }, "upload");
}
