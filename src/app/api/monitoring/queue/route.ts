import { NextResponse } from "next/server";
import { getSession } from "@/server/auth/session";
import { getQueueStatus } from "@/server/monitoring/queue-status";
import {
  logStructured,
  withRequestObservability,
} from "@/server/observability/request-observability";

export const dynamic = "force-dynamic";
export const revalidate = 0;

async function getHandler() {
  const session = await getSession();

  if (!session.isLoggedIn || !session.adminEmail) {
    return NextResponse.json({ message: "UNAUTHORIZED" }, { status: 401 });
  }

  try {
    const payload = await getQueueStatus();
    return NextResponse.json(payload, {
      headers: {
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    logStructured("monitoring.query.failure", {
      kind: "queue",
      errorType: error instanceof Error ? error.name : typeof error,
    }, "error");
    return NextResponse.json(
      { message: "INTERNAL_SERVER_ERROR" },
      { status: 500 },
    );
  }
}

export const GET = withRequestObservability("/api/monitoring/queue", getHandler);
