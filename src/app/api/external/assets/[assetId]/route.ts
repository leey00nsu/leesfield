import { withSpaceApi } from "@/server/external-api/spaces-http";
import { mediaAssetService } from "@/server/media-assets/media-asset-service";
import { externalAssetResponseSchema } from "@/shared/api/assets-contract";
import { buildErrorResponse, jsonWithNoStore } from "@/server/http/response";

export const dynamic = "force-dynamic";
export async function GET(request: Request, context: { params: Promise<{ assetId: string }> }) {
  return withSpaceApi(request, async ({ ownerEmail }) => {
    const asset = await mediaAssetService.get(ownerEmail, (await context.params).assetId);
    return asset.status === "completed" ? jsonWithNoStore(externalAssetResponseSchema.parse({ asset })) : buildErrorResponse("MEDIA_ASSET_NOT_FOUND", 404);
  });
}
