import { cycleAdmissions, consoleCycleTiming } from "./job-queue-console-timing";
import { Prisma } from "@prisma/client";
import { prisma } from "@/server/db/prisma";
import { queueJobKinds, type ConsoleOverview, type ConsoleOccupant, type ConsoleReason, type ConsoleResource, type ConsolePage, type ConsoleJob } from "@/shared/api/job-queue-console-contract";
import { queueKindDefinitions } from "./job-kind-registry";
import { encodeConsoleCursor, parseConsoleQuery, type ParsedConsoleQuery } from "./job-queue-console-query";
import { consoleJobSelect, projectConsoleJob, type ConsoleSource } from "./job-queue-console-projection";
import { getWorkerSupervisorState } from "@/server/runtime/worker-supervisor";

export type ConsoleReadTx = Prisma.TransactionClient;
/** No queue transaction helper: readers must complete while a worker holds the queue advisory lock. */
export function withConsoleRead<T>(read: (tx: ConsoleReadTx, sampledAt: Date) => Promise<T>) {
  return prisma.$transaction(async tx => {
    await tx.$executeRaw`SET TRANSACTION READ ONLY`;
    await tx.$executeRaw`SET LOCAL statement_timeout = '5s'`;
    const [clock] = await tx.$queryRaw<{ now: Date }[]>`SELECT transaction_timestamp() AS now`;
    return read(tx, clock.now);
  }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead, maxWait: 2000, timeout: 8000 });
}

// Only scheduling metadata, never model config, provider payloads or raw source JSON.
export const consoleResourceCte = Prisma.sql`resource_usage AS (
  SELECT r.key, r."modelKey", r."modelType",
    (r."modelKey" IS NOT NULL AND (m.id IS NULL OR NOT m."isActive" OR m.type <> r."modelType")) AS unavailable,
    CASE WHEN r."staticCapacity" IS NOT NULL THEN r."staticCapacity"
      WHEN m."isActive" AND m.type = r."modelType" THEN
        CASE WHEN jsonb_typeof(m.meta->'concurrent_limit') = 'number' AND (m.meta->>'concurrent_limit')::numeric > 0
          THEN GREATEST(1, floor((m.meta->>'concurrent_limit')::numeric))::float8 ELSE 1 END
      ELSE 0 END AS capacity,
    count(v."attemptId")::int AS reserved,
    count(v."attemptId") FILTER (WHERE v.disposition = 'uncertain')::int AS uncertain
  FROM "QueueResource" r LEFT JOIN "ModelCatalog" m ON m.key = r."modelKey"
  LEFT JOIN "QueueReservation" v ON v."resourceKey" = r.key AND v."releasedAt" IS NULL
  GROUP BY r.key, m.id, m."isActive", m.type, m.meta
)`;
export const consoleClassifiedCte = Prisma.sql`classified AS (
  SELECT j.id, j."createdAt", j.kind, j.status,
    CASE WHEN j.status IN ('ready','retry_wait') AND j."orderGroupId" IS NOT NULL AND
      (g."closedAt" IS NOT NULL OR g."headSequence" <> j.sequence OR (g."blockedByJobId" IS NOT NULL AND g."blockedByJobId" <> j.id))
      THEN 'blocked' ELSE j.status::text END AS state
  FROM "QueueJob" j LEFT JOIN "QueueOrderGroup" g ON g.id = j."orderGroupId"
)`;

