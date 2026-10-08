import { withExternalApi } from "@/server/external-api/route-handler";
import { hasPlatformPermission } from "@/shared/api/platform-permissions";
import { buildErrorResponse } from "@/server/http/response";
import { enforceRateLimit } from "@/server/rate-limit/enforce";
import { RATE_LIMITS } from "@/server/rate-limit/policies";
import { prisma } from "@/server/db/prisma";
import { parseMonitoringQuery, type MonitoringQuery } from "./monitoring-query";

export function withExternalMonitoringRoute(request: Request,
  action: (query: MonitoringQuery, search: URLSearchParams) => Promise<Response>,
  options: { defaultDays?: number; read?: boolean } = {},
) {
  return withExternalApi(request, async (auth) => {
    const search = new URL(request.url).searchParams;
    const scope = search.get("scope") ?? "owner";
    if (scope !== "owner" && scope !== "all") return buildErrorResponse("INVALID_SCOPE", 400);
    if (scope === "all" && !hasPlatformPermission(auth.permissions, "monitoring:read-all")) return buildErrorResponse("PLATFORM_ADMIN_REQUIRED", 403);
    const limited = await enforceRateLimit(options.read ? RATE_LIMITS.readOwner : RATE_LIMITS.statsOwner, auth.ownerEmail);
    if (limited) return limited;
    const query = { ...parseMonitoringQuery(search, { defaultDays: options.defaultDays ?? 7 }),
      ...(scope === "owner" ? { ownerEmail: auth.ownerEmail } : {}) };
    if (query.apiKey.mode === "id") {
      const key = await prisma.apiKey.findFirst({
        where: { id: query.apiKey.value, ...(scope === "owner" ? { ownerEmail: auth.ownerEmail } : {}) },
        select: { id: true },
      });
      if (!key) return buildErrorResponse("API_KEY_NOT_FOUND", 404);
    }
    return action(query, search);
  }, "platform:read");
}
