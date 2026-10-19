import { withSpaceApi } from "@/server/external-api/spaces-http";
import { mediaAssetService } from "@/server/media-assets/media-asset-service";
import { externalAssetsQuerySchema, externalAssetsResponseSchema } from "@/shared/api/assets-contract";
import { jsonWithNoStore } from "@/server/http/response";

export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  return withSpaceApi(request, async ({ ownerEmail }) => {
    const { q, ...query } = externalAssetsQuerySchema.parse(Object.fromEntries(new URL(request.url).searchParams));
    const data = await mediaAssetService.list(ownerEmail, { ...query, query: q });
    return jsonWithNoStore(externalAssetsResponseSchema.parse(data));
  });
}
