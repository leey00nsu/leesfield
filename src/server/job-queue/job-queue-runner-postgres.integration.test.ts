// @vitest-environment node
import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/server/db/prisma";
import { postgresIntegrationEnabled } from "@/test-utils/postgres-integration";
import { expireFixtureQueueAttempt } from "@/test-utils/job-queue-postgres";
import { enqueueQueueJobTx } from "./job-queue-registration";
import { claimQueueJob } from "./job-queue-scheduler";
import { createQueueRunner } from "./job-queue-runner";
import { recoverExpiredQueueAttempts, requestQueueCancellationTx } from "./job-queue-recovery";
import { markQueueExternalStart, renewQueueLease } from "./job-queue-lease";
import { settleQueueSuccess } from "./job-queue-settlement";
import { queueDatabaseNow, withQueueTransaction } from "./job-queue-transaction";
import type { QueueHandler } from "./job-queue-handler";

describe.skipIf(!postgresIntegrationEnabled)("shared runner execution and recovery", () => {
  const digest = "d".repeat(64);
  const runners: ReturnType<typeof createQueueRunner>[] = [];
  const handler: QueueHandler = {
    kind: "generate_image",
    async prepareTx() {},
    async execute() { return "ok"; },
    async settleTx() { return "succeeded"; },
    async failTx() {},
    classifyFailure() { return { code: "TEST_FAILED", phase: "execute", disposition: "terminal", executionStopped: true }; },
  };
  const handlers = new Map([[handler.kind, handler]]);
  beforeAll(async () => {
    await prisma.queueRuntime.update({ where: { id: 1 }, data: { mode: "shared", migrationVerified: true } });
  });
  afterEach(async () => {
    await Promise.all(runners.splice(0).map(r => r.stop({ drainTimeoutMs: 10 })));
    await withQueueTransaction(async tx => {
      const ids = (await tx.queueJob.findMany({ where: { ownerScopeDigest: digest } })).map(j => j.id);
      await tx.queueAttempt.updateMany({ where: { jobId: { in: ids }, finishedAt: null }, data: { phase: "ended", outcome: "cancelled", finishedAt: await queueDatabaseNow(tx) } });
      await tx.queueJob.updateMany({ where: { id: { in: ids } }, data: { status: "cancelled", currentAttemptId: null } });
      await tx.queueOrderGroup.updateMany({ where: { ownerScopeDigest: digest }, data: { blockedByJobId: null } });
      await tx.queueDeadLetter.deleteMany({ where: { jobId: { in: ids } } });
      await tx.queueReservation.deleteMany({ where: { attempt: { jobId: { in: ids } } } });
      await tx.queueAttempt.deleteMany({ where: { jobId: { in: ids } } });
      await tx.queueJobResource.deleteMany({ where: { jobId: { in: ids } } });
      await tx.queueJob.deleteMany({ where: { id: { in: ids } } });
      await tx.queueOrderGroup.deleteMany({ where: { ownerScopeDigest: digest } });
    });
  });
  afterAll(async () => {
    await prisma.queueRuntime.update({ where: { id: 1 }, data: { mode: "paused", migrationVerified: false } });
  });
  const register = (key?: string) => withQueueTransaction(tx => {
    const id = randomUUID();
    return enqueueQueueJobTx(tx, { kind: "generate_image", source: { type: "image_generation", id }, ownerScopeDigest: digest, snapshotRef: id, orderKey: key });
  });
  it("discovers later committed work through fallback polling without another request", async () => {
    let calls = 0;
    const r = runner({ ...handler, async execute() { calls++; return "ok"; } });
    r.start();
    await expect.poll(() => r.getState().lastHeartbeatAt, { timeout: 1000 }).not.toBeNull();
    const job = await register();
    await expect.poll(async () => (await prisma.queueJob.findUniqueOrThrow({ where: { id: job.id } })).status, { timeout: 4000 }).toBe("succeeded");
    expect(calls).toBe(1);
  });
  it("aborts at the drain deadline and cannot commit a late result with a still-valid lease", async () => {
    let started = false;
    let settled = false;
    const h: QueueHandler = { ...handler,
      async execute(_job, context) {
        started = true;
        await new Promise<void>(resolve => context.signal.addEventListener("abort", () => resolve(), { once: true }));
        await context.assertOwned();
        return "late";
      },
      async settleTx() { settled = true; return "succeeded"; },
      classifyFailure() { return { code: "REMOTE_UNKNOWN", phase: "drain", disposition: "reconciliation", executionStopped: false }; },
    };
    const job = await register(); const r = runner(h); await r.pump();
    await expect.poll(() => started).toBe(true);
    await r.stop({ drainTimeoutMs: 10 }); await r.drain();
    expect(settled).toBe(false);
    expect((await prisma.queueJob.findUniqueOrThrow({ where: { id: job.id } })).status).toBe("reconciliation_required");
    expect(await prisma.queueReservation.count({ where: { attempt: { jobId: job.id }, releasedAt: null } })).toBe(1);
  });
  function runner(h = handler) {
    const r = createQueueRunner([h], { heartbeatMs: 20 });
    runners.push(r);
    return r;
  }
  async function expire(attemptId: string) {
    await expireFixtureQueueAttempt(attemptId);
  }

  it("two runners execute a group sequentially with an independent start/end ledger", async () => {
    const key = randomUUID();
    const jobs = [await register(key), await register(key), await register(key)];
    const events: string[] = [];
    const rHandler: QueueHandler = { ...handler, async execute(job, context) {
      events.push("start:" + job.sequence);
      await new Promise(resolve => setTimeout(resolve, 15));
      await context.assertOwned();
      events.push("end:" + job.sequence);
      return "ok";
    } };
    const a = runner(rHandler), b = runner(rHandler);
    await Promise.all([a.pump(), b.pump()]);
    for (let n = 0; n < 6; n++) { await Promise.all([a.drain(), b.drain()]); await Promise.all([a.pump(), b.pump()]); }
    expect(events).toEqual(["start:1", "end:1", "start:2", "end:2", "start:3", "end:3"]);
    expect(await prisma.queueJob.count({ where: { id: { in: jobs.map(j => j.id) }, status: "succeeded" } })).toBe(3);
    expect(await prisma.queueReservation.count({ where: { attempt: { job: { ownerScopeDigest: digest } }, releasedAt: null } })).toBe(0);
  });

  it("a failed result transaction is rolled back and its final failure goes to one DLQ", async () => {
    const job = await register();
    let calls = 0;
    const r = runner({ ...handler,
      async execute() { calls++; return "ok"; },
      async settleTx(tx) {
        await tx.queueJob.update({ where: { id: job.id }, data: { availableAt: new Date(0) } });
        throw new Error("COMMIT_FAILED");
      },
    });
    await r.pump(); await r.drain();
    expect(calls).toBe(1);
    const persisted = await prisma.queueJob.findUniqueOrThrow({ where: { id: job.id } });
    expect(persisted.status).toBe("dead_letter");
    expect(persisted.availableAt.getTime()).toBeGreaterThan(0);
    expect(await prisma.queueDeadLetter.count({ where: { jobId: job.id } })).toBe(1);
  });

  it("expired remote work is quarantined without freeing resources or accepting a late result", async () => {
    const job = await register(randomUUID());
    const c = await claimQueueJob(randomUUID());
    expect(c?.job.id).toBe(job.id);
    await markQueueExternalStart(c!.lease);
    await expire(c!.attemptId);
    expect(await recoverExpiredQueueAttempts(handlers)).toBe(1);
    expect(await recoverExpiredQueueAttempts(handlers)).toBe(0);
    expect(await prisma.queueJob.findUnique({ where: { id: job.id } })).toMatchObject({ status: "reconciliation_required" });
    expect(await prisma.queueDeadLetter.findUnique({ where: { failedAttemptId: c!.attemptId } })).toMatchObject({ classification: "reconciliation" });
    expect(await prisma.queueReservation.count({ where: { attemptId: c!.attemptId, releasedAt: null, disposition: "uncertain" } })).toBe(1);
    await expect(settleQueueSuccess(c!.lease, handler, "late")).rejects.toThrow("QUEUE_LEASE_LOST");
    await expect(renewQueueLease(c!.lease)).rejects.toThrow("QUEUE_LEASE_LOST");
  });

  it("cancellation blocks late results and shutdown drains without taking new work", async () => {
    const job = await register();
    let release!: () => void;
    const started = new Promise<void>(resolve => { release = resolve; });
    let finish!: () => void;
    const waiting = new Promise<void>(resolve => { finish = resolve; });
    const r = runner({ ...handler, async execute(_job, context) {
      release(); await waiting; await context.assertOwned(); return "late";
    } });
    await r.pump(); await started;
    await withQueueTransaction(tx => requestQueueCancellationTx(tx, job.id));
    const stopping = r.stop({ drainTimeoutMs: 1_000 });
    const next = await register();
    finish(); await stopping;
    expect((await prisma.queueJob.findUnique({ where: { id: job.id } }))?.status).toBe("cancelled");
    expect((await prisma.queueJob.findUnique({ where: { id: next.id } }))?.status).toBe("ready");
    expect(await r.pump()).toBe(0);
  });

  it("never calls execute when prepare transaction fails", async () => {
    await register();
    let calls = 0;
    const r = runner({ ...handler,
      async prepareTx() { throw new Error("PREPARE_FAILED"); },
      async execute() { calls++; },
    });
    await expect(r.pump()).rejects.toThrow("PREPARE_FAILED");
    expect(calls).toBe(0);
    expect(await prisma.queueAttempt.count({ where: { job: { ownerScopeDigest: digest } } })).toBe(0);
  });
});
