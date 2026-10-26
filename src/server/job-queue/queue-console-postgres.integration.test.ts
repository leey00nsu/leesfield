// @vitest-environment node
import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { prisma } from "@/server/db/prisma";
import { postgresIntegrationEnabled } from "@/test-utils/postgres-integration";
import { removeFixtureQueueJobs } from "@/test-utils/job-queue-postgres";
import { enqueueQueueJobTx } from "./job-queue-registration";
import { withQueueTransaction } from "./job-queue-transaction";
import { claimQueueJob } from "./job-queue-scheduler";
import { settleQueueFailure } from "./job-queue-settlement";
import { queueKindDefinitions } from "./job-kind-registry";
import { QUEUE_TRANSACTION_LOCK, queueJobKinds, type QueueJobKind } from "./contracts";
import { getConsoleOverview, listConsoleJobs } from "./job-queue-console-repository";
import type { QueueHandler } from "./job-queue-handler";
import { getConsoleJob, getConsoleTimeline, listConsoleActions, listConsoleAttempts, listConsoleDeadLetters, listConsoleFailedJobs } from "./job-queue-console-history";

describe.skipIf(!postgresIntegrationEnabled)("queue console read contract", () => {
  const digest = "7".repeat(64), ids: string[] = [];
  const oldAt = new Date("2020-01-01T00:00:00Z");
  const worker = randomUUID();
  const jobs = new Map<string, string>();
  const detachedActions: string[] = [];
  const handler: QueueHandler = { kind: "generate_image", async prepareTx() {}, async execute() {}, async settleTx() { return "succeeded"; },
    async failTx() {}, classifyFailure() { return { code: "REMOTE_UNKNOWN", phase: "execute", disposition: "reconciliation", executionStopped: false }; } };
  async function register(kind: QueueJobKind, key?: string, sourceId: string = randomUUID()) {
    ids.push(sourceId);
    return withQueueTransaction(tx => enqueueQueueJobTx(tx, { kind, source: { type: queueKindDefinitions[kind].sourceType, id: sourceId },
      ownerScopeDigest: digest, snapshotRef: "SECRET_SNAPSHOT_SENTINEL", orderKey: key }));
  }
  beforeAll(async () => {
    await prisma.queueRuntime.update({ where: { id: 1 }, data: { mode: "shared", migrationVerified: true } });
    const first = await register("generate_image");
    const claim = (await claimQueueJob(worker))!;
    await settleQueueFailure(claim.lease, handler, { code: "REMOTE_UNKNOWN", phase: "execute", disposition: "reconciliation", executionStopped: false });
    jobs.set("uncertain", first.id);
    // A redriven historical failure plus an open entry must not double the job count.
    const historic = await prisma.queueAttempt.create({ data: { jobId: first.id, lifetimeOrdinal: 2, cycle: 2, cycleOrdinal: 1,
      executionType: first.executionType, executionId: first.executionId, workerInstanceId: worker, leaseVersion: 2,
      leaseUntil: new Date(), runtimeEpoch: 1, phase: "ended", outcome: "failed", startedAt: oldAt, finishedAt: oldAt } });
    await prisma.queueDeadLetter.create({ data: { jobId: first.id, failedAttemptId: historic.id, state: "redriven", classification: "terminal", safeErrorCode: "TEST_FAILED", phase: "ended" } });
    const active = await register("generate_video"); await claimQueueJob(worker); jobs.set("active", active.id);
    for (const kind of ["generate_audio", "media_operation", "assistant", "storage_cleanup"] as const) {
      const job = await register(kind); jobs.set(kind, job.id);
    }
    await prisma.queueJob.update({ where: { id: jobs.get("assistant")! }, data: { createdAt: oldAt } });
    const key = randomUUID(); await register("generate_image", key); const blocked = await register("generate_image", key); jobs.set("blocked", blocked.id);
    const source = await prisma.imageGeneration.create({ data: { requestId: randomUUID(), prompt: "SECRET_PROMPT_SENTINEL", status: "pending", progress: 0,
      ownerEmail: "secret-owner@example.com", modelKey: "console-model" } });
    const sourced = await register("generate_image", undefined, source.id); jobs.set("classic", sourced.id);
    await prisma.modelCatalog.create({ data: { key: "console-model", type: "image", label: "Console fixture", vendor: "fixture", provider: "fixture",
      providerConfig: { secret: "SECRET_PROVIDER_SENTINEL" }, parameters: {}, meta: { concurrent_limit: 1 } } });
    await prisma.queueResource.create({ data: { key: "console-model-resource", modelKey: "console-model", modelType: "image" } });
    await prisma.queueJobResource.create({ data: { jobId: sourced.id, resourceKey: "console-model-resource" } });
    await prisma.queueReservation.create({ data: { attemptId: claim.attemptId, resourceKey: "console-model-resource", disposition: "uncertain" } });
  });
  afterAll(async () => {
    await prisma.queueAdminAction.deleteMany({ where: { requestId: { in: detachedActions } } });
    await removeFixtureQueueJobs(ids);
    await prisma.queueResource.deleteMany({ where: { key: "console-model-resource" } });
    await prisma.modelCatalog.deleteMany({ where: { key: "console-model" } });
    await prisma.imageGeneration.deleteMany({ where: { id: { in: ids } } });
    await prisma.queueOrderGroup.deleteMany({ where: { ownerScopeDigest: digest } });
    await prisma.queueRuntime.update({ where: { id: 1 }, data: { mode: "paused", migrationVerified: false } });
  });
  it("counts all kinds, distinct failed jobs, actual active work and retained uncertain capacity separately", async () => {
    const snapshot = await getConsoleOverview();
    expect(Object.keys(snapshot.byKind)).toEqual([...queueJobKinds]);
    expect(snapshot.counts).toMatchObject({ active: 1, unresolvedJobs: 1, uncertainJobs: 1, reconciliationJobs: 1 });
    expect(snapshot.resources.find(r => r.key === "generation")).toMatchObject({ capacity: 4, reserved: 2, uncertain: 1, available: 2 });
    expect(snapshot.byKind.generate_image.states.blocked).toBe(1);
    expect(snapshot.byKind.assistant.oldestPendingAt).toBe(oldAt.toISOString());
    expect(snapshot.occupants.map(r => r.jobId)).toEqual(expect.arrayContaining([jobs.get("active"), jobs.get("uncertain")]));
    expect(snapshot.process.scope).toBe("responding_process");
  });
  it("finds old current work and missing sources without leaking any private source or lease values", async () => {
    const page = await listConsoleJobs({});
    expect(page.items.find(j => j.id === jobs.get("assistant"))).toMatchObject({ sourceAvailable: false, origin: "unknown", createdAt: oldAt.toISOString() });
    const sourced = page.items.find(j => j.id === jobs.get("classic"))!;
    expect(sourced).toMatchObject({ model: "console-model", sourceAvailable: true, origin: "classic" });
    const original=await prisma.imageGeneration.findUniqueOrThrow({where:{id:sourced.sourceId},select:{requestId:true}});
    expect(sourced.requestId).toBe(original.requestId);expect(sourced.sourceRequestId).toBe(original.requestId);
    expect((await listConsoleJobs({q:original.requestId})).items.map(j=>j.id)).toEqual([sourced.id]);
    const serialized = JSON.stringify({ page, overview: await getConsoleOverview() });
    for (const secret of [digest, "SECRET_SNAPSHOT_SENTINEL", "SECRET_PROMPT_SENTINEL", "secret-owner@example.com", "leaseToken", "requestParams", "providerConfig"]) expect(serialized).not.toContain(secret);
  });
  it("applies SQL filters and literal search, preserves same-time boundaries and rejects a filter-swapped cursor", async () => {
    expect((await listConsoleJobs({ status: "blocked" })).items.map(j => j.id)).toEqual([jobs.get("blocked")]);
    expect((await listConsoleJobs({ model: "console-model", origin: "classic" })).items.map(j => j.id)).toEqual([jobs.get("classic")]);
    expect((await listConsoleJobs({ worker })).items.map(j => j.id)).toEqual(expect.arrayContaining([jobs.get("active"), jobs.get("uncertain")]));
    expect((await listConsoleJobs({ q: jobs.get("classic")! })).items.map(j => j.id)).toEqual([jobs.get("classic")]);
    expect((await listConsoleJobs({ q: "%_" })).items).toHaveLength(0);
    const expected = (await listConsoleJobs({})).items.map(j => j.id);
    let cursor: string | undefined; const actual: string[] = [];
    do { const page = await listConsoleJobs({ limit: 2, cursor }); actual.push(...page.items.map(j => j.id)); cursor = page.nextCursor ?? undefined; } while(cursor);
    expect(actual).toEqual(expected); expect(new Set(actual).size).toBe(expected.length);
    const page = await listConsoleJobs({ limit: 1 });
    await expect(listConsoleJobs({ kind: "assistant", cursor: page.nextCursor! })).rejects.toThrow("INVALID_REQUEST");
  });
  it("shows paused scheduling before the other current reasons", async () => {
    await prisma.queueRuntime.update({ where: { id: 1 }, data: { mode: "paused" } });
    const page = await listConsoleJobs({ status: "blocked" });
    expect(page.items[0].reasons).toEqual(["QUEUE_PAUSED", "GROUP_BLOCKED"]);
    await prisma.queueRuntime.update({ where: { id: 1 }, data: { mode: "shared" } });
  });
  it("reads the live model limit and distinguishes a full resource from an unavailable model", async () => {
    expect((await listConsoleJobs({ model: "console-model" })).items[0].primaryReason).toBe("RESOURCE_FULL");
    expect((await listConsoleJobs({ resource: "console-model-resource" })).items.map(j => j.id)).toEqual([jobs.get("classic")]);
    await prisma.modelCatalog.update({ where: { key: "console-model" }, data: { meta: { concurrent_limit: 3.9 } } });
    expect((await getConsoleOverview()).resources.find(r => r.key === "console-model-resource")).toMatchObject({ capacity: 3, available: 2, reserved: 1, uncertain: 1 });
    await prisma.modelCatalog.update({ where: { key: "console-model" }, data: { isActive: false } });
    expect((await listConsoleJobs({ model: "console-model" })).items[0].primaryReason).toBe("MODEL_UNAVAILABLE");
    expect((await getConsoleOverview()).resources.find(r => r.key === "console-model-resource")).toMatchObject({ capacity: 0, available: 0, excess: 1 });
    await prisma.modelCatalog.update({ where: { key: "console-model" }, data: { isActive: true } });
  });
  it("finishes under a held queue advisory lock, performs no work-table writes or network requests", async () => {
    const snapshot = () => prisma.$queryRaw`SELECT (SELECT jsonb_agg(to_jsonb(j) ORDER BY j.id) FROM "QueueJob" j) AS jobs,
      (SELECT jsonb_agg(to_jsonb(a) ORDER BY a.id) FROM "QueueAttempt" a) AS attempts,
      (SELECT jsonb_agg(to_jsonb(v) ORDER BY v."attemptId",v."resourceKey") FROM "QueueReservation" v) AS reservations,
      (SELECT jsonb_agg(to_jsonb(d) ORDER BY d.id) FROM "QueueDeadLetter" d) AS dlq,
      (SELECT jsonb_agg(to_jsonb(a) ORDER BY a.id) FROM "QueueAdminAction" a) AS audit,
      (SELECT to_jsonb(r) FROM "QueueRuntime" r WHERE id=1) AS runtime`;
    const before = await snapshot();
    const client = new Client({ connectionString: process.env.DATABASE_URL }); await client.connect();
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("FORBIDDEN_NETWORK"));
    try {
      await client.query("BEGIN"); await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [QUEUE_TRANSACTION_LOCK]);
      const id=jobs.get("uncertain")!;
      await Promise.all([getConsoleOverview(), listConsoleJobs({}), getConsoleJob(id), listConsoleAttempts(id,{}),
        listConsoleDeadLetters(id,{}),listConsoleActions(id,{}),listConsoleFailedJobs({}),getConsoleTimeline({})]);
      expect(await snapshot()).toEqual(before);
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally { fetchSpy.mockRestore(); await client.query("ROLLBACK"); await client.end(); }
  });
  it("pages every retained attempt/failure/audit beyond 100, including rejected target-only audit, without duplicates", async () => {
    const job=await register("storage_cleanup");jobs.set("history",job.id);
    await prisma.queueJob.update({where:{id:job.id},data:{createdAt:oldAt,status:"reconciliation_required",cycle:105}});
    const at=new Date(Date.now()-3_600_000),ended=new Date(at.getTime()+60_000),admitted=new Date(at.getTime()-60_000);
    const attempts=Array.from({length:105},(_,i)=>({id:randomUUID(),jobId:job.id,lifetimeOrdinal:i+1,cycle:i+1,cycleOrdinal:1,
      executionType:job.executionType,executionId:job.executionId,workerInstanceId:worker,leaseVersion:1,leaseUntil:ended,runtimeEpoch:1,
      phase:"ended" as const,outcome:"failed" as const,startedAt:at,finishedAt:ended}));
    await prisma.queueAttempt.createMany({data:attempts});
    const letters=attempts.map((a,i)=>({id:randomUUID(),jobId:job.id,failedAttemptId:a.id,classification:"reconciliation" as const,
      state:i===104?"open" as const:"redriven" as const,safeErrorCode:"FIXTURE_FAILURE",phase:"execute",createdAt:ended,detail:{imported:i===0}}));
    await prisma.queueDeadLetter.createMany({data:letters});
    await prisma.queueAdminAction.createMany({data:attempts.map(a=>({requestId:randomUUID(),requestFingerprint:digest,actorDigest:digest,
      action:"redrive",jobId:job.id,outcome:"succeeded",safeReason:"CAUSE_FIXED",createdAt:admitted,
      after:{cycle:a.cycle,executionId:a.executionId,secret:"SECRET_AUDIT_SENTINEL"}}))});
    const rejected=randomUUID(),anonymous=randomUUID();detachedActions.push(rejected,anonymous);
    await prisma.queueAdminAction.createMany({data:[{requestId:rejected,requestFingerprint:digest,actorDigest:digest,action:"redrive",outcome:"rejected",safeReason:"CAUSE_FIXED",
      after:{targetId:letters[0].id,code:"QUEUE_VERSION_CONFLICT",secret:"SECRET_AUDIT_SENTINEL"}},
      {requestId:anonymous,requestFingerprint:digest,actorDigest:digest,action:"redrive",outcome:"rejected",safeReason:"QUEUE_ADMIN_REQUIRED"}]});
    const all=async<T extends {id:string}>(read:(id:string,raw:unknown)=>Promise<{items:T[];nextCursor:string|null}>)=>{
      const result:T[]=[];let cursor:string|undefined;do{const p=await read(job.id,{limit:17,cursor});result.push(...p.items);cursor=p.nextCursor??undefined;}while(cursor);return result;
    };
    const actualAttempts=await all(listConsoleAttempts),actualFailures=await all(listConsoleDeadLetters),actualActions=await all(listConsoleActions);
    expect(actualAttempts.map(a=>a.id).sort()).toEqual(attempts.map(a=>a.id).sort());
    expect(actualFailures.map(a=>a.id).sort()).toEqual(letters.map(a=>a.id).sort());
    expect(actualActions).toHaveLength(106);expect(new Set(actualActions.map(a=>a.id)).size).toBe(106);
    const detail=await getConsoleJob(job.id);expect(detail.counts).toEqual({attempts:105,deadLetters:105,actions:106});
    expect(detail.cycleAdmittedAt).toBe(admitted.toISOString());expect(detail.currentDeadLetter?.id).toBe(letters[104].id);
    const failed=(await listConsoleFailedJobs({q:job.id})).items;expect(failed).toHaveLength(1);expect(failed[0].failureCount).toBe(105);
    expect(failed[0].currentEntry?.id).toBe(letters[104].id);
    expect(JSON.stringify({actualActions,detail})).not.toContain("SECRET_AUDIT_SENTINEL");
    // Local execution ended an hour ago; an unreleased reservation still intersects the current window.
    await prisma.queueReservation.create({data:{attemptId:attempts[104].id,resourceKey:"storage-cleanup",disposition:"uncertain",createdAt:at}});
    const end=new Date(Date.now()-1000),start=new Date(end.getTime()-300_000);
    const timeline=await getConsoleTimeline({q:job.id,from:start.toISOString(),to:end.toISOString()});
    expect(timeline.items.map(a=>a.id)).toEqual([attempts[104].id]);
    expect(timeline.items[0]).toMatchObject({clippedStart:true,finishedAt:ended.toISOString(),admittedAt:admitted.toISOString(),waitFrom:admitted.toISOString()});
    const offset=(d:Date)=>d.toISOString().replace('Z','+00:00');
    expect((await getConsoleTimeline({q:job.id,from:offset(start),to:offset(end)})).items.map(a=>a.id)).toEqual([attempts[104].id]);
    const historical=await getConsoleTimeline({q:job.id,from:new Date(at.getTime()-1000).toISOString(),to:new Date(ended.getTime()+1000).toISOString(),limit:100});
    expect(historical.items).toHaveLength(100);expect(historical.nextCursor).not.toBeNull();
    const rest=await getConsoleTimeline({q:job.id,from:new Date(at.getTime()-1000).toISOString(),to:new Date(ended.getTime()+1000).toISOString(),limit:100,cursor:historical.nextCursor!});
    expect(rest.items).toHaveLength(5);expect(new Set([...historical.items,...rest.items].map(a=>a.id)).size).toBe(105);
    expect(rest.items.find(a=>a.imported)?.waitFrom??null).toBeNull();
  });
  it("explains cleanup identity, registration reason and present protection without exposing URLs or changing work",async()=>{
    const asset=await prisma.mediaAsset.create({data:{ownerEmail:"cleanup-private@example.com",type:"image",origin:"upload",status:"completed",storageProvider:"fixture-storage",storageObjectId:randomUUID(),originalFileName:"campaign-input.png",mimeType:"image/png",bytes:BigInt(12345),storageUrl:"https://secret.example/file?token=SECRET_FILE_TOKEN"}});
    const task=await prisma.mediaCleanupTask.create({data:{ownerEmail:asset.ownerEmail,storageProvider:asset.storageProvider,storageObjectId:asset.storageObjectId,assetId:asset.id,reason:"generation_input",status:"linked",retryAt:new Date(),storageUrl:asset.storageUrl}});
    const job=await register("storage_cleanup",undefined,task.id);
    const input=await prisma.generationInputAsset.create({data:{ownerEmail:asset.ownerEmail,requestId:randomUUID(),generationType:"image",field:"image",assetId:asset.id}});
    try {
      const before=await prisma.mediaCleanupTask.findUniqueOrThrow({where:{id:task.id}});
      const detail=await getConsoleJob(job.id);
      expect(detail.cleanup).toMatchObject({reason:"generation_input",status:"linked",storageProvider:"fixture-storage",storageObjectId:asset.storageObjectId,fileName:"campaign-input.png",bytes:"12345",protection:"linked",usage:{generations:1,graphs:0}});
      expect(await prisma.mediaCleanupTask.findUniqueOrThrow({where:{id:task.id}})).toEqual(before);
      expect(JSON.stringify(detail)).not.toContain("SECRET_FILE_TOKEN");expect(JSON.stringify(detail)).not.toContain(asset.ownerEmail);
      await prisma.mediaCleanupTask.update({where:{id:task.id},data:{status:"pending",reason:"history_delete"}});
      expect((await getConsoleJob(job.id)).cleanup?.protection).toBe("referenced");
      await prisma.generationInputAsset.delete({where:{id:input.id}});
      await prisma.mediaAsset.delete({where:{id:asset.id}});
      const missing=(await getConsoleJob(job.id)).cleanup!;
      expect(missing.fileName).toBeNull();expect(missing.storageObjectId).toBe(asset.storageObjectId);expect(missing.protection).toBeNull();
      await prisma.mediaCleanupTask.update({where:{id:task.id},data:{storageObjectId:"https://secret.example/file?token=SECRET_FILE_TOKEN",status:"uploading"}});
      const redacted=(await getConsoleJob(job.id)).cleanup!;expect(redacted.storageObjectId).toBeNull();expect(redacted.protection).toBe("upload_grace");
      await prisma.mediaCleanupTask.delete({where:{id:task.id}});
      expect((await getConsoleJob(job.id)).cleanup).toBeNull();
    } finally {
      await prisma.generationInputAsset.deleteMany({where:{id:input.id}});await prisma.mediaCleanupTask.deleteMany({where:{id:task.id}});await prisma.mediaAsset.deleteMany({where:{id:asset.id}});
    }
  });

  it("projects current-cycle admission and first real attempt without retry gaps or fabricated imported starts",async()=>{
    const job=await register("storage_cleanup"),admitted=new Date(Date.now()-120000),started=new Date(admitted.getTime()+32000),later=new Date(started.getTime()+60000);
    await prisma.queueJob.update({where:{id:job.id},data:{cycle:2,status:"dead_letter",createdAt:oldAt}});
    const attempt=(ordinal:number,start:Date)=>({jobId:job.id,lifetimeOrdinal:ordinal,cycle:2,cycleOrdinal:ordinal,executionType:job.executionType,executionId:job.executionId,workerInstanceId:worker,leaseVersion:1,leaseUntil:new Date(start.getTime()+10000),runtimeEpoch:1,phase:"ended" as const,outcome:"failed" as const,startedAt:start,finishedAt:new Date(start.getTime()+1000)});
    const first=await prisma.queueAttempt.create({data:attempt(1,started)}),second=await prisma.queueAttempt.create({data:attempt(2,later)});
    await prisma.queueJob.update({where:{id:job.id},data:{currentAttemptId:second.id}});
    await prisma.queueAdminAction.createMany({data:[{requestId:randomUUID(),requestFingerprint:digest,actorDigest:digest,action:"redrive",jobId:job.id,outcome:"rejected",safeReason:"CAUSE_FIXED",createdAt:oldAt,after:{cycle:2}},
      {requestId:randomUUID(),requestFingerprint:digest,actorDigest:digest,action:"redrive",jobId:job.id,outcome:"succeeded",safeReason:"CAUSE_FIXED",createdAt:admitted,after:{cycle:2,secret:"PRIVATE_TIMING_SENTINEL"}}]});
    const page=await listConsoleJobs({q:job.id});expect(page.items[0]).toMatchObject({cycleAdmittedAt:admitted.toISOString(),cycleStartedAt:started.toISOString(),attemptCount:2,attempt:{startedAt:later.toISOString()}});
    expect((await getConsoleJob(job.id)).cycleAdmittedAt).toBe(admitted.toISOString());
    expect(JSON.stringify(page)).not.toContain("PRIVATE_TIMING_SENTINEL");
    await prisma.queueDeadLetter.create({data:{jobId:job.id,failedAttemptId:first.id,classification:"terminal",state:"redriven",safeErrorCode:"IMPORTED",phase:"ended",detail:{imported:true}}});
    expect((await listConsoleJobs({q:job.id})).items[0].cycleStartedAt).toBeNull();
    await prisma.queueAdminAction.deleteMany({where:{jobId:job.id,action:"redrive",outcome:"succeeded"}});
    expect((await getConsoleJob(job.id)).cycleAdmittedAt).toBeNull();
  });
  it("hydrates occupant names and models using safe source metadata",async()=>{
    const job=await prisma.queueJob.findUniqueOrThrow({where:{id:jobs.get("active")!}});
    const graph=await prisma.generationGraph.create({data:{ownerEmail:"private-occupant@example.com",title:"Private graph"}});
    const node=await prisma.generationGraphNode.create({data:{id:randomUUID(),graphId:graph.id,kind:"generate.video",configVersion:1,config:{presentation:{customTitle:"Visible clip node"}},x:0,y:0}});
    const source=await prisma.videoGeneration.create({data:{id:job.executionId,requestId:randomUUID(),ownerEmail:"private-occupant@example.com",prompt:"PRIVATE_OCCUPANT_PROMPT",modelKey:"safe-clip-model",status:"processing",progress:0,graphNodeId:node.id}});
    try {
      const overview=await getConsoleOverview(),occupant=overview.occupants.find(item=>item.jobId===job.id)!;
      expect(occupant).toMatchObject({title:"Visible clip node",model:"safe-clip-model",origin:"space"});
      expect(JSON.stringify(overview)).not.toContain("PRIVATE_OCCUPANT_PROMPT");expect(JSON.stringify(overview)).not.toContain("private-occupant@example.com");
    } finally {await prisma.videoGeneration.delete({where:{id:source.id}});await prisma.generationGraph.delete({where:{id:graph.id}});}
  });

});
