import { withExternalMonitoringRoute } from "@/server/monitoring/external-monitoring-http";
import { getMonitoringStats } from "@/server/monitoring/stats";
import { externalMonitoringStatsSchema } from "@/shared/api/platform-monitoring-contract";
import { jsonWithNoStore } from "@/server/http/response";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  return withExternalMonitoringRoute(request, async (query) =>
    jsonWithNoStore(externalMonitoringStatsSchema.parse({ items: await getMonitoringStats(query) })),
    { defaultDays: 30 });
}
