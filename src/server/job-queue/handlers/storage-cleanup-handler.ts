import { Prisma } from "@prisma/client";
import { mediaAssetRepository } from "@/server/media-assets/media-asset-repository";
import { leemageMediaStorageAdapter, deleteHistoryStorageFile } from "@/server/media-assets/leemage-media-storage";
import { safeCleanupError, cleanupRetryAt } from "@/server/media-assets/media-cleanup-repository";
import type { MediaStorageAdapter } from "@/server/media-assets/media-storage";
import { QueueContractError } from "../contracts";
import { requireQueueLeaseTx } from "../job-queue-lease";
import { withQueueTransaction } from "../job-queue-transaction";
import type { QueueHandler } from "../job-queue-handler";

type CleanupResult = { protected: boolean; assetId: string | null };

export function createStorageCleanupHandler(storage: MediaStorageAdapter = leemageMediaStorageAdapter): QueueHandler {
  return {
    kind: "storage_cleanup",
    async prepareTx(tx, job, lease) {
      const result = await tx.mediaCleanupTask.updateMany({
        where: { id: job.executionId, queueRevision: job.sourceRevision, status: "pending" },
        data: { status: "processing", attempts: { increment: 1 }, leaseToken: lease.token, leaseUntil: new Date(Date.now() + 60_000) },
      });
      if (result.count !== 1) throw new QueueContractError("QUEUE_CLEANUP_REVISION_CHANGED");
    },
    async execute(job, context): Promise<CleanupResult> {
      const { task, asset, protected: protectedAsset } = await withQueueTransaction(async tx => {
        await requireQueueLeaseTx(tx, context.lease);
        const task = await tx.mediaCleanupTask.findUniqueOrThrow({ where: { id: job.executionId } });
        if (task.queueRevision !== job.sourceRevision || task.leaseToken !== context.lease.token)
          throw new QueueContractError("QUEUE_CLEANUP_REVISION_CHANGED");
        const identity = { storageProvider: task.storageProvider, storageObjectId: task.storageObjectId };
        await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "MediaAsset"
          WHERE "storageProvider" = ${task.storageProvider} AND "storageObjectId" = ${task.storageObjectId} FOR UPDATE`);
        const asset = await tx.mediaAsset.findUnique({ where: { storageProvider_storageObjectId: identity } });
        let protectedAsset = false;
        if (asset) {
          const usage = await mediaAssetRepository.getAssetUsage(asset.ownerEmail, asset.id, tx);
          protectedAsset = Boolean(usage.graphIds.length || usage.operationIds.length || usage.generationRequestIds.length || usage.projectCoverIds.length ||
            (asset.status === "completed" && ["upload_session", "generation_input", "generation_output", "media_operation_output", "asset_delete"].includes(task.reason)));
          if (!protectedAsset && asset.status === "completed")
            await tx.mediaAsset.update({ where: { id: asset.id }, data: { status: "deleting" } });
        }
        return { task, asset, protected: protectedAsset };
      });
      if (protectedAsset) return { protected: true, assetId: asset?.id ?? null };
      await context.assertOwned();
      if (task.storageProvider === "legacy_url") await deleteHistoryStorageFile(null, task.storageUrl);
      else {
        if (task.storageProvider !== storage.name) throw new Error("MEDIA_CLEANUP_PROVIDER_UNSUPPORTED");
        await storage.delete(task.storageObjectId); // Adapter treats missing objects as success.
      }
      await context.assertOwned();
      return { protected: false, assetId: asset?.id ?? null };
    },
    async settleTx(tx, job, lease, value) {
      const result = value as CleanupResult;
      const task = await tx.mediaCleanupTask.findUniqueOrThrow({ where: { id: job.executionId } });
      if (task.queueRevision !== job.sourceRevision || task.leaseToken !== lease.token)
        throw new QueueContractError("QUEUE_CLEANUP_REVISION_CHANGED");
      if (result.protected) {
        if (result.assetId) await tx.mediaAsset.updateMany({
          where: { id: result.assetId, status: "deleting" }, data: { status: "completed" },
        });
        await tx.mediaCleanupTask.update({ where: { id: task.id }, data: {
          status: "linked", assetId: result.assetId, leaseToken: null, leaseUntil: null,
        } });
        return "protected";
      }
      if (result.assetId) {
        if (task.reason === "history_delete" || task.reason === "asset_delete") {
          await tx.mediaAsset.updateMany({ where: { id: result.assetId }, data: {
            status: "failed", storageUrl: null, legacyUrl: null, imageVariants: Prisma.DbNull, version: { increment: 1 },
          } });
        } else {
          await tx.mediaAsset.deleteMany({ where: { id: result.assetId, status: { in: ["deleting", "failed"] } } });
        }
      }
      await tx.mediaCleanupTask.update({ where: { id: task.id }, data: {
        status: "completed", leaseToken: null, leaseUntil: null, lastError: null,
      } });
      return "succeeded";
    },
    async failTx(tx, job, failure, retrying) {
      const task = await tx.mediaCleanupTask.findUnique({ where: { id: job.executionId } });
      if (!task || task.queueRevision !== job.sourceRevision) return;
      const attempt = job.currentAttemptId ? await tx.queueAttempt.findUnique({ where: { id: job.currentAttemptId } }) : null;
      await tx.mediaCleanupTask.update({ where: { id: task.id }, data: {
        status: retrying ? "pending" : "failed", retryAt: retrying ? cleanupRetryAt(new Date(), attempt?.cycleOrdinal ?? 1) : task.retryAt,
        lastError: failure.code, leaseToken: null, leaseUntil: null,
      } });
    },
    classifyFailure(error) {
      return { code: safeCleanupError(error), phase: "storage.delete", disposition: "retry", executionStopped: true };
    },
  };
}
