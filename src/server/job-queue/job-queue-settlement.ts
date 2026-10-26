import type { QueueJob } from "@prisma/client";
import { QueueContractError, type QueueFailure, type QueueLease } from "./contracts";
import type { QueueHandler } from "./job-queue-handler";
import { requireQueueLeaseTx } from "./job-queue-lease";
import { withQueueTransaction, type QueueTransaction } from "./job-queue-transaction";

const safeCode = (code: string) => /^[A-Z][A-Z0-9_]{0,119}$/.test(code) ? code : "QUEUE_JOB_FAILED";
const safePhase = (phase: string) => /^[a-zA-Z0-9_.-]{1,80}$/.test(phase) ? phase : "execute";

export async function releaseQueueReservationsTx(tx: QueueTransaction, attemptId: string, now: Date) {
  await tx.queueReservation.updateMany({ where: { attemptId, releasedAt: null }, data: { releasedAt: now } });
}

export async function blockQueueGroupTx(tx: QueueTransaction, job: QueueJob) {
  if (job.orderGroupId && job.sequence !== null) await tx.queueOrderGroup.updateMany({
    where: { id: job.orderGroupId, headSequence: job.sequence }, data: { blockedByJobId: job.id, version: { increment: 1 } },
  });
}

export function settleQueueSuccess(lease: QueueLease, handler: QueueHandler, result: unknown) {
  return withQueueTransaction(async tx => {
    const { job, now } = await requireQueueLeaseTx(tx, lease);
    const outcome = await handler.settleTx(tx, job, lease, result);
    await tx.queueAttempt.update({ where: { id: lease.attemptId }, data: {
      phase: "ended", outcome: outcome === "protected" ? "protected" : "succeeded", finishedAt: now,
    } });
    await tx.queueJob.update({ where: { id: job.id }, data: {
      status: outcome === "protected" ? "cancelled" : "succeeded", version: { increment: 1 },
    } });
    await releaseQueueReservationsTx(tx, lease.attemptId, now);
    if (outcome === "protected") await blockQueueGroupTx(tx, job);
    if (outcome === "succeeded" && job.orderGroupId) {
      await tx.queueOrderGroup.update({ where: { id: job.orderGroupId }, data: {
        headSequence: { increment: 1 }, blockedByJobId: null, version: { increment: 1 },
      } });
      const next = await tx.queueJob.findUnique({ where: { orderGroupId_sequence: {
        orderGroupId: job.orderGroupId, sequence: job.sequence! + BigInt(1),
      } } });
      if (next && ["cancelled", "dead_letter", "reconciliation_required", "abandoned"].includes(next.status))
        await blockQueueGroupTx(tx, next);
    }
    if (outcome === "succeeded") await tx.queueDeadLetter.updateMany({
      where: { jobId: job.id, state: "redriven" },
      data: { state: "resolved", resolvedAt: now },
    });
    return outcome;
  });
}

export async function failQueueAttemptTx(
  tx: QueueTransaction, job: QueueJob, attemptId: string, failure: QueueFailure,
  now: Date, handler?: QueueHandler,
) {
  const attempt = await tx.queueAttempt.findUniqueOrThrow({ where: { id: attemptId } });
  if (attempt.finishedAt) return;
  const uncertain = !failure.executionStopped || failure.disposition === "reconciliation";
  const retrying = !uncertain && failure.disposition === "retry" && attempt.cycleOrdinal < job.maxAttempts && !job.cancelRequestedAt;
  const cancelled = !uncertain && Boolean(job.cancelRequestedAt);
  const code = safeCode(failure.code);
  const classified = { ...failure, code, phase: safePhase(failure.phase) };
  if (handler) await handler.failTx(tx, job, classified, retrying);
  await tx.queueAttempt.update({ where: { id: attemptId }, data: {
    phase: "ended", finishedAt: now,
    outcome: uncertain ? "reconciliation_required" : cancelled ? "cancelled" : retrying ? "retrying" : "failed",
    ...(failure.remoteEvidenceRef ? { remoteEvidenceRef: failure.remoteEvidenceRef } : {}),
  } });
  const delay = Math.min(3_600_000, job.retryDelayMs * 2 ** Math.min(16, attempt.cycleOrdinal - 1));
  await tx.queueJob.update({ where: { id: job.id }, data: {
    status: uncertain ? "reconciliation_required" : cancelled ? "cancelled" : retrying ? "retry_wait" : "dead_letter",
    availableAt: retrying ? new Date(now.getTime() + delay) : job.availableAt,
    version: { increment: 1 },
  } });
  if (uncertain) {
    await tx.queueReservation.updateMany({ where: { attemptId, releasedAt: null }, data: { disposition: "uncertain" } });
  } else await releaseQueueReservationsTx(tx, attemptId, now);
  if (!retrying) await blockQueueGroupTx(tx, job);
  if (!cancelled && !retrying) {
    // Previous redriven records remain unresolved until a later success;
    // reaching another DLQ is not a successful resolution of their failure.
    await tx.queueDeadLetter.upsert({
      where: { failedAttemptId: attemptId }, update: {},
      create: {
        jobId: job.id, failedAttemptId: attemptId,
        classification: uncertain ? "reconciliation" : "terminal",
        safeErrorCode: code, phase: classified.phase,
        detail: { cycle: attempt.cycle, cycleOrdinal: attempt.cycleOrdinal, maxAttempts: job.maxAttempts },
      },
    });
  }
}

export function settleQueueFailure(lease: QueueLease, handler: QueueHandler, failure: QueueFailure) {
  return withQueueTransaction(async tx => {
    const { job, now } = await requireQueueLeaseTx(tx, lease, true);
    await failQueueAttemptTx(tx, job, lease.attemptId, failure, now, handler);
  });
}

export function isQueueControlError(error: unknown) {
  return error instanceof QueueContractError &&
    ["QUEUE_LEASE_LOST", "QUEUE_CANCEL_REQUESTED"].includes(error.code);
}
