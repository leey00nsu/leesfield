import { assetOrganizationService } from "@/server/media-assets/asset-organization-service";
import { handleAssetOrganizationRequest } from "@/server/media-assets/asset-organization-http";
import { withRequestObservability } from "@/server/observability/request-observability";
export const dynamic = "force-dynamic";
export const GET = withRequestObservability("/api/media-assets/organization", (request: Request) => handleAssetOrganizationRequest(request, (owner) => assetOrganizationService.list(owner)));
