import type { QueueHandler } from "./job-queue-handler";
import { QUEUE_SCAN_LIMIT, type QueueJobKind } from "./contracts";
import { failQueueAttemptTx, blockQueueGroupTx } from "./job-queue-settlement";
import { queueDatabaseNow, withQueueTransaction, type QueueTransaction } from "./job-queue-transaction";

export async function recoverExpiredQueueAttempts(handlers: ReadonlyMap<QueueJobKind, QueueHandler>) {
  return withQueueTransaction(async tx => {
    const now = await queueDatabaseNow(tx);
    const expired = await tx.queueAttempt.findMany({
      where: { finishedAt: null, leaseUntil: { lte: now } },
      include: { job: true }, orderBy: { leaseUntil: "asc" }, take: QUEUE_SCAN_LIMIT,
    });
    for (const a of expired) {
      const handler = handlers.get(a.job.kind);
      // A claimed attempt never entered execute: all I/O is after remote_started.
      const stopped = a.phase === "claimed";
      await failQueueAttemptTx(tx, a.job, a.id, {
        code: "QUEUE_LEASE_EXPIRED", phase: "recovery",
        disposition: stopped ? "terminal" : "reconciliation",
        executionStopped: stopped,
        remoteEvidenceRef: a.remoteEvidenceRef ?? undefined,
      }, now, handler);
    }
    return expired.length;
  });
}

export async function requestQueueCancellationTx(tx: QueueTransaction, jobId: string) {
  const now = await queueDatabaseNow(tx);
  const job = await tx.queueJob.findUniqueOrThrow({ where: { id: jobId } });
  if (["succeeded", "cancelled", "abandoned"].includes(job.status)) return job;
  if (job.status === "active" || job.status === "reconciliation_required") {
    return tx.queueJob.update({ where: { id: jobId }, data: { cancelRequestedAt: now, version: { increment: 1 } } });
  }
  await blockQueueGroupTx(tx, job);
  return tx.queueJob.update({ where: { id: jobId }, data: { status: "cancelled", cancelRequestedAt: now, version: { increment: 1 } } });
}
