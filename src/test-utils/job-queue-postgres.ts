import { queueDatabaseNow, withQueueTransaction } from "@/server/job-queue/job-queue-transaction";
import { beforeAll, afterAll } from "vitest";
import { randomUUID } from "node:crypto";
import { prisma } from "@/server/db/prisma";
import { queueScopeDigest } from "@/server/job-queue/job-queue-registration";
import { Prisma } from "@prisma/client";
import { claimQueueJob } from "@/server/job-queue/job-queue-scheduler";
import type { QueueHandler } from "@/server/job-queue/job-queue-handler";

/** Explicitly activate the disposable DB and clean only the owning fixture. */
export function useSharedQueueFixture(owners: () => string[]) {
  beforeAll(async () => {
    await prisma.queueRuntime.update({ where: { id: 1 }, data: { mode: "shared", migrationVerified: true } });
  });
  afterAll(async () => {
    try {
      const jobs = await prisma.queueJob.findMany({ where: { ownerScopeDigest: { in: owners().map(queueScopeDigest) } }, select: { sourceId: true } });
      await removeFixtureQueueJobs(jobs.map(j => j.sourceId));
    } finally {
      await prisma.queueRuntime.update({ where: { id: 1 }, data: { mode: "paused", migrationVerified: false } });
    }
  });
}
export async function claimFixtureQueueJob(handler: QueueHandler) {
  const claimed = await claimQueueJob(randomUUID(), (tx, job, lease) => handler.prepareTx(tx, job, lease));
  if (!claimed) throw new Error("FIXTURE_QUEUE_JOB_NOT_CLAIMED");
  return claimed;
}

/** Remove only this fixture's queue history after its runners have drained. */
export function removeFixtureQueueJobs(sourceIds: string[]) {
  return withQueueTransaction(async tx => {
    const ids = (await tx.queueJob.findMany({ where: { sourceId: { in: sourceIds } }, select: { id: true } })).map(j => j.id);
    await tx.queueAttempt.updateMany({ where: { jobId: { in: ids }, finishedAt: null }, data: { phase: "ended", outcome: "cancelled", finishedAt: await queueDatabaseNow(tx) } });
    await tx.queueJob.updateMany({ where: { id: { in: ids } }, data: { status: "cancelled", currentAttemptId: null } });
    await tx.queueAdminAction.deleteMany({ where: { jobId: { in: ids } } });
    await tx.queueDeadLetter.deleteMany({ where: { jobId: { in: ids } } });
    await tx.queueReservation.deleteMany({ where: { attempt: { jobId: { in: ids } } } });
    await tx.queueAttempt.deleteMany({ where: { jobId: { in: ids } } });
    await tx.queueJobResource.deleteMany({ where: { jobId: { in: ids } } });
    await tx.queueOrderGroup.updateMany({ where: { blockedByJobId: { in: ids } }, data: { blockedByJobId: null } });
    await tx.queueJob.deleteMany({ where: { id: { in: ids } } });
  });
}

/** Expire a live fixture with a valid lease interval on the database clock. */
export async function expireFixtureQueueAttempt(attemptId: string) {
  return expireFixtureQueueAttempts([attemptId]);
}
export async function expireFixtureQueueAttempts(attemptIds: string[]) {
  if (!attemptIds.length) return;
  const changed = await prisma.$executeRaw(Prisma.sql`
    UPDATE "QueueAttempt"
    SET "startedAt" = CURRENT_TIMESTAMP - INTERVAL '2 minutes',
        "leaseUntil" = CURRENT_TIMESTAMP - INTERVAL '1 second'
    WHERE id IN (${Prisma.join(attemptIds.map(id => Prisma.sql`${id}::uuid`))}) AND "finishedAt" IS NULL`);
  if (changed !== attemptIds.length) throw new Error("FIXTURE_QUEUE_ATTEMPT_NOT_ACTIVE");
}
