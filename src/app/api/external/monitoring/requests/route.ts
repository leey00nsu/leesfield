import { withExternalMonitoringRoute } from "@/server/monitoring/external-monitoring-http";
import { getMonitoringRequests } from "@/server/monitoring/requests";
import { externalMonitoringRequestsSchema } from "@/shared/api/platform-monitoring-contract";
import { jsonWithNoStore } from "@/server/http/response";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  return withExternalMonitoringRoute(request, async (query) =>
    jsonWithNoStore(externalMonitoringRequestsSchema.parse(await getMonitoringRequests(query))),
    { read: true });
}
