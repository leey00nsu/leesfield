import { jsonWithNoStore } from "@/server/http/response";
import { withRequestObservability } from "@/server/observability/request-observability";
import { getReadinessSnapshot } from "@/server/observability/readiness";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const runtime = "nodejs";

export const GET = withRequestObservability(
  "/api/health/ready",
  async (request: Request) => {
    void request;
    const snapshot = await getReadinessSnapshot();
    return jsonWithNoStore(
      {
        status: snapshot.ready ? "ok" : "not_ready",
        uptimeSeconds: Math.floor(process.uptime()),
        checks: {
          database: snapshot.database,
          workers: snapshot.workers,
        },
      },
      { status: snapshot.ready ? 200 : 503 },
    );
  },
);
