import { getSession } from "@/server/auth/session";
import { getDbPoolSnapshot } from "@/server/db/prisma";
import { buildErrorResponse, jsonWithNoStore } from "@/server/http/response";
import { getQueueMetrics } from "@/server/monitoring/queue-status";
import { withRequestObservability } from "@/server/observability/request-observability";
import {
  getObservabilitySnapshot,
  recordQueueSnapshot,
} from "@/server/observability/metrics";
import { getWorkerSupervisorState } from "@/server/runtime/worker-supervisor";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const runtime = "nodejs";

export const GET = withRequestObservability(
  "/api/health/metrics",
  async (request: Request) => {
    void request;
    const session = await getSession();
    if (!session.isLoggedIn || !session.adminEmail) {
      return buildErrorResponse("UNAUTHORIZED", 401);
    }

    try {
      const queue = await getQueueMetrics();
      recordQueueSnapshot(queue);
      return jsonWithNoStore({
        ...getObservabilitySnapshot(getDbPoolSnapshot()),
        queue,
        workers: getWorkerSupervisorState(),
      });
    } catch {
      return buildErrorResponse("HEALTH_METRICS_UNAVAILABLE", 503);
    }
  },
);
