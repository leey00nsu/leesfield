import { expireStaleSubmissions } from "@/server/generation-admission/submission-ledger";
import { mediaAssetRepository } from "@/server/media-assets/media-asset-repository";
import { activateExpiredCleanupIntents } from "@/server/media-assets/media-cleanup-repository";
import { prisma } from "@/server/db/prisma";
import { cancelClosedQueueGroups } from "./job-queue-operations";
import { purgeResolvedQueueDetails } from "./job-queue-retention";

let nextSweepAt = 0;
let nextRetentionAt = 0;
export async function sweepQueueMaintenance() {
  if (Date.now() < nextSweepAt) return;
  if ((await prisma.queueRuntime.findUnique({ where: { id: 1 } }))?.mode !== "shared") return;
  const now = new Date();
  await expireStaleSubmissions(now, 100);
  await mediaAssetRepository.expireUploads(now, 100);
  await activateExpiredCleanupIntents(now, 100);
  await cancelClosedQueueGroups();
  if (Date.now() >= nextRetentionAt) {
    await purgeResolvedQueueDetails(now);
    nextRetentionAt = Date.now() + 86_400_000;
  }
  nextSweepAt = Date.now() + 10_000;
}
