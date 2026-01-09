import { NextResponse } from "next/server";
import { getSession } from "@/server/auth/session";
import { getImageGenerationByRequestId } from "@/server/image-generation/image-generation-repository";

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

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10_000);
  let response: Response;

  try {
    response = await fetch(image.url, {
      cache: "no-store",
      signal: controller.signal,
    });
  } catch (error) {
    clearTimeout(timeoutId);
    if (error instanceof Error && error.name === "AbortError") {
      return NextResponse.json(
        { message: "IMAGE_FETCH_TIMEOUT" },
        { status: 502 },
      );
    }
    return NextResponse.json(
      { message: "IMAGE_FETCH_FAILED" },
      { status: 502 },
    );
  } finally {
    clearTimeout(timeoutId);
  }

  if (!response.ok) {
    return NextResponse.json(
      { message: "IMAGE_FETCH_FAILED" },
      { status: 502 },
    );
  }

  const contentType = response.headers.get("content-type") ?? "application/octet-stream";
  const extension = resolveExtension(contentType);
  const filename = `${requestId}-${index + 1}.${extension}`;
  const body = response.body ?? (await response.arrayBuffer());

  return new Response(body, {
    headers: {
      "Content-Type": contentType,
      "Content-Disposition": `attachment; filename=\"${filename}\"`,
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
