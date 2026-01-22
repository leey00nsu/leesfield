import { NextResponse } from "next/server";
import { getSession } from "@/server/auth/session";
import { getQueueStatus } from "@/server/monitoring/queue-status";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
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
    console.error("[monitoring] queue status failed", error);
    return NextResponse.json(
      { message: "INTERNAL_SERVER_ERROR" },
      { status: 500 },
    );
  }
}
