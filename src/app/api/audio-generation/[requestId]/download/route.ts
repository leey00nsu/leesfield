import { NextResponse } from "next/server";
import { getSession } from "@/server/auth/session";
import { getAudioGenerationByRequestId } from "@/server/audio-generation/audio-generation-repository";
import {
  resolveAudioExtension,
  resolveAudioMime,
} from "@/shared/lib/audio-file";
import {
  GENERATION_OUTPUT_LIMITS,
} from "@/server/http/bounded-io";
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

  try {
    const upstreamResponse = await requestRemoteStream(audio.url, {
      timeoutMs: 10_000,
      maxBytes: GENERATION_OUTPUT_LIMITS.audio,
      signal: request.signal,
    });
    if (upstreamResponse.status < 200 || upstreamResponse.status >= 300) {
      await upstreamResponse.body.cancel().catch(() => undefined);
      return NextResponse.json(
        { message: "AUDIO_FETCH_FAILED" },
        { status: 502 },
      );
    }

    const contentType = resolveAudioMime({
      contentType: upstreamResponse.headers["content-type"],
      sourceUrl: audio.url,
    });
    const extension = resolveAudioExtension(contentType);
    const filename = `${requestId}-${index + 1}.${extension}`;

    return new Response(upstreamResponse.body, {
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
        { message: "AUDIO_FETCH_TIMEOUT" },
        { status: 502 },
      );
    }
    return NextResponse.json(
      { message: "AUDIO_FETCH_FAILED" },
      { status: 502 },
    );
  }
}
