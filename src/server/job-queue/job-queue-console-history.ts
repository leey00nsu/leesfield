import { cycleAdmissions } from "./job-queue-console-timing";
import { getConsoleCleanup } from "./job-queue-console-cleanup";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { consoleChildQuerySchema, consoleFailedQuerySchema, type ConsoleAction, type ConsoleAttempt, type ConsoleDeadLetter, type ConsoleFailedJob,
  type ConsoleJobDetail, type ConsolePage, type ConsoleTimeline } from "@/shared/api/job-queue-console-contract";
import { consoleClassifiedCte, consoleJobsWhere, consoleSourceSql, hydrateConsoleJobs, withConsoleRead, type ConsoleReadTx } from "./job-queue-console-repository";
import { encodeConsoleCursor, parseConsoleQuery, type ParsedConsoleQuery } from "./job-queue-console-query";

export type ConsoleChild = "attempts" | "dead-letters" | "actions";
const safeCode = (value: string | null) => value && /^[A-Z][A-Z0-9_]{0,119}$/.test(value) ? value : "UNKNOWN";
const iso = (value: Date | null) => value?.toISOString() ?? null;
export const consoleDeadLetterSelect = { id: true, jobId: true, failedAttemptId: true, classification: true, state: true,
  safeErrorCode: true, phase: true, version: true, createdAt: true, resolvedAt: true, detailPurgedAt: true } satisfies Prisma.QueueDeadLetterSelect;
type DeadLetterRow = Prisma.QueueDeadLetterGetPayload<{ select: typeof consoleDeadLetterSelect }>;
export function projectConsoleDeadLetter(row: DeadLetterRow): ConsoleDeadLetter {
  return { ...row, safeErrorCode: safeCode(row.safeErrorCode), phase: /^[a-zA-Z0-9_.:-]{1,80}$/.test(row.phase) ? row.phase : "unknown",
    createdAt: row.createdAt.toISOString(), resolvedAt: iso(row.resolvedAt), detailPurgedAt: iso(row.detailPurgedAt) };
}
export const consoleAttemptSelect = { id: true, jobId: true, lifetimeOrdinal: true, cycle: true, cycleOrdinal: true, executionType: true,
  executionId: true, workerInstanceId: true, phase: true, outcome: true, startedAt: true, finishedAt: true, heartbeatAt: true, leaseUntil: true,
  reservations: { select: { resourceKey: true, disposition: true, createdAt: true, releasedAt: true }, orderBy: { resourceKey: "asc" } },
} satisfies Prisma.QueueAttemptSelect;
type AttemptRow = Prisma.QueueAttemptGetPayload<{ select: typeof consoleAttemptSelect }>;
function projectAttempt(row: AttemptRow, imported: boolean): ConsoleAttempt {
  return { ...row, startedAt: row.startedAt.toISOString(), finishedAt: iso(row.finishedAt), heartbeatAt: row.heartbeatAt.toISOString(), leaseUntil: row.leaseUntil.toISOString(), imported,
    reservations: row.reservations.map(r => ({ ...r, createdAt: r.createdAt.toISOString(), releasedAt: iso(r.releasedAt) })) };
}
async function importedAttempts(tx: ConsoleReadTx, ids: string[]) {
  if (!ids.length) return new Set<string>();
  const rows = await tx.$queryRaw<{ id: string }[]>(Prisma.sql`SELECT "failedAttemptId" AS id FROM "QueueDeadLetter"
    WHERE "failedAttemptId" IN (${Prisma.join(ids.map(id => Prisma.sql`${id}::uuid`))}) AND detail->>'imported' = 'true'`);
  return new Set(rows.map(r => r.id));
}
export const consoleActionMatch = (id: string) => Prisma.sql`(a."jobId" = ${id}::uuid
  OR EXISTS (SELECT 1 FROM "QueueDeadLetter" d WHERE d.id=a."deadLetterId" AND d."jobId"=${id}::uuid)
  OR (a.outcome='rejected' AND (a.after->>'targetId'=${id} OR EXISTS (SELECT 1 FROM "QueueDeadLetter" d WHERE d.id::text=a.after->>'targetId' AND d."jobId"=${id}::uuid))))`;

function nextCursor(query: ParsedConsoleQuery, more: boolean, last: { id: string; at: Date; ordinal?: number } | undefined) {
  return more && last ? encodeConsoleCursor({ v: 1, scope: query.scope, filter: query.fingerprint,
    anchor: query.anchor.toISOString(), at: last.at.toISOString(), id: last.id, ...(last.ordinal ? { ordinal: last.ordinal } : {}) }) : null;
}
async function requireJob(tx: ConsoleReadTx, id: string) { return tx.queueJob.findUniqueOrThrow({ where: { id }, select: { id: true } }); }

