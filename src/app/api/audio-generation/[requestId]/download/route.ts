import { NextResponse } from "next/server";
import { getSession } from "@/server/auth/session";
import { getAudioGenerationByRequestId } from "@/server/audio-generation/audio-generation-repository";
import {
  resolveAudioExtension,
  resolveAudioMime,
} from "@/shared/lib/audio-file";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type RouteContext = {
  params: Promise<{
    requestId: string;
  }>;
};

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

  const record = await getAudioGenerationByRequestId(requestId, session.adminEmail);

  if (!record) {
    return NextResponse.json({ message: "NOT_FOUND" }, { status: 404 });
  }

  const audio = record.audios[index];

  if (!audio) {
    return NextResponse.json({ message: "NOT_FOUND" }, { status: 404 });
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10_000);

  try {
    const upstreamResponse = await fetch(audio.url, {
      cache: "no-store",
      signal: controller.signal,
    });
    if (!upstreamResponse.ok) {
      return NextResponse.json(
        { message: "AUDIO_FETCH_FAILED" },
        { status: 502 },
      );
    }

    const buffer = Buffer.from(await upstreamResponse.arrayBuffer());
    const contentType = resolveAudioMime({
      contentType: upstreamResponse.headers.get("content-type"),
      sourceUrl: audio.url,
      buffer,
    });
    const extension = resolveAudioExtension(contentType);
    const filename = `${requestId}-${index + 1}.${extension}`;

    return new Response(buffer, {
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": `attachment; filename=\"${filename}\"`,
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    if (
      error instanceof Error &&
      (error.name === "AbortError" || controller.signal.aborted)
    ) {
      return NextResponse.json(
        { message: "AUDIO_FETCH_TIMEOUT" },
        { status: 502 },
      );
    }
    return NextResponse.json(
      { message: "AUDIO_FETCH_FAILED" },
      { status: 502 },
    );
  } finally {
    clearTimeout(timeoutId);
  }
}
