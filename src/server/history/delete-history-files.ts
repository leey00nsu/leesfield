import { Prisma } from "@prisma/client";
import { prisma } from "@/server/db/prisma";
import { deleteHistoryStorageFile } from "@/server/media-assets/leemage-media-storage";

export async function deleteHistoryFiles(ownerEmail: string, outputs: {id: string; assetId?: string | null; url?: string | null; storageUrl?: string | null; legacyUrl?: string | null}[]) {
  const ids = outputs.map(output => output.assetId ?? output.id);
  const urls = outputs.flatMap(output => [output.url, output.storageUrl, output.legacyUrl].filter((url): url is string => Boolean(url)));
  const assets = await prisma.mediaAsset.findMany({where: {ownerEmail, OR: [{id: {in: ids}}, {storageUrl: {in: urls}}, {legacyUrl: {in: urls}}]}});
  const covered = new Set<string>();
  for (const asset of assets) {
    covered.add(asset.id);
    if (asset.storageUrl) covered.add(asset.storageUrl);
    if (asset.legacyUrl) covered.add(asset.legacyUrl);
    if (asset.status === "failed" && !asset.storageUrl && !asset.legacyUrl) continue;
    await prisma.mediaAsset.update({where: {id: asset.id}, data: {status: "deleting"}});
    try {
      await deleteHistoryStorageFile(asset.storageProvider === "leemage" ? asset.storageObjectId : null, asset.storageUrl ?? asset.legacyUrl);
    } catch (error) {
      await prisma.mediaAsset.update({where: {id: asset.id}, data: {status: "completed"}});
      throw error;
    }
    // Keep the identity for graph references, but make reads and executions reject it.
    await prisma.mediaAsset.update({where: {id: asset.id}, data: {status: "failed", storageUrl: null, legacyUrl: null, imageVariants: Prisma.DbNull}});
  }
  for (const output of outputs) {
    const url = output.url ?? output.storageUrl ?? output.legacyUrl ?? null;
    if (covered.has(output.assetId ?? output.id) || (url && covered.has(url))) continue;
    await deleteHistoryStorageFile(null, url);
  }
}
