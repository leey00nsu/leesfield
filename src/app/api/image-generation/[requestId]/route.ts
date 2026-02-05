import { NextResponse } from "next/server";
import { getSession } from "@/server/auth/session";
import { getGeneration } from "@/server/image-generation/image-generation-store";
import { prisma } from "@/server/db/prisma";
import { deleteLeemageFilesByPrefix } from "@/server/shared/leemage-file-deleter";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type RouteContext = {
  params: Promise<{
    requestId: string;
  }>;
};

export async function GET(
  _request: Request,
  { params }: RouteContext,
) {
  const session = await getSession();

  if (!session.isLoggedIn || !session.adminEmail) {
    return NextResponse.json(
      { message: "UNAUTHORIZED" },
      { status: 401 },
    );
  }

  const { requestId } = await params;
  const record = await getGeneration(requestId, session.adminEmail);

  if (!record) {
    return NextResponse.json(
      { message: "NOT_FOUND" },
      { status: 404 },
    );
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

export async function DELETE(
  _request: Request,
  { params }: RouteContext,
) {
  const session = await getSession();

  if (!session.isLoggedIn || !session.adminEmail) {
    return NextResponse.json(
      { message: "UNAUTHORIZED" },
      { status: 401 },
    );
  }

  const { requestId } = await params;
  const record = await prisma.imageGeneration.findFirst({
    where: { requestId, ownerEmail: session.adminEmail },
    select: {
      id: true,
      status: true,
      requestId: true,
    },
  });

  if (!record) {
    return NextResponse.json(
      { message: "NOT_FOUND" },
      { status: 404 },
    );
  }

  if (record.status === "pending" || record.status === "processing") {
    return NextResponse.json(
      { message: "IN_PROGRESS" },
      { status: 400 },
    );
  }

  try {
    await deleteLeemageFilesByPrefix(`${record.requestId}-`);
  } catch (error) {
    console.error("[image-generation] storage delete failed", error);
    return NextResponse.json(
      { message: "STORAGE_DELETE_FAILED" },
      { status: 500 },
    );
  }

  try {
    await prisma.imageGeneration.delete({
      where: { id: record.id },
    });
  } catch (error) {
    console.error("[image-generation] db delete failed", error);
    return NextResponse.json(
      { message: "DB_DELETE_FAILED" },
      { status: 500 },
    );
  }

  return NextResponse.json({ message: "DELETED" });
}