/** One SQL join by indexed source ID for filtering; no full payload or in-memory paging. */
export function consoleSourceSql(type: Prisma.Sql, id: Prisma.Sql) {
  return Prisma.sql`(
    SELECT s.id, s.status::text, s."modelKey" AS model, s."graphNodeId" AS "nodeId", s."apiKeyId" IS NOT NULL AS external, s."requestId",
      (s."apiKeyId" IS NOT NULL OR EXISTS (SELECT 1 FROM "NodeExecutionSubmission" n WHERE n."executionId" = s."requestId")) AS receipt
      FROM "ImageGeneration" s WHERE ${type} = 'image_generation' AND s.id = ${id}
    UNION ALL SELECT s.id, s.status::text, s."modelKey", s."graphNodeId", s."apiKeyId" IS NOT NULL,s."requestId",
      (s."apiKeyId" IS NOT NULL OR EXISTS (SELECT 1 FROM "NodeExecutionSubmission" n WHERE n."executionId" = s."requestId"))
      FROM "VideoGeneration" s WHERE ${type} = 'video_generation' AND s.id = ${id}
    UNION ALL SELECT s.id, s.status::text, s."modelKey", s."graphNodeId", s."apiKeyId" IS NOT NULL,s."requestId",
      (s."apiKeyId" IS NOT NULL OR EXISTS (SELECT 1 FROM "NodeExecutionSubmission" n WHERE n."executionId" = s."requestId"))
      FROM "AudioGeneration" s WHERE ${type} = 'audio_generation' AND s.id = ${id}
    UNION ALL SELECT s.id, s.status::text, s."modelKey", s."graphNodeId", false,s.id,
      EXISTS (SELECT 1 FROM "NodeExecutionSubmission" n WHERE n."executionId" = s.id)
      FROM "AssistantExecution" s WHERE ${type} = 'assistant_execution' AND s.id = ${id}
    UNION ALL SELECT s.id, s.status::text, NULL, s."graphNodeId", false,s.id,
      EXISTS (SELECT 1 FROM "NodeExecutionSubmission" n WHERE n."executionId" = s.id)
      FROM "MediaOperation" s WHERE ${type} = 'media_operation' AND s.id = ${id}
    UNION ALL SELECT s.id, s.status::text, NULL, NULL, false,s."requestId", false
      FROM "MediaCleanupTask" s WHERE ${type} = 'storage_cleanup' AND s.id = ${id}
  )`;
}
export const consoleOriginSql = Prisma.sql`CASE WHEN s.id IS NULL THEN 'unknown' WHEN j."executionType" = 'storage_cleanup' THEN 'storage_cleanup'
  WHEN s.receipt THEN 'external_api' WHEN s."nodeId" IS NOT NULL THEN 'space' WHEN j."executionType" IN ('image_generation','video_generation','audio_generation') THEN 'classic' ELSE 'unknown' END`;

