import { NextResponse } from "next/server";
import { getSession } from "@/server/auth/session";
import { parseMonitoringQuery } from "@/server/monitoring/monitoring-query";
import { getMonitoringRequests } from "@/server/monitoring/requests";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: Request) {
  const session = await getSession();

  if (!session.isLoggedIn || !session.adminEmail) {
    return NextResponse.json({ message: "UNAUTHORIZED" }, { status: 401 });
  }

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
    console.error("[monitoring] requests failed", error);
    return NextResponse.json(
      { message: "INTERNAL_SERVER_ERROR" },
      { status: 500 },
    );
  }
}
