import { randomUUID } from "node:crypto";
import { Prisma, type QueueJob } from "@prisma/client";
import {
  QUEUE_LEASE_MS, queueJobKinds, type QueueLease,
} from "./contracts";
import {
  queueDatabaseNow, withQueueTransaction, type QueueTransaction,
} from "./job-queue-transaction";

export type ClaimedQueueJob = {
  job: QueueJob;
  lease: QueueLease;
  attemptId: string;
};

/** Model cap is read from the database while holding a shared model-row lock. */
function modelCapacity(meta: unknown) {
  if (meta && typeof meta === "object" && !Array.isArray(meta)) {
    const v = (meta as Record<string, unknown>).concurrent_limit;
    if (typeof v === "number" && Number.isFinite(v) && v > 0) return Math.max(1, Math.floor(v));
  }
  return 1;
}

async function availableResources(tx: QueueTransaction, jobId: string) {
  const requirements = await tx.queueJobResource.findMany({
    where: { jobId }, include: { resource: true }, orderBy: { resourceKey: "asc" },
  });
  if (!requirements.length) return false;
  for (const { resource } of requirements) {
    let capacity = resource.staticCapacity ?? 0;
    if (resource.modelKey && resource.modelType) {
      await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "ModelCatalog" WHERE "key" = ${resource.modelKey} FOR SHARE`);
      const model = await tx.modelCatalog.findUnique({ where: { key: resource.modelKey } });
      if (!model?.isActive || model.type !== resource.modelType) return false;
      capacity = modelCapacity(model.meta);
    }
    const used = await tx.queueReservation.count({ where: { resourceKey: resource.key, releasedAt: null } });
    if (used >= capacity) return false;
  }
  return true;
}

export async function claimQueueJob(
  workerInstanceId: string,
  prepareTx?: (tx: QueueTransaction, job: QueueJob, lease: QueueLease) => Promise<void>,
): Promise<ClaimedQueueJob | null> {
  return withQueueTransaction(async tx => {
    const runtime = await tx.queueRuntime.findUnique({ where: { id: 1 } });
    if (runtime?.mode !== "shared") return null;
    const now = await queueDatabaseNow(tx);
    for (let offset = 0; offset < queueJobKinds.length; offset++) {
      const index = (runtime.nextKindCursor + offset) % queueJobKinds.length;
      const kind = queueJobKinds[index]!;
      // Exclude saturated resources BEFORE LIMIT: a blocked prefix cannot starve
      // another model. Check again with model FOR SHARE before making a claim.
      const candidates = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
        SELECT j."id" FROM "QueueJob" j
        LEFT JOIN "QueueOrderGroup" g ON g."id" = j."orderGroupId"
        WHERE j."kind" = ${kind}::"QueueJobKind"
          AND j."status" IN ('ready','retry_wait') AND j."availableAt" <= ${now}
          AND j."cancelRequestedAt" IS NULL
          AND (j."orderGroupId" IS NULL OR (
            g."closedAt" IS NULL AND g."headSequence" = j."sequence"
            AND (g."blockedByJobId" IS NULL OR g."blockedByJobId" = j."id")
          ))
          AND EXISTS (SELECT 1 FROM "QueueJobResource" jr WHERE jr."jobId" = j."id")
          AND NOT EXISTS (
            SELECT 1 FROM "QueueJobResource" jr
            JOIN "QueueResource" r ON r."key" = jr."resourceKey"
            LEFT JOIN "ModelCatalog" m ON m."key" = r."modelKey" AND m."type" = r."modelType"
            WHERE jr."jobId" = j."id" AND (
              (r."modelKey" IS NOT NULL AND (m."id" IS NULL OR NOT m."isActive"))
              OR (SELECT count(*) FROM "QueueReservation" v
                  WHERE v."resourceKey" = r."key" AND v."releasedAt" IS NULL) >=
                  COALESCE(r."staticCapacity", CASE
                    WHEN jsonb_typeof(m."meta"->'concurrent_limit') = 'number'
                      AND (m."meta"->>'concurrent_limit')::numeric > 0
                    THEN GREATEST(1, floor((m."meta"->>'concurrent_limit')::numeric))
                    ELSE 1 END)
            )
          )
        ORDER BY j."availableAt", j."createdAt", j."id"
        LIMIT 60 FOR UPDATE OF j SKIP LOCKED
      `);
      for (const { id } of candidates) {
        if (!await availableResources(tx, id)) continue;
        const job = await tx.queueJob.findUniqueOrThrow({ where: { id } });
        const last = await tx.queueAttempt.findFirst({ where: { jobId: id }, orderBy: { lifetimeOrdinal: "desc" } });
        const previousCycle = await tx.queueAttempt.count({ where: { jobId: id, cycle: job.cycle } });
        if (previousCycle >= job.maxAttempts) continue;
        const attemptId = randomUUID();
        const lease: QueueLease = {
          jobId: id, attemptId, token: randomUUID(),
          version: job.version + 1, runtimeEpoch: runtime.epoch,
        };
        await tx.queueAttempt.create({ data: {
          id: attemptId, jobId: id, lifetimeOrdinal: (last?.lifetimeOrdinal ?? 0) + 1,
          cycle: job.cycle, cycleOrdinal: previousCycle + 1,
          executionType: job.executionType, executionId: job.executionId, workerInstanceId,
          leaseToken: lease.token, leaseVersion: lease.version,
          leaseUntil: new Date(now.getTime() + QUEUE_LEASE_MS), runtimeEpoch: runtime.epoch,
          heartbeatAt: now, startedAt: now,
        } });
        const resources = await tx.queueJobResource.findMany({ where: { jobId: id } });
        await tx.queueReservation.createMany({ data: resources.map(r => ({ attemptId, resourceKey: r.resourceKey })) });
        const claimed = await tx.queueJob.update({ where: { id }, data: { status: "active", currentAttemptId: attemptId, version: lease.version } });
        if (prepareTx) await prepareTx(tx, claimed, lease);
        await tx.queueRuntime.update({ where: { id: 1 }, data: { nextKindCursor: (index + 1) % queueJobKinds.length } });
        return { job: claimed, lease, attemptId };
      }
    }
    return null;
  });
}
