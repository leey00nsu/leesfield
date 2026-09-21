import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/server/db/prisma";
import { deleteHistoryStorageFile } from "@/server/media-assets/leemage-media-storage";
import {
  completeStorageCleanup,
  isCleanupClient,
  queueStorageCleanup,
} from "@/server/media-assets/media-cleanup-repository";

function legacyStorageObjectId(url: string) {
  return `legacy-url-${createHash("sha256").update(url).digest("hex")}`;
}

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
    const cleanup = await prisma.$transaction(async (tx) => {
      await tx.mediaAsset.update({where: {id: asset.id}, data: {status: "deleting"}});
      if (!isCleanupClient(tx)) return null;
      return queueStorageCleanup(tx, {
        ownerEmail,
        storageProvider: asset.storageProvider,
        storageObjectId: asset.storageObjectId,
        storageUrl: asset.storageUrl ?? asset.legacyUrl,
        reason: "history_delete",
        assetId: asset.id,
      });
    });
    try {
      await deleteHistoryStorageFile(asset.storageProvider === "leemage" ? asset.storageObjectId : null, asset.storageUrl ?? asset.legacyUrl);
    } catch (error) {
      throw error;
    }
    // Keep the identity for graph references, but make reads and executions reject it.
    await prisma.$transaction(async (tx) => {
      await tx.mediaAsset.update({where: {id: asset.id}, data: {status: "failed", storageUrl: null, legacyUrl: null, imageVariants: Prisma.DbNull}});
      if (cleanup && isCleanupClient(tx)) {
        await completeStorageCleanup(tx, { id: cleanup.id });
      }
    });
  }
  for (const output of outputs) {
    const url = output.url ?? output.storageUrl ?? output.legacyUrl ?? null;
    if (covered.has(output.assetId ?? output.id) || (url && covered.has(url))) continue;
    const cleanup = url
      ? await queueStorageCleanup(undefined, {
          ownerEmail,
          storageProvider: "legacy_url",
          storageObjectId: legacyStorageObjectId(url),
          storageUrl: url,
          reason: "history_delete",
        })
      : null;
    try {
      await deleteHistoryStorageFile(null, url);
    } catch (error) {
      throw error;
    }
    if (cleanup) await completeStorageCleanup(undefined, { id: cleanup.id });
  }
}