export function getConsoleJob(id: string): Promise<ConsoleJobDetail> {
  z.string().uuid().parse(id);
  return withConsoleRead(async (tx, sampledAt) => {
    await requireJob(tx,id);
    const [job] = await hydrateConsoleJobs(tx,[id],sampledAt);
    const policy = await tx.queueJob.findUniqueOrThrow({ where: { id }, select: { maxAttempts: true, retryDelayMs: true,
      _count: { select: { attempts: true, deadLetters: true } } } });
    const [audit] = await tx.$queryRaw<{ count: number }[]>(Prisma.sql`SELECT count(*)::int AS count FROM "QueueAdminAction" a WHERE ${consoleActionMatch(id)}`);
    const current = await tx.queueDeadLetter.findFirst({ where: { jobId: id, state: "open" }, orderBy: [{ createdAt: "desc" },{ id: "desc" }], select: consoleDeadLetterSelect });
    const latest = await tx.queueDeadLetter.findFirst({ where: { jobId:id }, orderBy:[{createdAt:"desc"},{id:"desc"}],select:consoleDeadLetterSelect });
    return { ...job, cleanup:job.kind==="storage_cleanup"?await getConsoleCleanup(tx,job.executionId):null, sampledAt: sampledAt.toISOString(), counts: { attempts: policy._count.attempts, deadLetters: policy._count.deadLetters, actions: audit.count },
      maxAttempts: policy.maxAttempts, retryDelayMs: policy.retryDelayMs,
      phase: job.sourceStatus === "uploading" ? "saving_results" : job.attempt?.phase ?? (job.status === "ready" || job.status === "retry_wait" ? "admitted" : job.status),
      cycleAdmittedAt: job.cycleAdmittedAt ?? null,
      currentDeadLetter: current ? projectConsoleDeadLetter(current) : null, latestDeadLetter: latest ? projectConsoleDeadLetter(latest) : null };
  });
}

