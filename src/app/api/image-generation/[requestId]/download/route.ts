import { NextResponse } from "next/server";
import { getSession } from "@/server/auth/session";
import { getImageGenerationByRequestId } from "@/server/image-generation/image-generation-repository";
import { GENERATION_OUTPUT_LIMITS } from "@/server/http/bounded-io";
import {
  RemoteAccessError,
  requestRemoteStream,
} from "@/server/http/safe-remote";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type RouteContext = {
  params: Promise<{
    requestId: string;
  }>;
};

function resolveExtension(contentType?: string | null) {
  if (!contentType) return "bin";
  const type = contentType.split(";")[0]?.trim();
  if (type === "image/webp") return "webp";
  if (type === "image/png") return "png";
  if (type === "image/jpeg") return "jpg";
  if (type === "image/jpg") return "jpg";
  return "bin";
}

export async function GET(request: Request, { params }: RouteContext) {
  const session = await getSession();

  if (!session.isLoggedIn || !session.adminEmail) {
    return NextResponse.json({ message: "UNAUTHORIZED" }, { status: 401 });
  }

  const { requestId } = await params;
  const { searchParams } = new URL(request.url);
  const indexParam = searchParams.get("index") ?? "0";
  const index = Number(indexParam);

  if (!Number.isInteger(index) || index < 0) {
    return NextResponse.json({ message: "INVALID_INDEX" }, { status: 400 });
  }

  const record = await getImageGenerationByRequestId(
    requestId,
    session.adminEmail,
  );

  if (!record) {
    return NextResponse.json({ message: "NOT_FOUND" }, { status: 404 });
  }

  const image = record.images[index];

  if (!image) {
    return NextResponse.json({ message: "NOT_FOUND" }, { status: 404 });
  }

  try {
    const response = await requestRemoteStream(image.url, {
      timeoutMs: 10_000,
      maxBytes: GENERATION_OUTPUT_LIMITS.image,
      signal: request.signal,
    });
    if (response.status < 200 || response.status >= 300) {
      await response.body.cancel().catch(() => undefined);
      return NextResponse.json(
        { message: "IMAGE_FETCH_FAILED" },
        { status: 502 },
      );
    }

    const contentType = response.headers["content-type"] ?? "application/octet-stream";
    const extension = resolveExtension(contentType);
    const filename = `${requestId}-${index + 1}.${extension}`;

    return new Response(response.body, {
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": `attachment; filename=\"${filename}\"`,
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    if (
      error instanceof RemoteAccessError
      && (error.code === "REMOTE_TIMEOUT" || error.code === "REMOTE_ABORTED")
    ) {
      return NextResponse.json(
        { message: "IMAGE_FETCH_TIMEOUT" },
        { status: 502 },
      );
    }
    return NextResponse.json(
      { message: "IMAGE_FETCH_FAILED" },
      { status: 502 },
    );
  }
}
