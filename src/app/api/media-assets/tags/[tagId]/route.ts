import { assetOrganizationService } from "@/server/media-assets/asset-organization-service";
import { handleAssetOrganizationRequest } from "@/server/media-assets/asset-organization-http";
import { withRequestObservability } from "@/server/observability/request-observability";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ tagId: string }> };
export const PATCH = withRequestObservability("/api/media-assets/tags/[tagId]", async (request: Request, context: Context) => {
  const { tagId } = await context.params;
  return handleAssetOrganizationRequest(request, async (owner, body) => ({ tag: await assetOrganizationService.updateTag(owner, tagId, body) }));
});
export const DELETE = withRequestObservability("/api/media-assets/tags/[tagId]", async (request: Request, context: Context) => {
  const { tagId } = await context.params;
  return handleAssetOrganizationRequest(request, (owner, body) => assetOrganizationService.deleteTag(owner, tagId, body), 204);
});