export function listConsoleAttempts(id: string, raw: unknown): Promise<ConsolePage<ConsoleAttempt>> {
  z.string().uuid().parse(id); const input = consoleChildQuerySchema.parse(raw);
  return withConsoleRead(async (tx,sampledAt) => {
    await requireJob(tx,id); const query = parseConsoleQuery(input,sampledAt,`attempts:${id}`); const { cursor }=query;
    if (cursor && !cursor.ordinal) throw new z.ZodError([]);
    const rows = await tx.queueAttempt.findMany({ where: { jobId: id, startedAt: { lte: query.anchor }, ...(cursor ? { OR: [
      { lifetimeOrdinal: { lt: cursor.ordinal } }, { lifetimeOrdinal: cursor.ordinal, id: { lt: cursor.id } },
    ] } : {}) }, orderBy: [{ lifetimeOrdinal: "desc" },{ id: "desc" }], take: input.limit+1, select: consoleAttemptSelect });
    const page=rows.slice(0,input.limit), last=page.at(-1); const imported=await importedAttempts(tx,page.map(r=>r.id));
    return { sampledAt: sampledAt.toISOString(), items: page.map(r=>projectAttempt(r,imported.has(r.id))),
      nextCursor: nextCursor(query,rows.length>page.length,last ? {id:last.id,at:last.startedAt,ordinal:last.lifetimeOrdinal}:undefined) };
  });
}
export function listConsoleDeadLetters(id: string, raw: unknown): Promise<ConsolePage<ConsoleDeadLetter>> {
  z.string().uuid().parse(id); const input=consoleChildQuerySchema.parse(raw);
  return withConsoleRead(async (tx,sampledAt) => {
    await requireJob(tx,id); const query=parseConsoleQuery(input,sampledAt,`dead-letters:${id}`), cursor=query.cursor;
    const rows=await tx.queueDeadLetter.findMany({ where:{ jobId:id, createdAt:{lte:query.anchor}, ...(cursor?{OR:[
      {createdAt:{lt:new Date(cursor.at)}},{createdAt:new Date(cursor.at),id:{lt:cursor.id}},
    ]}:{})}, orderBy:[{createdAt:"desc"},{id:"desc"}],take:input.limit+1,select:consoleDeadLetterSelect });
    const page=rows.slice(0,input.limit),last=page.at(-1);
    return {sampledAt:sampledAt.toISOString(),items:page.map(projectConsoleDeadLetter),nextCursor:nextCursor(query,rows.length>page.length,last?{id:last.id,at:last.createdAt}:undefined)};
  });
}
export function listConsoleActions(id: string, raw: unknown): Promise<ConsolePage<ConsoleAction>> {
  z.string().uuid().parse(id); const input=consoleChildQuerySchema.parse(raw);
  return withConsoleRead(async(tx,sampledAt)=>{
    await requireJob(tx,id); const query=parseConsoleQuery(input,sampledAt,`actions:${id}`),cursor=query.cursor;
    const rows=await tx.$queryRaw<{id:string;requestId:string;action:string;outcome:string;safeReason:string;createdAt:Date;code:string|null;status:string|null;cycle:number|null;executionId:string|null;mode:string|null}[]>(Prisma.sql`
      SELECT a.id,a."requestId",a.action,a.outcome,a."safeReason",a."createdAt",a.after->>'code' AS code,a.after->>'status' AS status,
        CASE WHEN (a.after->>'cycle') ~ '^[0-9]{1,9}$' THEN (a.after->>'cycle')::int END AS cycle,
        a.after->>'executionId' AS "executionId",a.after->>'mode' AS mode FROM "QueueAdminAction" a
      WHERE ${consoleActionMatch(id)} AND a."createdAt" <= ${query.anchor}
        ${cursor?Prisma.sql`AND (a."createdAt",a.id)<(${new Date(cursor.at)},${cursor.id}::uuid)`:Prisma.empty}
      ORDER BY a."createdAt" DESC,a.id DESC LIMIT ${input.limit+1}`);
    const page=rows.slice(0,input.limit),last=page.at(-1);
    return {sampledAt:sampledAt.toISOString(),items:page.map(r=>({id:r.id,requestId:r.requestId,action:r.action,outcome:r.outcome,safeReason:safeCode(r.safeReason),createdAt:r.createdAt.toISOString(),
      result:{code:r.code?safeCode(r.code):null,status:r.status&&/^[a-z_]{1,50}$/.test(r.status)?r.status:null,cycle:r.cycle,
        executionId:r.executionId&&/^[\w-]{1,200}$/.test(r.executionId)?r.executionId:null,mode:r.mode&&["execute","collect"].includes(r.mode)?r.mode:null}})),
      nextCursor:nextCursor(query,rows.length>page.length,last?{id:last.id,at:last.createdAt}:undefined)};
  });
}

export function listConsoleFailedJobs(raw: unknown): Promise<ConsolePage<ConsoleFailedJob>> {
  const input=consoleFailedQuerySchema.parse(raw);
  return withConsoleRead(async(tx,sampledAt)=>{
    const query=parseConsoleQuery(input,sampledAt,"failed-jobs");
    const conditions=[Prisma.sql`d."jobId"=j.id`,Prisma.sql`d."createdAt"<=${query.to}`];
    if(query.from)conditions.push(Prisma.sql`d."createdAt">=${query.from}`);
    if(input.classification)conditions.push(Prisma.sql`d.classification::text=${input.classification}`);
    if(input.code)conditions.push(Prisma.sql`d."safeErrorCode"=${input.code}`);
    if(input.state!=="all")conditions.push(input.state==="unresolved"?Prisma.sql`d.state IN ('open','redriven')`:input.state==="redriving"
      ?Prisma.sql`d.state='redriven' AND j.status IN ('ready','retry_wait','active','suspended')`:Prisma.sql`d.state::text=${input.state}`);
    const rows=await tx.$queryRaw<{id:string;createdAt:Date;entryId:string;failureCount:number}[]>(Prisma.sql`
      WITH ${consoleClassifiedCte} SELECT j.id,j."createdAt",d.id AS "entryId",
        (SELECT count(*)::int FROM "QueueDeadLetter" x WHERE x."jobId"=j.id) AS "failureCount"
      FROM "QueueJob" j JOIN classified c ON c.id=j.id
      LEFT JOIN LATERAL ${consoleSourceSql(Prisma.sql`j."executionType"::text`,Prisma.sql`j."executionId"`)} s ON true
      JOIN LATERAL (SELECT d.id FROM "QueueDeadLetter" d WHERE ${Prisma.join(conditions," AND ")}
        ORDER BY (d.state='open') DESC,d."createdAt" DESC,d.id DESC LIMIT 1) d ON true
      WHERE ${consoleJobsWhere(query,{dates:false,current:false})} ORDER BY j."createdAt" DESC,j.id DESC LIMIT ${input.limit+1}`);
    const page=rows.slice(0,input.limit),last=page.at(-1),ids=page.map(r=>r.id);
    const jobs=await hydrateConsoleJobs(tx,ids,sampledAt);
    const entries=await tx.queueDeadLetter.findMany({where:{OR:[{id:{in:page.map(r=>r.entryId)}},{jobId:{in:ids},state:"open"}]},select:consoleDeadLetterSelect});
    return {sampledAt:sampledAt.toISOString(),items:jobs.map(job=>{const row=page.find(r=>r.id===job.id)!;const current=entries.find(e=>e.jobId===job.id&&e.state==="open");
      return {...job,failureCount:row.failureCount,entry:projectConsoleDeadLetter(entries.find(e=>e.id===row.entryId)!),currentEntry:current?projectConsoleDeadLetter(current):null};}),
      nextCursor:nextCursor(query,rows.length>page.length,last?{id:last.id,at:last.createdAt}:undefined)};
  });
}

