import { NextResponse } from "next/server";
import { getSession } from "@/server/auth/session";
import { assertSessionMutationOrigin } from "@/server/http/request-origin";
import { getAudioGeneration } from "@/server/audio-generation/audio-generation-store";
import { prisma } from "@/server/db/prisma";
import { deleteLeemageFilesByPrefix } from "@/server/shared/leemage-file-deleter";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type RouteContext = {
  params: Promise<{
    requestId: string;
  }>;
};

export async function GET(_request: Request, { params }: RouteContext) {
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

export async function DELETE(request: Request, { params }: RouteContext) {
  const originError = assertSessionMutationOrigin(request);
  if (originError) return originError;
  const session = await getSession();

  if (!session.isLoggedIn || !session.adminEmail) {
    return NextResponse.json({ message: "UNAUTHORIZED" }, { status: 401 });
  }

  const { requestId } = await params;
  const record = await prisma.audioGeneration.findFirst({
    where: { requestId, ownerEmail: session.adminEmail },
    select: {
      id: true,
      status: true,
      requestId: true,
    },
  });

  if (!record) {
    return NextResponse.json({ message: "NOT_FOUND" }, { status: 404 });
  }

  if (record.status === "pending" || record.status === "processing") {
    return NextResponse.json({ message: "IN_PROGRESS" }, { status: 400 });
  }

  try {
    await deleteLeemageFilesByPrefix(`${record.requestId}-`);
  } catch (error) {
    logSafeError("audio_generation.storage_delete_failed", error);
    return NextResponse.json({ message: "STORAGE_DELETE_FAILED" }, { status: 500 });
  }

  try {
    await prisma.audioGeneration.delete({
      where: { id: record.id },
    });
  } catch (error) {
    logSafeError("audio_generation.db_delete_failed", error);
    return NextResponse.json({ message: "DB_DELETE_FAILED" }, { status: 500 });
  }

  return NextResponse.json({ message: "DELETED" });
}
import { logSafeError } from "@/server/observability/request-observability";
