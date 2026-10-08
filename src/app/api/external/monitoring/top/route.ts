import { withExternalMonitoringRoute } from "@/server/monitoring/external-monitoring-http";
import { getMonitoringTop } from "@/server/monitoring/top";
import { externalMonitoringTopSchema } from "@/shared/api/platform-monitoring-contract";
import { jsonWithNoStore } from "@/server/http/response";
import { parseTopLimit } from "@/server/monitoring/monitoring-query";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  return withExternalMonitoringRoute(request, async (query, search) =>
    jsonWithNoStore(externalMonitoringTopSchema.parse(await getMonitoringTop(query, parseTopLimit(search)))),
    {});
}