export function getConsoleTimeline(raw: unknown): Promise<ConsoleTimeline> {
  return withConsoleRead(async(tx,sampledAt)=>{
    const query=parseConsoleQuery(raw,sampledAt,"timeline"),{input,cursor}=query,from=query.from!,to=query.to;
    const rows=await tx.$queryRaw<{id:string;jobId:string;startedAt:Date}[]>(Prisma.sql`
      WITH ${consoleClassifiedCte} SELECT a.id,a."jobId",a."startedAt" FROM "QueueAttempt" a
      JOIN "QueueJob" j ON j.id=a."jobId" JOIN classified c ON c.id=j.id
      LEFT JOIN LATERAL ${consoleSourceSql(Prisma.sql`j."executionType"::text`,Prisma.sql`j."executionId"`)} s ON true
      WHERE ${consoleJobsWhere(query,{dates:false,current:false,cursor:false})}
        AND ((a."startedAt"<${to} AND (a."finishedAt" IS NULL OR a."finishedAt">=${from}))
          OR EXISTS (SELECT 1 FROM "QueueReservation" v WHERE v."attemptId"=a.id AND v."createdAt"<${to} AND (v."releasedAt" IS NULL OR v."releasedAt">=${from})))
        ${input.worker?Prisma.sql`AND a."workerInstanceId"=${input.worker}::uuid`:Prisma.empty}
        ${input.resource?Prisma.sql`AND EXISTS (SELECT 1 FROM "QueueReservation" v WHERE v."attemptId"=a.id AND v."resourceKey"=${input.resource})`:Prisma.empty}
        ${cursor?Prisma.sql`AND (a."startedAt",a.id)<(${new Date(cursor.at)},${cursor.id}::uuid)`:Prisma.empty}
      ORDER BY a."startedAt" DESC,a.id DESC LIMIT ${input.limit+1}`);
    const page=rows.slice(0,input.limit),last=page.at(-1),ids=[...new Set(page.map(r=>r.jobId))];
    const jobs=new Map((await hydrateConsoleJobs(tx,ids,sampledAt)).map(j=>[j.id,j]));
    const attempts=new Map((await tx.queueAttempt.findMany({where:{id:{in:page.map(r=>r.id)}},select:consoleAttemptSelect})).map(a=>[a.id,a]));
    const imported=await importedAttempts(tx,page.map(r=>r.id)),admissions=await cycleAdmissions(tx,[...attempts.values()].map(a=>({jobId:a.jobId,cycle:a.cycle})));
    return {sampledAt:sampledAt.toISOString(),from:from.toISOString(),to:to.toISOString(),items:page.map(r=>{
      const attempt=attempts.get(r.id)!,job=jobs.get(r.jobId)!;
      const admitted=attempt.cycle===1?new Date(job.createdAt):admissions.find(a=>a.jobId===job.id&&a.cycle===attempt.cycle)?.admittedAt??null;
      // Retry gaps and later attempts do not prove a new admission/wait interval.
      const wait=attempt.cycleOrdinal===1&&admitted&&admitted<=attempt.startedAt&&!imported.has(attempt.id)?admitted:null;
      return {...projectAttempt(attempt,imported.has(attempt.id)),job,admittedAt:iso(admitted),waitFrom:iso(wait),
        clippedStart:attempt.startedAt<from,clippedEnd:!attempt.finishedAt||attempt.finishedAt>to};
    }),nextCursor:nextCursor(query,rows.length>page.length,last?{id:last.id,at:last.startedAt}:undefined)};
  });
}
