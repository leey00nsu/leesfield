import { NextResponse } from "next/server";
import { getSession } from "@/server/auth/session";
import { assertSessionMutationOrigin } from "@/server/http/request-origin";
import { getAudioGeneration } from "@/server/audio-generation/audio-generation-store";
import { getOwnedHistoryRecord, deleteOwnedHistoryRecord } from "@/server/history/history-record";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type RouteContext = {
  params: Promise<{
    requestId: string;
  }>;
};

async function getObservedHandler(_request: Request, { params }: RouteContext) {
  const session = await getSession();

  if (!session.isLoggedIn || !session.adminEmail) {
    return NextResponse.json({ message: "UNAUTHORIZED" }, { status: 401 });
  }

  const { requestId } = await params;
  let record = null;

  try {
    record = await getAudioGeneration(requestId, session.adminEmail);
  } catch (error) {
    logSafeError("audio_generation.status_failed", error);
    return NextResponse.json({ message: "INTERNAL_SERVER_ERROR" }, { status: 500 });
  }

  if (!record) {
    return NextResponse.json({ message: "NOT_FOUND" }, { status: 404 });
  }

  return NextResponse.json(
    {
      requestId: record.id,
      status: record.status,
      progress: record.progress,
      createdAt: record.createdAt,
      finishedAt: record.finishedAt,
      result: record.result,
      errorMessage: record.errorMessage,
    },
    {
      headers: {
        "Cache-Control": "no-store",
      },
    },
  );
}

async function deleteObservedHandler(request: Request, { params }: RouteContext) {
  const originError = assertSessionMutationOrigin(request);
  if (originError) return originError;
  const session = await getSession();
  if (!session.isLoggedIn || !session.adminEmail) return NextResponse.json({ message: "UNAUTHORIZED" }, { status: 401 });
  const { requestId } = await params;
  try {
    const owned = await getOwnedHistoryRecord(session.adminEmail, requestId, { type: "audio", origin: "generation" });
    if (owned.record && ["pending", "processing", "uploading"].includes(owned.record.status)) return NextResponse.json({ message: "IN_PROGRESS" }, { status: 400 });
    const status = await deleteOwnedHistoryRecord(owned);
    return status === 204 ? NextResponse.json({ message: "DELETED" }) : NextResponse.json({ message: status === 409 ? "HISTORY_IN_USE_OR_ACTIVE" : status === 404 ? "NOT_FOUND" : "STORAGE_DELETE_FAILED" }, { status: status === 502 ? 500 : status });
  } catch (error) { logSafeError("history.delete_failed", error); return NextResponse.json({ message: "DB_DELETE_FAILED" }, { status: 500 }); }
}

import { logSafeError } from "@/server/observability/request-observability";

import { withRequestObservability } from "@/server/observability/request-observability";
export const GET = withRequestObservability("/api/audio-generation/[requestId]", getObservedHandler);
export const DELETE = withRequestObservability("/api/audio-generation/[requestId]", deleteObservedHandler);
