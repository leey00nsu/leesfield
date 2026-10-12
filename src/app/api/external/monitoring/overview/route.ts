import { withExternalMonitoringRoute } from "@/server/monitoring/external-monitoring-http";
import { getMonitoringOverview } from "@/server/monitoring/overview";
import { externalMonitoringOverviewSchema } from "@/shared/api/platform-monitoring-contract";
import { jsonWithNoStore } from "@/server/http/response";
export const dynamic = "force-dynamic";
async function getObservedHandler(request: Request) {
  return withExternalMonitoringRoute(request, async (query) =>
    jsonWithNoStore(externalMonitoringOverviewSchema.parse(await getMonitoringOverview(query))),
    {});
}

import { withRequestObservability } from "@/server/observability/request-observability";
export const GET = withRequestObservability("/api/external/monitoring/overview", getObservedHandler);
