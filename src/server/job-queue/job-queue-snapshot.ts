import { Prisma } from "@prisma/client";
import { prisma } from "@/server/db/prisma";
import { queueJobKinds, type QueueJobKind } from "./contracts";

export type QueueKindSnapshot = {
  ready: number; retryWait: number; blocked: number; active: number; suspended: number;
  finalFailed: number; reconciliationRequired: number; succeeded: number; cancelled: number; abandoned: number;
  oldestPendingAgeSeconds: number | null; attempts: number; leaseLosses: number;
};
type StateRow = { kind: QueueJobKind; state: string; count: number; oldest: Date | null };
type AttemptRow = { kind: QueueJobKind; attempts: number; leaseLosses: number };
type DlqRow = { state: string; classification: string; count: number; oldest: Date | null };
type ResourceRow = { key: string; capacity: number; reserved: number; uncertain: number };
const age = (date: Date | null, now: number) => date ? Math.max(0, Math.floor((now - date.getTime()) / 1000)) : null;
const stateField: Record<string, keyof QueueKindSnapshot> = {
  ready: "ready", retry_wait: "retryWait", blocked: "blocked", active: "active", suspended: "suspended",
  dead_letter: "finalFailed", reconciliation_required: "reconciliationRequired", succeeded: "succeeded", cancelled: "cancelled", abandoned: "abandoned",
};
function emptyKind(): QueueKindSnapshot {
  return { ready: 0, retryWait: 0, blocked: 0, active: 0, suspended: 0, finalFailed: 0, reconciliationRequired: 0,
    succeeded: 0, cancelled: 0, abandoned: 0, oldestPendingAgeSeconds: null, attempts: 0, leaseLosses: 0 };
}

