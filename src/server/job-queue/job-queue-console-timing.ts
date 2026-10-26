import { Prisma } from "@prisma/client";
import type { ConsoleReadTx } from "./job-queue-console-repository";

export async function cycleAdmissions(tx: ConsoleReadTx, targets: { jobId: string; cycle: number }[]) {
  if (!targets.length) return [];
  return tx.$queryRaw<{ jobId: string; cycle: number; admittedAt: Date }[]>(Prisma.sql`
    SELECT DISTINCT ON (a."jobId", a.after->>'cycle') a."jobId", (a.after->>'cycle')::int AS cycle, a."createdAt" AS "admittedAt"
    FROM "QueueAdminAction" a WHERE (a."jobId",a.after->>'cycle') IN (${Prisma.join(targets.map(t => Prisma.sql`(${t.jobId}::uuid,${String(t.cycle)})`))})
      AND a.action='redrive' AND a.outcome='succeeded' AND jsonb_typeof(a.after->'cycle')='number'
      AND (a.after->>'cycle') ~ '^[0-9]{1,9}$' ORDER BY a."jobId", a.after->>'cycle',a."createdAt",a.id`);
}

/** Read only the requested jobs. Imported attempts do not prove an actual start. */
export async function consoleCycleTiming(tx: ConsoleReadTx, ids: string[]) {
  if (!ids.length) return [];
  return tx.$queryRaw<{ jobId: string; cycle: number; startedAt: Date | null; attemptCount: number }[]>(Prisma.sql`
    SELECT j.id AS "jobId", j.cycle,
      CASE WHEN d.detail->>'imported'='true' THEN NULL ELSE a."startedAt" END AS "startedAt",
      (SELECT count(*)::int FROM "QueueAttempt" total WHERE total."jobId"=j.id) AS "attemptCount"
    FROM "QueueJob" j LEFT JOIN "QueueAttempt" a
      ON a."jobId"=j.id AND a.cycle=j.cycle AND a."cycleOrdinal"=1
    LEFT JOIN "QueueDeadLetter" d ON d."failedAttemptId"=a.id
    WHERE j.id IN (${Prisma.join(ids.map(id => Prisma.sql`${id}::uuid`))})`);
}
