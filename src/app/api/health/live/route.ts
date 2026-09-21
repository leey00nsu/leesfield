import { jsonWithNoStore } from "@/server/http/response";
import { withRequestObservability } from "@/server/observability/request-observability";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const runtime = "nodejs";

export const GET = withRequestObservability(
  "/api/health/live",
  async (request: Request) => {
    void request;
    return jsonWithNoStore({
      status: "ok",
      uptimeSeconds: Math.floor(process.uptime()),
    });
  },
);
