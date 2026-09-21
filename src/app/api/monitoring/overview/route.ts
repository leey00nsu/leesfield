import { NextResponse } from "next/server";
import { getSession } from "@/server/auth/session";
import { getMonitoringOverview } from "@/server/monitoring/overview";
import { parseMonitoringQuery } from "@/server/monitoring/monitoring-query";
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

  const { searchParams } = new URL(request.url);
  const query = parseMonitoringQuery(searchParams, { defaultDays: 7 });

  try {
    const payload = await getMonitoringOverview(query);
    return NextResponse.json(payload, {
      headers: {
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    logStructured("monitoring.query.failure", {
      kind: "overview",
      errorType: error instanceof Error ? error.name : typeof error,
    }, "error");
    return NextResponse.json(
      { message: "INTERNAL_SERVER_ERROR" },
      { status: 500 },
    );
  }
}

export const GET = withRequestObservability("/api/monitoring/overview", getHandler);