export async function hydrateConsoleJobs(tx: ConsoleReadTx, ids: string[], sampledAt: Date) {
  if (!ids.length) return [];
  const jobs = await tx.queueJob.findMany({ where: { id: { in: ids } }, select: consoleJobSelect });
  const metadata = await tx.$queryRaw<(ConsoleSource & { jobId: string })[]>(Prisma.sql`
    SELECT j.id AS "jobId", s.id, s.status, s.model, s."nodeId", n."graphId",s."requestId",original."requestId" AS "sourceRequestId", ${consoleOriginSql} AS origin,
      CASE WHEN jsonb_typeof(n.config->'presentation'->'customTitle') = 'string'
        THEN left(n.config->'presentation'->>'customTitle',200) ELSE NULL END AS title
    FROM "QueueJob" j LEFT JOIN LATERAL ${consoleSourceSql(Prisma.sql`j."executionType"::text`, Prisma.sql`j."executionId"`)} s ON true
    LEFT JOIN LATERAL ${consoleSourceSql(Prisma.sql`j."sourceType"::text`,Prisma.sql`j."sourceId"`)} original ON true
    LEFT JOIN "GenerationGraphNode" n ON n.id = s."nodeId" WHERE j.id IN (${Prisma.join(ids.map(id => Prisma.sql`${id}::uuid`))})`);
  const sources = new Map(metadata.map(s => [s.jobId, s]));
  const [admissions, timing] = await Promise.all([cycleAdmissions(tx,jobs.filter(j=>j.cycle>1).map(j=>({jobId:j.id,cycle:j.cycle}))),consoleCycleTiming(tx,ids)]);
  const admissionMap=new Map(admissions.map(a=>[a.jobId,a.admittedAt.toISOString()]));
  const timingMap=new Map(timing.map(a=>[a.jobId,a]));
  const risks = await tx.$queryRaw<{ jobId: string; unavailable: boolean; full: boolean }[]>(Prisma.sql`
    WITH ${consoleResourceCte} SELECT jr."jobId", bool_or(r.unavailable) AS unavailable, bool_or(r.reserved >= r.capacity) AS full
    FROM "QueueJobResource" jr JOIN resource_usage r ON r.key = jr."resourceKey"
    WHERE jr."jobId" IN (${Prisma.join(ids.map(id => Prisma.sql`${id}::uuid`))}) GROUP BY jr."jobId"`);
  const riskMap = new Map(risks.map(r => [r.jobId, r]));
  const runtime = await tx.queueRuntime.findUniqueOrThrow({ where: { id: 1 }, select: { mode: true } });
  const rows = new Map(jobs.map(job => {
    const reasons: ConsoleReason[] = [];
    if (job.status === "ready" || job.status === "retry_wait") {
      if (runtime.mode !== "shared") reasons.push("QUEUE_PAUSED");
      if (job.availableAt > sampledAt) reasons.push(job.status === "retry_wait" ? "RETRY_DELAY" : "SCHEDULED");
      const g = job.orderGroup;
      if (g?.closedAt) reasons.push("GROUP_CLOSED");
      else if (g && (g.headSequence !== job.sequence || g.blockedByJobId && g.blockedByJobId !== job.id)) reasons.push("GROUP_BLOCKED");
      const risk = riskMap.get(job.id);
      if (risk?.unavailable) reasons.push("MODEL_UNAVAILABLE");
      if (risk?.full) reasons.push("RESOURCE_FULL");
      if (job.cancelRequestedAt) reasons.push("CANCEL_REQUESTED");
      if (!reasons.length) reasons.push("CONDITIONS_PENDING");
    }
    return [job.id, {...projectConsoleJob(job, sources.get(job.id), reasons),cycleAdmittedAt:job.cycle===1?job.createdAt.toISOString():admissionMap.get(job.id)??null,cycleStartedAt:timingMap.get(job.id)?.startedAt?.toISOString()??null,attemptCount:timingMap.get(job.id)?.attemptCount??0}] as const;
  }));
  return ids.flatMap(id => rows.has(id) ? [rows.get(id)!] : []);
}

