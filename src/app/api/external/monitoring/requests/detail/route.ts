import { withExternalMonitoringRoute } from "@/server/monitoring/external-monitoring-http";
import { getMonitoringRequestDetail } from "@/server/monitoring/request-detail";
import { externalMonitoringDetailSchema } from "@/shared/api/platform-monitoring-contract";
import { externalHistoryReadSelectorSchema } from "@/shared/api/platform-contract";
import { getAssistantHistoryDetail } from "@/server/history/assistant-history";
import { jsonWithNoStore, buildErrorResponse } from "@/server/http/response";
export const dynamic = "force-dynamic";
async function getObservedHandler(request: Request) {
  return withExternalMonitoringRoute(request, async (query, search) => {
    const selector = externalHistoryReadSelectorSchema.safeParse({ type: search.get("type") });
    const requestId = search.get("requestId");
    if (!selector.success || !requestId) return buildErrorResponse("INVALID_REQUEST", 400);
    const detail = selector.data.type === "assistant"
      ? await getAssistantHistoryDetail(query.ownerEmail, requestId)
      : await getMonitoringRequestDetail(selector.data.type, requestId, query.ownerEmail);
    if (!detail) return buildErrorResponse("NOT_FOUND", 404);
    return jsonWithNoStore(externalMonitoringDetailSchema.parse(detail));
  });
}

import { withRequestObservability } from "@/server/observability/request-observability";
export const GET = withRequestObservability("/api/external/monitoring/requests/detail", getObservedHandler);
