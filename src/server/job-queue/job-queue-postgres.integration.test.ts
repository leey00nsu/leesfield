// @vitest-environment node
import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/server/db/prisma";
import { postgresIntegrationEnabled } from "@/test-utils/postgres-integration";
import { enqueueQueueJobTx } from "./job-queue-registration";
import { claimQueueJob, type ClaimedQueueJob } from "./job-queue-scheduler";
import { withQueueTransaction } from "./job-queue-transaction";

describe.skipIf(!postgresIntegrationEnabled)("shared queue registration and dispatch", () => {
  const digest = "c".repeat(64);
  const modelKeys: string[] = [];
  const resourceKeys: string[] = [];
  beforeAll(async () => {
    await prisma.queueRuntime.update({ where: { id: 1 }, data: { migrationVerified: true, mode: "shared" } });
  });
  afterEach(async () => {
    await withQueueTransaction(async tx => {
      const jobs = await tx.queueJob.findMany({ where: { ownerScopeDigest: digest }, select: { id: true } });
      const ids = jobs.map(j => j.id);
      await tx.queueAttempt.updateMany({ where: { jobId: { in: ids }, finishedAt: null }, data: { phase: "ended", outcome: "cancelled", finishedAt: new Date() } });
      await tx.queueJob.updateMany({ where: { id: { in: ids } }, data: { status: "cancelled", currentAttemptId: null } });
      await tx.queueOrderGroup.updateMany({ where: { ownerScopeDigest: digest }, data: { blockedByJobId: null } });
      await tx.queueReservation.deleteMany({ where: { attempt: { jobId: { in: ids } } } });
      await tx.queueAttempt.deleteMany({ where: { jobId: { in: ids } } });
      await tx.queueJobResource.deleteMany({ where: { jobId: { in: ids } } });
      await tx.queueJob.deleteMany({ where: { id: { in: ids } } });
      await tx.queueOrderGroup.deleteMany({ where: { ownerScopeDigest: digest } });
    });
    await prisma.queueResource.deleteMany({ where: { key: { in: resourceKeys } } });
    await prisma.modelCatalog.deleteMany({ where: { key: { in: modelKeys } } });
  });
  afterAll(async () => {
    await prisma.queueRuntime.update({ where: { id: 1 }, data: { mode: "paused", migrationVerified: false } });
  });
  const register = (orderKey?: string, extra = {}) => withQueueTransaction(tx => {
    const id = randomUUID();
    return enqueueQueueJobTx(tx, {
      kind: "generate_image", source: { type: "image_generation", id },
      ownerScopeDigest: digest, snapshotRef: id, orderKey, ...extra,
    });
  });
  const claim = () => claimQueueJob(randomUUID());

  async function finish(claimed: ClaimedQueueJob) {
    await withQueueTransaction(async tx => {
      await tx.queueAttempt.update({ where: { id: claimed.attemptId }, data: { phase: "ended", outcome: "succeeded", finishedAt: new Date() } });
      await tx.queueReservation.updateMany({ where: { attemptId: claimed.attemptId }, data: { releasedAt: new Date() } });
      await tx.queueJob.update({ where: { id: claimed.job.id }, data: { status: "succeeded" } });
      if (claimed.job.orderGroupId) await tx.queueOrderGroup.update({ where: { id: claimed.job.orderGroupId }, data: { headSequence: { increment: 1 } } });
    });
  }

  it("commits domain registration atomically and converges concurrent duplicate identity", async () => {
    const id = randomUUID();
    const input = { kind: "generate_image" as const, source: { type: "image_generation" as const, id }, ownerScopeDigest: digest, snapshotRef: id };
    const rows = await Promise.all(Array.from({ length: 8 }, () => withQueueTransaction(tx => enqueueQueueJobTx(tx, input))));
    expect(new Set(rows.map(r => r.id)).size).toBe(1);
    const sourceId = randomUUID();
    await expect(withQueueTransaction(async tx => {
      await tx.imageGeneration.create({ data: { requestId: sourceId, prompt: "rollback", status: "pending", progress: 0 } });
      await enqueueQueueJobTx(tx, { ...input, source: { type: "image_generation", id: sourceId } });
      throw new Error("ROLLBACK");
    })).rejects.toThrow("ROLLBACK");
    expect(await prisma.imageGeneration.findUnique({ where: { requestId: sourceId } })).toBeNull();
    expect(await prisma.queueJob.count({ where: { sourceId } })).toBe(0);
  });

  it("assigns persistent order and does not dispatch a successor while its head runs", async () => {
    const key = randomUUID();
    const jobs = await Promise.all(Array.from({ length: 6 }, () => register(key)));
    expect(new Set(jobs.map(j => j.sequence?.toString())).size).toBe(6);
    const first = jobs.find(j => j.sequence === BigInt(1))!;
    const claims = (await Promise.all(Array.from({ length: 8 }, claim))).filter((c): c is ClaimedQueueJob => Boolean(c));
    expect(claims).toHaveLength(1);
    expect(claims[0]!.job.id).toBe(first.id);
    const independent = await register();
    expect((await claim())?.job.id).toBe(independent.id);
    await finish(claims[0]!);
    expect((await claim())?.job.sequence).toBe(BigInt(2));
  });

  it("shares a global pool across concurrent callers and keeps uncertain reservations occupied", async () => {
    await Promise.all(Array.from({ length: 12 }, () => register()));
    const claims = (await Promise.all(Array.from({ length: 16 }, claim))).filter((c): c is ClaimedQueueJob => Boolean(c));
    expect(claims).toHaveLength(4);
    expect(new Set(claims.map(c => c.job.id)).size).toBe(4);
    const c = claims[0]!;
    await withQueueTransaction(async tx => {
      await tx.queueAttempt.update({ where: { id: c.attemptId }, data: { phase: "ended", outcome: "reconciliation_required", finishedAt: new Date() } });
      await tx.queueJob.update({ where: { id: c.job.id }, data: { status: "reconciliation_required" } });
      await tx.queueReservation.updateMany({ where: { attemptId: c.attemptId }, data: { disposition: "uncertain" } });
    });
    expect(await claim()).toBeNull();
    expect(await prisma.queueReservation.count({ where: { resourceKey: "generation", releasedAt: null } })).toBe(4);
  });

  it("skips a saturated prefix before LIMIT and reads current model caps", async () => {
    const key = "queue-model-" + randomUUID();
    modelKeys.push(key);
    const resourceKey = "model:" + key;
    resourceKeys.push(resourceKey);
    await prisma.modelCatalog.create({ data: {
      type: "image", key, label: "queue test", vendor: "test", provider: "hf_space",
      providerConfig: {}, parameters: {}, meta: { concurrent_limit: 1 }, isActive: true,
    } });
    const resources = [{ type: "model", key: resourceKey, modelType: "image", modelKey: key }];
    for (let n = 0; n < 65; n++) await register(undefined, { resources });
    const first = await claim();
    expect(first).not.toBeNull();
    const free = await register();
    expect((await claim())?.job.id).toBe(free.id);
    expect(await claim()).toBeNull();
    await prisma.modelCatalog.update({ where: { key }, data: { meta: { concurrent_limit: 2 } } });
    expect(await claim()).not.toBeNull();
  });

  it("waits for an independent DB transaction and never exposes its uncommitted group head", async () => {
    const client = new Client({ connectionString: process.env.DATABASE_URL });
    await client.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT pg_advisory_xact_lock(hashtext('leesfield:shared-job-queue'))");
      let registered = false;
      const pending = register(randomUUID()).then(r => { registered = true; return r; });
      await new Promise(resolve => setTimeout(resolve, 40));
      expect(registered).toBe(false);
      await client.query("COMMIT");
      expect((await pending).sequence).toBe(BigInt(1));
    } finally { await client.query("ROLLBACK"); await client.end(); }
  });
});
