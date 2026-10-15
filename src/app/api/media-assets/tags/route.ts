import { assetOrganizationService } from "@/server/media-assets/asset-organization-service";
import { handleAssetOrganizationRequest } from "@/server/media-assets/asset-organization-http";
import { withRequestObservability } from "@/server/observability/request-observability";
export const dynamic = "force-dynamic";
export const POST = withRequestObservability("/api/media-assets/tags", (request: Request) => handleAssetOrganizationRequest(request, async (owner, body) => ({ tag: await assetOrganizationService.createTag(owner, body) }), 201));
