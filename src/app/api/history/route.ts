import { NextResponse } from "next/server";
import { getSession } from "@/server/auth/session";
import { enforceRateLimit } from "@/server/rate-limit/enforce";
import { RATE_LIMITS } from "@/server/rate-limit/policies";
import { InvalidHistoryCursor } from "@/server/history/lib/history-cursor";
import { getHistory } from "@/server/history/handlers/get-history";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: Request) {
  const session = await getSession();

  if (!session.isLoggedIn || !session.adminEmail) {
    return NextResponse.json(
      { message: "UNAUTHORIZED" },
      { status: 401 },
    );
  }
  const rateLimited = await enforceRateLimit(RATE_LIMITS.readOwner, session.adminEmail);
  if (rateLimited) return rateLimited;

  try {
    const { searchParams } = new URL(request.url);
    const payload = await getHistory(searchParams, session.adminEmail);

    return NextResponse.json(payload, {
      headers: {
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    if (error instanceof InvalidHistoryCursor) return NextResponse.json({ message: error.message }, { status: 400 });
    logSafeError("history.list_failed", error);
    return NextResponse.json(
      { message: "INTERNAL_SERVER_ERROR" },
      { status: 500 },
    );
  }
}
import { logSafeError } from "@/server/observability/request-observability";
