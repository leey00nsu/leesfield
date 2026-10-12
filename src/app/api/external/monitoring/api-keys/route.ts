import { withExternalMonitoringRoute } from "@/server/monitoring/external-monitoring-http";
import { prisma } from "@/server/db/prisma";
import { externalMonitoringApiKeysSchema } from "@/shared/api/platform-monitoring-contract";
import { jsonWithNoStore } from "@/server/http/response";
export const dynamic = "force-dynamic";
async function getObservedHandler(request: Request) {
  return withExternalMonitoringRoute(request, async (query) => {
    const items = await prisma.apiKey.findMany({
      where: { ...(query.ownerEmail !== undefined ? { ownerEmail: query.ownerEmail } : {}) },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: query.limit, skip: query.offset,
      select: { id: true, label: true, maskedKey: true, status: true },
    });
    return jsonWithNoStore(externalMonitoringApiKeysSchema.parse({ items, limit: query.limit, offset: query.offset }));
  }, { read: true });
}

import { withRequestObservability } from "@/server/observability/request-observability";
export const GET = withRequestObservability("/api/external/monitoring/api-keys", getObservedHandler);
