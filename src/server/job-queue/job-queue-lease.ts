import { Prisma } from "@prisma/client";
import { QUEUE_LEASE_MS, QueueContractError, type QueueLease } from "./contracts";
import { queueDatabaseNow, withQueueTransaction, type QueueTransaction } from "./job-queue-transaction";

export async function requireQueueLeaseTx(tx: QueueTransaction, lease: QueueLease, allowCancellation = false) {
  const now = await queueDatabaseNow(tx);
  const job = await tx.queueJob.findUnique({ where: { id: lease.jobId }, include: { currentAttempt: true } });
  const a = job?.currentAttempt;
  const runtime = await tx.queueRuntime.findUnique({ where: { id: 1 } });
  if (!job || job.status !== "active" || !a || a.id !== lease.attemptId ||
      a.leaseToken !== lease.token || a.leaseVersion !== lease.version ||
      a.runtimeEpoch !== lease.runtimeEpoch || runtime?.epoch !== lease.runtimeEpoch ||
      a.finishedAt || a.leaseUntil <= now) {
    throw new QueueContractError("QUEUE_LEASE_LOST");
  }
  if (!allowCancellation && job.cancelRequestedAt) throw new QueueContractError("QUEUE_CANCEL_REQUESTED");
  return { job, attempt: a, now };
}

export function assertQueueLease(lease: QueueLease) {
  return withQueueTransaction(tx => requireQueueLeaseTx(tx, lease)).then(() => undefined);
}

export function renewQueueLease(lease: QueueLease) {
  return withQueueTransaction(async tx => {
    const { attempt, now, job } = await requireQueueLeaseTx(tx, lease, true);
    if (job.cancelRequestedAt) throw new QueueContractError("QUEUE_CANCEL_REQUESTED");
    await tx.queueAttempt.update({ where: { id: attempt.id }, data: {
      heartbeatAt: now, leaseUntil: new Date(now.getTime() + QUEUE_LEASE_MS),
    } });
  });
}

export function markQueueExternalStart(lease: QueueLease) {
  return withQueueTransaction(async tx => {
    await requireQueueLeaseTx(tx, lease);
    await tx.queueAttempt.update({ where: { id: lease.attemptId }, data: { phase: "remote_started" } });
  });
}

export function recordQueueRemoteEvidence(lease: QueueLease, reference: string) {
  if (!reference || reference.length > 400 || /[\r\n]/.test(reference)) {
    throw new QueueContractError("QUEUE_REMOTE_REFERENCE_INVALID");
  }
  return withQueueTransaction(async tx => {
    await requireQueueLeaseTx(tx, lease, true);
    await tx.queueAttempt.update({ where: { id: lease.attemptId }, data: { remoteEvidenceRef: reference } });
  });
}

/** For bounded recovery/maintenance; values stay parameterized. */
export async function lockQueueJobRow(tx: QueueTransaction, jobId: string) {
  await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "QueueJob" WHERE "id" = ${jobId}::uuid FOR UPDATE`);
}
