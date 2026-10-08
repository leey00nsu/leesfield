import { withExternalMonitoringRoute } from "@/server/monitoring/external-monitoring-http";
import { getMonitoringRequestDetail } from "@/server/monitoring/request-detail";
import { externalMonitoringDetailSchema } from "@/shared/api/platform-monitoring-contract";
import { externalHistorySelectorSchema } from "@/shared/api/platform-contract";
import { jsonWithNoStore, buildErrorResponse } from "@/server/http/response";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  return withExternalMonitoringRoute(request, async (query, search) => {
    const selector = externalHistorySelectorSchema.safeParse({ type: search.get("type") });
    const requestId = search.get("requestId");
    if (!selector.success || !requestId) return buildErrorResponse("INVALID_REQUEST", 400);
    const detail = await getMonitoringRequestDetail(selector.data.type, requestId, query.ownerEmail);
    if (!detail) return buildErrorResponse("NOT_FOUND", 404);
    return jsonWithNoStore(externalMonitoringDetailSchema.parse(detail));
  });
}
