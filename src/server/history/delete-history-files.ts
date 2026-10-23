import { withQueueTransaction } from "@/server/job-queue/job-queue-transaction";
import { createHash } from "node:crypto";
import { prisma } from "@/server/db/prisma";
import { mediaAssetRepository } from "@/server/media-assets/media-asset-repository";
import { MediaAssetInUseError } from "@/server/media-assets/media-asset-errors";
import { lockOrganization } from "@/server/media-assets/asset-organization-repository";
import {
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
    const usage = await mediaAssetRepository.getAssetUsage(ownerEmail, asset.id);
    if (usage.graphIds.length || usage.operationIds.length || usage.generationRequestIds.length || usage.projectCoverIds?.length) {
      throw new MediaAssetInUseError(usage.graphIds, usage.operationIds, usage.generationRequestIds, usage.projectCoverIds);
    }
  }
  for (const asset of assets) {
    covered.add(asset.id);
    if (asset.storageUrl) covered.add(asset.storageUrl);
    if (asset.legacyUrl) covered.add(asset.legacyUrl);
    if (asset.status === "failed" && !asset.storageUrl && !asset.legacyUrl) continue;
    const cleanup = await withQueueTransaction(async (tx) => {
      await lockOrganization(tx, ownerEmail);
      const covers = await tx.assetProject.findMany({ where: { ownerEmail, coverAssetId: asset.id }, select: { id: true } });
      if (covers.length) throw new MediaAssetInUseError([], [], [], covers.map(({ id }) => id));
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
    void cleanup; // Physical deletion is owned by the shared queue.

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
    void cleanup;

  }
}
