import { withExternalMonitoringRoute } from "@/server/monitoring/external-monitoring-http";
import { getMonitoringOverview } from "@/server/monitoring/overview";
import { externalMonitoringOverviewSchema } from "@/shared/api/platform-monitoring-contract";
import { jsonWithNoStore } from "@/server/http/response";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  return withExternalMonitoringRoute(request, async (query) =>
    jsonWithNoStore(externalMonitoringOverviewSchema.parse(await getMonitoringOverview(query))),
    {});
}
