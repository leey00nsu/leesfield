import { NextResponse } from "next/server";
import { getSession } from "@/server/auth/session";
import { enforceRateLimit } from "@/server/rate-limit/enforce";
import { RATE_LIMITS } from "@/server/rate-limit/policies";
import { parseMonitoringQuery } from "@/server/monitoring/monitoring-query";
import { getMonitoringRequests } from "@/server/monitoring/requests";
import {
  logStructured,
  withRequestObservability,
} from "@/server/observability/request-observability";

export const dynamic = "force-dynamic";
export const revalidate = 0;

async function getHandler(request: Request) {
  const session = await getSession();

  if (!session.isLoggedIn || !session.adminEmail) {
    return NextResponse.json({ message: "UNAUTHORIZED" }, { status: 401 });
  }
  const rateLimited = await enforceRateLimit(RATE_LIMITS.statsOwner, session.adminEmail);
  if (rateLimited) return rateLimited;

  const { searchParams } = new URL(request.url);
  const query = parseMonitoringQuery(searchParams, {
    defaultDays: 7,
    defaultLimit: 50,
    defaultOffset: 0,
  });

  try {
    const payload = await getMonitoringRequests(query);
    return NextResponse.json(payload, {
      headers: {
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    logStructured("monitoring.query.failure", {
      kind: "requests",
      errorType: error instanceof Error ? error.name : typeof error,
    }, "error");
    return NextResponse.json(
      { message: "INTERNAL_SERVER_ERROR" },
      { status: 500 },
    );
  }
}

export const GET = withRequestObservability("/api/monitoring/requests", getHandler);
