import { getOwnedHistoryRecord, deleteOwnedHistoryRecord } from "@/server/history/history-record";
import { externalHistorySelectorSchema } from "@/shared/api/platform-contract";
import { getSession } from "@/server/auth/session";
import { jsonWithNoStore } from "@/server/http/response";
import { assertSessionMutationOrigin } from "@/server/http/request-origin";
import {
  GENERATION_OUTPUT_LIMITS,
  limitReadableStream,
} from "@/server/http/bounded-io";
import { requestRemoteStream } from "@/server/http/safe-remote";

export const dynamic = "force-dynamic";
type Context = {params: Promise<{historyId: string}>};
async function ownedRecord(request: Request, context: Context) {
  const session = await getSession();
  if (!session.isLoggedIn || !session.adminEmail) return { error: new Response(null, { status: 401 }) };
  const { historyId } = await context.params;
  const query = new URL(request.url).searchParams;
  const parsed = externalHistorySelectorSchema.safeParse({ type: query.get("type"), origin: query.get("origin") ?? undefined });
  if (!parsed.success) return { error: new Response(null, { status: 400 }) };
  return getOwnedHistoryRecord(session.adminEmail, historyId, parsed.data);
}
export async function GET(request: Request, context: Context) {
  const result = await ownedRecord(request, context);
  if ("error" in result) return result.error;
  if (new URL(request.url).searchParams.get("view") === "authoring") {
    if (!result.record || result.origin === "edit" || result.type === "audio" || !("requestParams" in result.record)) return new Response(null, { status: 404 });
    const raw = result.record.requestParams;
    const cinema = raw && typeof raw === "object" && !Array.isArray(raw) ? raw.cinema ?? null : null;
    return jsonWithNoStore({ cinema, prompt: result.record.prompt, model: result.record.modelKey });
  }
  if (!result.record || !result.url) return new Response(null, {status: 404});
  try {
    const url = new URL(result.url);
    if (!["http:", "https:"].includes(url.protocol)) return new Response(null, {status: 422});
    const maxBytes = GENERATION_OUTPUT_LIMITS[result.type as "image" | "video" | "audio"];
    const upstream = await requestRemoteStream(url.toString(), {
      timeoutMs: 120_000,
      maxRedirects: 3,
      maxBytes,
      signal: request.signal,
      allowInsecureHttp: process.env.NODE_ENV !== "production",
    });
    if (upstream.status < 200 || upstream.status >= 300) {
      await upstream.body.cancel().catch(() => undefined);
      return new Response(null, {status: 502});
    }
    const declared = Number(upstream.headers["content-length"]);
    if (Number.isFinite(declared) && declared > maxBytes) {
      await upstream.body.cancel().catch(() => undefined);
      return new Response(null, {status: 502});
    }
    const mime = upstream.headers["content-type"]?.split(";")[0] ?? "application/octet-stream";
    const extensions: Record<string,string> = {"image/png":"png", "image/jpeg":"jpg", "image/webp":"webp", "image/gif":"gif", "image/avif":"avif", "video/mp4":"mp4", "video/webm":"webm", "audio/mpeg":"mp3", "audio/wav":"wav", "audio/ogg":"ogg", "audio/flac":"flac"};
    const filename = "leesfield-" + result.type + "." + (extensions[mime] ?? "bin");
    return new Response(limitReadableStream(upstream.body, {
      maxBytes,
      signal: request.signal,
    }), {headers: {"Content-Type": mime, "Content-Disposition": 'attachment; filename="'+filename+'"', "Cache-Control": "private, no-store", "X-Content-Type-Options":"nosniff"}});
  } catch {return new Response(null, {status: 502});}
}
export async function DELETE(request: Request, context: Context) {
  const originError = assertSessionMutationOrigin(request);
  if (originError) return originError;
  const result = await ownedRecord(request, context);
  if ("error" in result) return result.error;
  return new Response(null, { status: await deleteOwnedHistoryRecord(result) });
}
