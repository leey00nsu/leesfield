import { withExternalApi } from "@/server/external-api/route-handler";
import { getHistory } from "@/server/history/handlers/get-history";
import { InvalidHistoryCursor } from "@/server/history/lib/history-cursor";
import { buildErrorResponse } from "@/server/http/response";
import { enforceRateLimit } from "@/server/rate-limit/enforce";
import { RATE_LIMITS } from "@/server/rate-limit/policies";
import { externalHistoryResponseSchema } from "@/shared/api/platform-contract";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  return withExternalApi(request, async (auth) => {
    const limited = await enforceRateLimit(RATE_LIMITS.readOwner, auth.ownerEmail);
    if (limited) return limited;
    try {
      return Response.json(externalHistoryResponseSchema.parse(await getHistory(new URL(request.url).searchParams, auth.ownerEmail, { includeAssistant: true })), { headers: { "Cache-Control": "no-store" } });
    } catch (error) {
      if (error instanceof InvalidHistoryCursor) return buildErrorResponse(error.message, 400);
      throw error;
    }
  }, "platform:read");
}
