import { NextResponse } from "next/server";
import { getSession } from "@/server/auth/session";
import { enforceRateLimit } from "@/server/rate-limit/enforce";
import { RATE_LIMITS } from "@/server/rate-limit/policies";
import { getMonitoringRequestDetail } from "@/server/monitoring/request-detail";
import {
  logStructured,
  withRequestObservability,
} from "@/server/observability/request-observability";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const VALID_TYPES = new Set(["image", "video", "audio"]);

async function getHandler(request: Request) {
  const session = await getSession();

  if (!session.isLoggedIn || !session.adminEmail) {
    return NextResponse.json({ message: "UNAUTHORIZED" }, { status: 401 });
  }
  const rateLimited = await enforceRateLimit(RATE_LIMITS.statsOwner, session.adminEmail);
  if (rateLimited) return rateLimited;

  const { searchParams } = new URL(request.url);
  const type = searchParams.get("type");
  const requestId = searchParams.get("requestId");

  if (!type || !requestId || !VALID_TYPES.has(type)) {
    return NextResponse.json({ message: "INVALID_REQUEST" }, { status: 400 });
  }

  try {
    const detail = await getMonitoringRequestDetail(
      type as "image" | "video" | "audio",
      requestId,
    );

    if (!detail) {
      return NextResponse.json({ message: "NOT_FOUND" }, { status: 404 });
    }

    return NextResponse.json(detail, {
      headers: {
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    logStructured("monitoring.query.failure", {
      kind: "request-detail",
      errorType: error instanceof Error ? error.name : typeof error,
    }, "error");
    return NextResponse.json(
      { message: "INTERNAL_SERVER_ERROR" },
      { status: 500 },
    );
  }
}

export const GET = withRequestObservability("/api/monitoring/requests/detail", getHandler);