/** Queue tables alone define queue depth; DLQ entries are a separate history view. */
export async function getSharedQueueSnapshot() {
  const now = Date.now();
  const [runtime, states, attempts, deadLetters, resources, errors, actions] = await Promise.all([
    prisma.queueRuntime.findUniqueOrThrow({ where: { id: 1 }, select: { mode: true, epoch: true, migrationVerified: true } }),
    prisma.$queryRaw<StateRow[]>(Prisma.sql`
      WITH classified AS (
        SELECT j.*, CASE WHEN j.status IN ('ready','retry_wait') AND j."orderGroupId" IS NOT NULL
          AND (g."closedAt" IS NOT NULL OR g."headSequence" <> j.sequence
            OR (g."blockedByJobId" IS NOT NULL AND g."blockedByJobId" <> j.id))
          THEN 'blocked' ELSE j.status::text END AS queue_state
        FROM "QueueJob" j LEFT JOIN "QueueOrderGroup" g ON g.id = j."orderGroupId"
      )
      SELECT kind, queue_state AS state, count(*)::int AS count,
        min("createdAt") FILTER (WHERE queue_state IN ('ready','retry_wait','blocked')) AS oldest
      FROM classified GROUP BY kind, queue_state`),
    prisma.$queryRaw<AttemptRow[]>(Prisma.sql`
      SELECT j.kind, count(a.id)::int AS attempts,
        count(d.id) FILTER (WHERE d."safeErrorCode" = 'QUEUE_LEASE_EXPIRED')::int AS "leaseLosses"
      FROM "QueueAttempt" a JOIN "QueueJob" j ON j.id = a."jobId"
      LEFT JOIN "QueueDeadLetter" d ON d."failedAttemptId" = a.id GROUP BY j.kind`),
    prisma.$queryRaw<DlqRow[]>(Prisma.sql`
      SELECT state, classification, count(*)::int AS count, min("createdAt") AS oldest
      FROM "QueueDeadLetter" GROUP BY state, classification`),
    prisma.$queryRaw<ResourceRow[]>(Prisma.sql`
      SELECT r.key,
        CASE WHEN r."staticCapacity" IS NOT NULL THEN r."staticCapacity"
          WHEN m."isActive" AND m.type = r."modelType" THEN
            CASE WHEN jsonb_typeof(m.meta->'concurrent_limit') = 'number' AND (m.meta->>'concurrent_limit')::numeric > 0
              THEN LEAST(1000000, GREATEST(1, floor((m.meta->>'concurrent_limit')::numeric)))::int ELSE 1 END
          ELSE 0 END AS capacity,
        count(v."attemptId") FILTER (WHERE v."releasedAt" IS NULL)::int AS reserved,
        count(v."attemptId") FILTER (WHERE v."releasedAt" IS NULL AND v.disposition = 'uncertain')::int AS uncertain
      FROM "QueueResource" r LEFT JOIN "QueueReservation" v ON v."resourceKey" = r.key
      LEFT JOIN "ModelCatalog" m ON m.key = r."modelKey"
      WHERE EXISTS (SELECT 1 FROM "QueueJobResource" jr JOIN "QueueJob" j ON j.id = jr."jobId"
        WHERE jr."resourceKey" = r.key AND j.status IN ('ready','retry_wait','active','reconciliation_required'))
        OR EXISTS (SELECT 1 FROM "QueueReservation" held WHERE held."resourceKey" = r.key AND held."releasedAt" IS NULL)
      GROUP BY r.key, r."staticCapacity", r."modelType", m."isActive", m.type, m.meta ORDER BY r.key LIMIT 1000`),
    prisma.queueDeadLetter.groupBy({ by: ["safeErrorCode", "classification"], _count: { _all: true },
      orderBy: { safeErrorCode: "asc" }, take: 100 }),
    prisma.queueAdminAction.groupBy({ by: ["action", "outcome"], _count: { _all: true } }),
  ]);
  const byKind = Object.fromEntries(queueJobKinds.map(kind => [kind, emptyKind()])) as Record<QueueJobKind, QueueKindSnapshot>;
  for (const row of states) {
    const item = byKind[row.kind];
    const field = stateField[row.state];
    if (field && field !== "oldestPendingAgeSeconds") item[field] = row.count;
    const oldest = age(row.oldest, now);
    if (oldest !== null) item.oldestPendingAgeSeconds = Math.max(item.oldestPendingAgeSeconds ?? 0, oldest);
  }
  for (const row of attempts) { byKind[row.kind].attempts = row.attempts; byKind[row.kind].leaseLosses = row.leaseLosses; }
  const kinds = Object.values(byKind);
  const pendingAges = kinds.map(k => k.oldestPendingAgeSeconds).filter((v): v is number => v !== null);
  const unresolved = deadLetters.filter(d => d.state === "open" || d.state === "redriven");
  const unresolvedAges = unresolved.map(d => age(d.oldest, now)).filter((v): v is number => v !== null);
  return {
    updatedAt: new Date(now).toISOString(), runtime,
    pending: kinds.reduce((n, k) => n + k.ready + k.retryWait + k.blocked, 0),
    processing: kinds.reduce((n, k) => n + k.active, 0),
    oldestPendingAgeSeconds: pendingAges.length ? Math.max(...pendingAges) : null,
    byKind, resources,
    deadLetters: { unresolved: unresolved.reduce((n, d) => n + d.count, 0),
      reconciliation: unresolved.filter(d => d.classification === "reconciliation").reduce((n, d) => n + d.count, 0),
      oldestUnresolvedAgeSeconds: unresolvedAges.length ? Math.max(...unresolvedAges) : null,
      states: deadLetters.map(({ state, classification, count }) => ({ state, classification, count })),
      errors: errors.map(e => ({ code: e.safeErrorCode, classification: e.classification, count: e._count._all })) },
    actions: actions.map(a => ({ action: a.action, outcome: a.outcome, count: a._count._all })),
  };
}
export type SharedQueueSnapshot = Awaited<ReturnType<typeof getSharedQueueSnapshot>>;
