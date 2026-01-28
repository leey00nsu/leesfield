import { NextResponse } from "next/server";
import { getSession } from "@/server/auth/session";
import { getMonitoringRequestDetail } from "@/server/monitoring/request-detail";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const VALID_TYPES = new Set(["image", "video"]);

export async function GET(request: Request) {
  const session = await getSession();

  if (!session.isLoggedIn || !session.adminEmail) {
    return NextResponse.json({ message: "UNAUTHORIZED" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const type = searchParams.get("type");
  const requestId = searchParams.get("requestId");

  if (!type || !requestId || !VALID_TYPES.has(type)) {
    return NextResponse.json({ message: "INVALID_REQUEST" }, { status: 400 });
  }

  try {
    const detail = await getMonitoringRequestDetail(
      type as "image" | "video",
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
    console.error("[monitoring] request detail failed", error);
    return NextResponse.json(
      { message: "INTERNAL_SERVER_ERROR" },
      { status: 500 },
    );
  }
}
