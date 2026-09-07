import { deleteHistoryFiles } from "@/server/history/delete-history-files";
import { getSession } from "@/server/auth/session";
import { prisma } from "@/server/db/prisma";

export const dynamic = "force-dynamic";
type Context = {params: Promise<{historyId: string}>};
const active = ["pending", "processing", "uploading"] as const;
async function ownedRecord(request: Request, context: Context) {
  const session = await getSession();
  if (!session.isLoggedIn || !session.adminEmail) return {error: new Response(null, {status: 401})};
  const {historyId} = await context.params;
  const query = new URL(request.url).searchParams;
  const type = query.get("type");
  if (!["image", "audio", "video"].includes(type ?? "")) return {error: new Response(null, {status: 400})};
  const ownerEmail = session.adminEmail;
  const origin = query.get("origin") ?? "generation";
  if (origin !== "generation" && origin !== "edit") return {error: new Response(null, {status: 400})};
  const where = {requestId: historyId, ownerEmail};
  if (origin === "edit") {
    const record = await prisma.mediaOperation.findFirst({where: {id: historyId, ownerEmail}, include: {outputs: {where: {type: type as "image" | "audio" | "video"}, orderBy: {createdAt: "asc"}}}});
    return {record, type, origin, ownerEmail, url: record?.outputs[0]?.storageUrl ?? record?.outputs[0]?.legacyUrl};
  }
  if (type === "image") {
    const record = await prisma.imageGeneration.findFirst({where, include: {images: {orderBy: {createdAt: "asc"}}}});
    return {record, type, origin, ownerEmail, url: record?.images[0]?.url};
  }
  if (type === "video") {
    const record = await prisma.videoGeneration.findFirst({where, include: {videos: {orderBy: {createdAt: "asc"}}}});
    return {record, type, origin, ownerEmail, url: record?.videos[0]?.url};
  }
  const record = await prisma.audioGeneration.findFirst({where, include: {audios: {orderBy: {createdAt: "asc"}}}});
  return {record, type, origin, ownerEmail, url: record?.audios[0]?.url};
}
export async function GET(request: Request, context: Context) {
  const result = await ownedRecord(request, context);
  if (result.error) return result.error;
  if (!result.record || !result.url) return new Response(null, {status: 404});
  try {
    const url = new URL(result.url);
    if (!["http:", "https:"].includes(url.protocol)) return new Response(null, {status: 422});
    const upstream = await fetch(url, {cache: "no-store", signal: AbortSignal.any([request.signal, AbortSignal.timeout(120000)])});
    if (!upstream.ok || !upstream.body) return new Response(null, {status: 502});
    const mime = upstream.headers.get("content-type")?.split(";")[0] ?? "application/octet-stream";
    const extensions: Record<string,string> = {"image/png":"png", "image/jpeg":"jpg", "image/webp":"webp", "image/gif":"gif", "image/avif":"avif", "video/mp4":"mp4", "video/webm":"webm", "audio/mpeg":"mp3", "audio/wav":"wav", "audio/ogg":"ogg", "audio/flac":"flac"};
    const filename = "leesfield-" + result.type + "." + (extensions[mime] ?? "bin");
    return new Response(upstream.body, {headers: {"Content-Type": mime, "Content-Disposition": 'attachment; filename="'+filename+'"', "Cache-Control": "private, no-store", "X-Content-Type-Options":"nosniff"}});
  } catch {return new Response(null, {status: 502});}
}
export async function DELETE(request: Request, context: Context) {
  const result = await ownedRecord(request, context);
  if (result.error) return result.error;
  if (!result.record) return new Response(null, {status: 404});
  const where = {id: result.record.id, ownerEmail: result.ownerEmail, status: {notIn: [...active]}};
  if ((active as readonly string[]).includes(result.record.status)) return new Response(null, {status: 409});
  try {
    const outputs = "outputs" in result.record ? result.record.outputs : "images" in result.record ? result.record.images : "videos" in result.record ? result.record.videos : result.record.audios;
    await deleteHistoryFiles(result.ownerEmail, outputs);
  } catch { return new Response(null, {status: 502}); }
  const deleted = result.origin === "edit" ? await prisma.mediaOperation.deleteMany({where})
    : result.type === "image" ? await prisma.imageGeneration.deleteMany({where})
    : result.type === "video" ? await prisma.videoGeneration.deleteMany({where})
    : await prisma.audioGeneration.deleteMany({where});
  return new Response(null, {status: deleted.count ? 204 : 409});
}
