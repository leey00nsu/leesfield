import { assetOrganizationService } from "@/server/media-assets/asset-organization-service";
import { handleAssetOrganizationRequest } from "@/server/media-assets/asset-organization-http";
import { withRequestObservability } from "@/server/observability/request-observability";
export const dynamic = "force-dynamic";
export const PATCH = withRequestObservability("/api/media-assets/batch", (request: Request) => handleAssetOrganizationRequest(request, (owner, body) => assetOrganizationService.batch(owner, body)));
