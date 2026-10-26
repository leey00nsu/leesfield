import { withExternalApi } from "@/server/external-api/route-handler";
import { getHistoryStatus } from "@/server/history/handlers/get-history-status";
import { enforceRateLimit } from "@/server/rate-limit/enforce";
import { RATE_LIMITS } from "@/server/rate-limit/policies";
import { externalHistoryStatusSchema } from "@/shared/api/platform-contract";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  return withExternalApi(request, async (auth) => {
    const limited = await enforceRateLimit(RATE_LIMITS.readOwner, auth.ownerEmail);
    if (limited) return limited;
    return Response.json(externalHistoryStatusSchema.parse(await getHistoryStatus(new URL(request.url).searchParams, auth.ownerEmail, { includeAssistant: true })), { headers: { "Cache-Control": "no-store" } });
  }, "platform:read");
}
