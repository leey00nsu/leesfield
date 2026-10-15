import { prisma } from "@/server/db/prisma";
import { historyVisibilitySchema } from "@/shared/media-assets/asset-organization-contract";
import { MediaAssetInputError, MediaAssetNotFoundError, AssetMetadataConflictError } from "@/server/media-assets/media-asset-errors";

const terminal = ["completed", "failed", "cancelled"] as const;
export async function setHistoryVisibility(ownerEmail: string, historyId: string, body: unknown) {
  const parsed = historyVisibilitySchema.safeParse(body);
  if (!parsed.success) throw new MediaAssetInputError(parsed.error.flatten());
  const { type, origin, hidden } = parsed.data;
  return prisma.$transaction(async (tx) => {
    const where = { ownerEmail, requestId: historyId };
    const record = origin === "edit"
      ? await tx.mediaOperation.findFirst({ where: { ownerEmail, id: historyId, outputs: { some: { type } } }, select: { id: true, status: true, updatedAt: true } })
      : type === "image" ? await tx.imageGeneration.findFirst({ where, select: { id: true, status: true, updatedAt: true } })
      : type === "video" ? await tx.videoGeneration.findFirst({ where, select: { id: true, status: true, updatedAt: true } })
      : await tx.audioGeneration.findFirst({ where, select: { id: true, status: true, updatedAt: true } });
    if (!record) throw new MediaAssetNotFoundError();
    if (!(terminal as readonly string[]).includes(record.status)) throw new AssetMetadataConflictError("ASSET_VERSION_CONFLICT");
    const condition = { id: record.id, ownerEmail, status: { in: [...terminal] } };
    const data = { hiddenAt: hidden ? new Date() : null, updatedAt: record.updatedAt };
    const changed = origin === "edit" ? await tx.mediaOperation.updateMany({ where: condition, data })
      : type === "image" ? await tx.imageGeneration.updateMany({ where: condition, data })
      : type === "video" ? await tx.videoGeneration.updateMany({ where: condition, data })
      : await tx.audioGeneration.updateMany({ where: condition, data });
    if (changed.count !== 1) throw new AssetMetadataConflictError("ASSET_VERSION_CONFLICT");
    return { id: historyId, hidden };
  });
}
