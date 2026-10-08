import { withExternalApi } from "@/server/external-api/route-handler";
import { externalHistoryDetailSchema, externalHistorySelectorSchema } from "@/shared/api/platform-contract";
import { getExternalHistoryDetail } from "@/server/history/external-history-detail";
import { getOwnedHistoryRecord, deleteOwnedHistoryRecord } from "@/server/history/history-record";
import { buildErrorResponse } from "@/server/http/response";
import { enforceRateLimit } from "@/server/rate-limit/enforce";
import { RATE_LIMITS } from "@/server/rate-limit/policies";
type Context = { params: Promise<{ historyId: string }> };
export const dynamic = "force-dynamic";
function selector(request: Request) {
  const query = new URL(request.url).searchParams;
  return externalHistorySelectorSchema.safeParse({ type: query.get("type"), origin: query.get("origin") ?? undefined });
}
export async function GET(request: Request, context: Context) {
  return withExternalApi(request, async (auth) => {
    const parsed = selector(request);
    if (!parsed.success) return buildErrorResponse("INVALID_QUERY", 400);
    const limited = await enforceRateLimit(RATE_LIMITS.readOwner, auth.ownerEmail);
    if (limited) return limited;
    const { historyId } = await context.params;
    const detail = await getExternalHistoryDetail(auth.ownerEmail, historyId, parsed.data);
    if (!detail) return buildErrorResponse("HISTORY_NOT_FOUND", 404);
    return Response.json(externalHistoryDetailSchema.parse(detail), { headers: { "Cache-Control": "no-store" } });
  }, "platform:read");
}
export async function DELETE(request: Request, context: Context) {
  return withExternalApi(request, async (auth) => {
    const parsed = selector(request);
    if (!parsed.success) return buildErrorResponse("INVALID_QUERY", 400);
    const limited = await enforceRateLimit(RATE_LIMITS.readOwner, auth.ownerEmail);
    if (limited) return limited;
    const { historyId } = await context.params;
    const status = await deleteOwnedHistoryRecord(await getOwnedHistoryRecord(auth.ownerEmail, historyId, parsed.data));
    if (status === 204) return new Response(null, { status, headers: { "Cache-Control": "no-store" } });
    return buildErrorResponse(status === 404 ? "HISTORY_NOT_FOUND" : status === 409 ? "HISTORY_ACTIVE" : "HISTORY_FILE_DELETE_FAILED", status);
  }, "platform:write");
}