export function consoleJobsWhere(query: ParsedConsoleQuery, options: { dates?: boolean; current?: boolean; cursor?: boolean } = {}) {
  const { input, from, to, anchor, cursor } = query;
  const parts = [Prisma.sql`j."createdAt" <= ${anchor}`];
  if (options.dates !== false) parts.push(Prisma.sql`j."createdAt" <= ${to}`);
  if (options.current !== false && input.view === "current") parts.push(Prisma.sql`j.status IN ('suspended','ready','retry_wait','active','dead_letter','reconciliation_required')`);
  if (options.dates !== false && from) parts.push(Prisma.sql`j."createdAt" >= ${from}`);
  if (input.kind) parts.push(Prisma.sql`j.kind::text = ${input.kind}`);
  if (input.status) parts.push(Prisma.sql`c.state = ${input.status}`);
  if (input.model) parts.push(Prisma.sql`s.model = ${input.model}`);
  if (input.origin) parts.push(Prisma.sql`${consoleOriginSql} = ${input.origin}`);
  if (input.resource) parts.push(Prisma.sql`EXISTS (SELECT 1 FROM "QueueJobResource" jr WHERE jr."jobId" = j.id AND jr."resourceKey" = ${input.resource})`);
  if (input.worker) parts.push(Prisma.sql`EXISTS (SELECT 1 FROM "QueueAttempt" a WHERE a."jobId" = j.id AND a."workerInstanceId" = ${input.worker}::uuid)`);
  if (input.q) {
    // position() treats %, _ and backslashes literally instead of widening the scan.
    parts.push(Prisma.sql`(position(lower(${input.q}) in lower(j.id::text || ' ' || j."sourceId" || ' ' || j."executionId" || ' ' || COALESCE(s.model,'') || ' ' || COALESCE(s."requestId",''))) > 0
      OR EXISTS (SELECT 1 FROM ${consoleSourceSql(Prisma.sql`j."sourceType"::text`,Prisma.sql`j."sourceId"`)} original WHERE position(lower(${input.q}) in lower(COALESCE(original."requestId",'')))>0)
      OR EXISTS (SELECT 1 FROM "GenerationGraphNode" n WHERE n.id = s."nodeId" AND position(lower(${input.q}) in lower(COALESCE(n.config->'presentation'->>'customTitle',''))) > 0))`);
  }
  if (options.cursor !== false && cursor) parts.push(Prisma.sql`(j."createdAt",j.id) < (${new Date(cursor.at)},${cursor.id}::uuid)`);
  return Prisma.join(parts, " AND ");
}
export async function listConsoleJobs(raw: Parameters<typeof parseConsoleQuery>[0]): Promise<ConsolePage<ConsoleJob>> {
  return withConsoleRead(async (tx, sampledAt) => {
    const query = parseConsoleQuery(raw, sampledAt);
    const rows = await tx.$queryRaw<{ id: string; createdAt: Date }[]>(Prisma.sql`
      WITH ${consoleClassifiedCte} SELECT j.id, j."createdAt" FROM "QueueJob" j JOIN classified c ON c.id = j.id
      LEFT JOIN LATERAL ${consoleSourceSql(Prisma.sql`j."executionType"::text`, Prisma.sql`j."executionId"`)} s ON true
      WHERE ${consoleJobsWhere(query)} ORDER BY j."createdAt" DESC,j.id DESC LIMIT ${query.input.limit + 1}`);
    const page = rows.slice(0, query.input.limit);
    const last = page.at(-1);
    return { sampledAt: sampledAt.toISOString(), items: await hydrateConsoleJobs(tx, page.map(r => r.id), sampledAt),
      nextCursor: rows.length > page.length && last ? encodeConsoleCursor({ v: 1, scope: query.scope, filter: query.fingerprint,
        anchor: query.anchor.toISOString(), at: last.createdAt.toISOString(), id: last.id }) : null };
  });
}

