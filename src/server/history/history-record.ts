import { prisma } from "@/server/db/prisma";
import { deleteHistoryFiles } from "./delete-history-files";
import type { ExternalHistorySelector } from "@/shared/api/platform-contract";

const active = ["pending", "processing", "uploading"] as const;
export async function getOwnedHistoryRecord(ownerEmail: string, historyId: string, selector: ExternalHistorySelector) {
  const { type, origin } = selector;
  const where = { requestId: historyId, ownerEmail };
  if (origin === "edit") {
    const record = await prisma.mediaOperation.findFirst({
      where: { id: historyId, ownerEmail, outputs: { some: { type } } },
      include: {
        outputs: { where: { type }, orderBy: { createdAt: "asc" } },
        inputs: { where: { asset: { ownerEmail } }, include: { asset: true }, orderBy: { sortOrder: "asc" } },
      },
    });
    return { record, type, origin, ownerEmail, url: record?.outputs[0]?.storageUrl ?? record?.outputs[0]?.legacyUrl };
  }
  if (type === "image") {
    const record = await prisma.imageGeneration.findFirst({ where, include: { images: { orderBy: { createdAt: "asc" } } } });
    return { record, type, origin, ownerEmail, url: record?.images[0]?.url };
  }
  if (type === "video") {
    const record = await prisma.videoGeneration.findFirst({ where, include: { videos: { orderBy: { createdAt: "asc" } } } });
    return { record, type, origin, ownerEmail, url: record?.videos[0]?.url };
  }
  const record = await prisma.audioGeneration.findFirst({ where, include: { audios: { orderBy: { createdAt: "asc" } } } });
  return { record, type, origin, ownerEmail, url: record?.audios[0]?.url };
}

export async function deleteOwnedHistoryRecord(result: Awaited<ReturnType<typeof getOwnedHistoryRecord>>): Promise<number> {
  if (!result.record) return 404;
  if ((active as readonly string[]).includes(result.record.status)) return 409;
  const where = { id: result.record.id, ownerEmail: result.ownerEmail, status: { notIn: [...active] } };
  const outputs = "outputs" in result.record ? result.record.outputs : "images" in result.record ? result.record.images
    : "videos" in result.record ? result.record.videos : result.record.audios;
  try { await deleteHistoryFiles(result.ownerEmail, outputs); } catch { return 502; }
  const deleted = result.origin === "edit" ? await prisma.mediaOperation.deleteMany({ where })
    : result.type === "image" ? await prisma.imageGeneration.deleteMany({ where })
    : result.type === "video" ? await prisma.videoGeneration.deleteMany({ where })
    : await prisma.audioGeneration.deleteMany({ where });
  return deleted.count ? 204 : 409;
}
