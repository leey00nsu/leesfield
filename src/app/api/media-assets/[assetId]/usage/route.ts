import { getAssetLibraryUsage } from "@/server/media-assets/asset-library-usage";
import { handleAssetOrganizationRequest } from "@/server/media-assets/asset-organization-http";
import { withRequestObservability } from "@/server/observability/request-observability";
export const dynamic = "force-dynamic";
export const GET = withRequestObservability("/api/media-assets/[assetId]/usage", async (request: Request, context: { params: Promise<{ assetId: string }> }) => {
  const { assetId } = await context.params;
  return handleAssetOrganizationRequest(request, (owner) => getAssetLibraryUsage(owner, assetId));
});