export async function getConsoleOverview(): Promise<ConsoleOverview> {
  const snapshot = await withConsoleRead(async (tx, sampledAt) => {
    const runtime = await tx.queueRuntime.findUniqueOrThrow({ where: { id: 1 }, select: { mode: true, epoch: true, migrationVerified: true } });
    const states = await tx.$queryRaw<{ kind: ConsoleJob["kind"]; state: ConsoleJob["status"] | "blocked"; count: number; oldest: Date | null }[]>(Prisma.sql`
      WITH ${consoleClassifiedCte} SELECT kind,state,count(*)::int AS count,
        min("createdAt") FILTER (WHERE state IN ('ready','retry_wait','blocked')) AS oldest FROM classified GROUP BY kind,state`);
    const [dlq] = await tx.$queryRaw<{ unresolved: number; reconciliation: number }[]>`
      SELECT count(DISTINCT "jobId") FILTER (WHERE state IN ('open','redriven'))::int AS unresolved,
        count(DISTINCT "jobId") FILTER (WHERE state IN ('open','redriven') AND classification='reconciliation')::int AS reconciliation FROM "QueueDeadLetter"`;
    const [uncertain] = await tx.$queryRaw<{ count: number }[]>`
      SELECT count(DISTINCT a."jobId")::int AS count FROM "QueueReservation" v JOIN "QueueAttempt" a ON a.id=v."attemptId"
      WHERE v."releasedAt" IS NULL AND v.disposition='uncertain'`;
    const resources = await tx.$queryRaw<ConsoleResource[]>(Prisma.sql`WITH ${consoleResourceCte}
      SELECT key,"modelKey",capacity,reserved,uncertain,'database'::text AS "capacitySource",GREATEST(0,capacity-reserved)::float8 AS available,
        GREATEST(0,reserved-capacity)::float8 AS excess FROM resource_usage
      WHERE "modelKey" IS NULL OR reserved > 0 OR EXISTS (SELECT 1 FROM "QueueJobResource" jr JOIN "QueueJob" j ON j.id=jr."jobId"
        WHERE jr."resourceKey"=resource_usage.key AND j.status IN ('ready','retry_wait','active','reconciliation_required')) ORDER BY ("modelKey" IS NULL) DESC,key LIMIT 1001`);
    const resourcesTruncated = resources.length > 1000;
    if (resourcesTruncated) resources.length = 1000;
    // Include the four configured pools even before the first job registers a resource row.
    for (const definition of Object.values(queueKindDefinitions)) if (!resources.some(r => r.key === definition.pool)) {
      resources.push({ key: definition.pool, modelKey: null, capacity: definition.capacity, reserved: 0, uncertain: 0, available: definition.capacity, excess: 0, capacitySource: "policy_default" });
    }
    const held = await tx.$queryRaw<(Omit<ConsoleOccupant, "startedAt" | "finishedAt"> & { startedAt: Date; finishedAt: Date | null })[]>`
      SELECT v."resourceKey", a.id AS "attemptId", j.id AS "jobId", j.kind, j.status, a."executionId", a."workerInstanceId",
        v.disposition, a."startedAt", a."finishedAt" FROM "QueueReservation" v JOIN "QueueAttempt" a ON a.id=v."attemptId"
        JOIN "QueueJob" j ON j.id=a."jobId" WHERE v."releasedAt" IS NULL ORDER BY v."resourceKey",a."startedAt",a.id LIMIT 1001`;
    const occupantJobs=new Map((await hydrateConsoleJobs(tx,[...new Set(held.slice(0,1000).map(r=>r.jobId))],sampledAt)).map(j=>[j.id,j]));
    const byKind = Object.fromEntries(queueJobKinds.map(kind => [kind, { states: {}, oldestPendingAt: null }])) as ConsoleOverview["byKind"];
    for (const row of states) {
      byKind[row.kind].states[row.state] = row.count;
      if (row.oldest && (!byKind[row.kind].oldestPendingAt || row.oldest.toISOString() < byKind[row.kind].oldestPendingAt!)) byKind[row.kind].oldestPendingAt = row.oldest.toISOString();
    }
    return { sampledAt: sampledAt.toISOString(), scope: "database_global" as const, runtime, byKind,
      counts: { pending: states.filter(r => ["ready","retry_wait","blocked"].includes(r.state)).reduce((n,r) => n+r.count,0),
        active: states.filter(r => r.state === "active").reduce((n,r) => n+r.count,0), suspended: states.filter(r => r.state === "suspended").reduce((n,r) => n+r.count,0),
        unresolvedJobs: dlq.unresolved, reconciliationJobs: dlq.reconciliation, uncertainJobs: uncertain.count },
      resources, resourcesTruncated, occupants: held.slice(0,1000).map(r => ({ ...r, title:occupantJobs.get(r.jobId)?.title,model:occupantJobs.get(r.jobId)?.executionId===r.executionId?occupantJobs.get(r.jobId)?.model??null:null,origin:occupantJobs.get(r.jobId)?.origin, startedAt: r.startedAt.toISOString(), finishedAt: r.finishedAt?.toISOString() ?? null })), occupantsTruncated: held.length > 1000 };
  });
  const processState = getWorkerSupervisorState();
  return { ...snapshot, process: { scope: "responding_process", sampledAt: new Date().toISOString(), started: processState.started,
    stopping: processState.stopping, workerInstanceId: processState.queue.workerInstanceId,
    lastHeartbeatAt: processState.queue.lastHeartbeatAt, heartbeatAgeSeconds: processState.queue.heartbeatAgeSeconds } };
}
