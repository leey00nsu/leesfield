// @vitest-environment node
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { Client } from "pg";
import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@/server/db/prisma";
import { queueDatabaseNow } from "./job-queue-transaction";
import { postgresIntegrationEnabled } from "@/test-utils/postgres-integration";

describe.skipIf(!postgresIntegrationEnabled)("shared queue database invariants", () => {
  const ids: string[] = [];
  const groupIds: string[] = [];
  const digest = "a".repeat(64);
  const create = async (overrides = {}) => {
    const id = randomUUID();
    ids.push(id);
    return prisma.queueJob.create({ data: {
      id, kind: "generate_image", sourceType: "image_generation",
      sourceId: id, snapshotRef: "image:" + id, executionType: "image_generation",
      executionId: id, ownerScopeDigest: digest, ...overrides,
    } });
  };
  afterAll(async () => {
    await prisma.$transaction(async tx => {
      await tx.queueAttempt.updateMany({ where: { jobId: { in: ids }, finishedAt: null }, data: { phase: "ended", outcome: "cancelled", finishedAt: await queueDatabaseNow(tx) } });
      await tx.queueJob.updateMany({ where: { id: { in: ids } }, data: { currentAttemptId: null, status: "cancelled" } });
    });
    await prisma.queueDeadLetter.deleteMany({ where: { jobId: { in: ids } } });
    await prisma.queueAttempt.deleteMany({ where: { jobId: { in: ids } } });
    await prisma.queueJob.deleteMany({ where: { id: { in: ids } } });
    await prisma.queueOrderGroup.deleteMany({ where: { id: { in: groupIds } } });
  });

  it("starts paused and retains the previous generation/cleanup schema", async () => {
    expect(await prisma.queueRuntime.findUnique({ where: { id: 1 } })).toMatchObject({
      mode: "paused", epoch: 1, migrationVerified: false,
    });
    const row = await prisma.imageGeneration.create({ data: {
      requestId: randomUUID(), prompt: "preserved", status: "failed", progress: 0,
      executionLeaseVersion: 4, requestParams: { stable: true },
    } });
    try {
      expect(await prisma.imageGeneration.findUnique({ where: { id: row.id } })).toMatchObject({
        prompt: "preserved", status: "failed", executionLeaseVersion: 4, requestParams: { stable: true },
      });
    } finally { await prisma.imageGeneration.delete({ where: { id: row.id } }); }
    await expect(prisma.queueRuntime.update({ where: { id: 1 }, data: { mode: "shared" } })).rejects.toThrow();
  });

  it("rejects duplicate identity, invalid policy, mismatched kind and changed identity", async () => {
    const job = await create();
    await expect(create({ sourceId: job.sourceId })).rejects.toThrow();
    await expect(create({ maxAttempts: 0 })).rejects.toThrow();
    await expect(create({ sourceType: "video_generation" })).rejects.toThrow();
    await expect(create({ orderGroupId: null, sequence: BigInt(1) })).rejects.toThrow();
    await expect(prisma.queueJob.update({ where: { id: job.id }, data: { sourceId: "different" } })).rejects.toThrow();
    await expect(prisma.$executeRawUnsafe('UPDATE "QueueJob" SET "status" = \'not_supported\' WHERE "id" = $1::uuid', job.id)).rejects.toThrow();
  });

  it("rolls back partial writes and rejects active jobs without their own running attempt", async () => {
    const id = randomUUID();
    ids.push(id);
    await expect(prisma.$transaction(async tx => {
      await tx.queueJob.create({ data: {
        id, kind: "assistant", sourceType: "assistant_execution",
        sourceId: id, snapshotRef: id, ownerScopeDigest: digest,
        executionType: "assistant_execution", executionId: id,
      } });
      throw new Error("rollback");
    })).rejects.toThrow("rollback");
    expect(await prisma.queueJob.findUnique({ where: { id } })).toBeNull();
    await expect(create({ status: "active" })).rejects.toThrow();
    const a = await create();
    const b = await create();
    const attemptId = randomUUID();
    await prisma.$transaction(async tx => {
      await tx.queueAttempt.create({ data: {
        id: attemptId, jobId: a.id, lifetimeOrdinal: 1, cycle: 1, cycleOrdinal: 1,
        executionType: a.executionType, executionId: a.executionId,
        workerInstanceId: randomUUID(), leaseVersion: 1, runtimeEpoch: 1,
        leaseUntil: new Date(Date.now() + 60_000),
      } });
      await tx.queueJob.update({ where: { id: a.id }, data: { status: "active", currentAttemptId: attemptId } });
    });
    await expect(prisma.queueJob.update({ where: { id: b.id }, data: { status: "active", currentAttemptId: attemptId } })).rejects.toThrow();
    await expect(prisma.queueAttempt.create({ data: {
      jobId: a.id, lifetimeOrdinal: 2, cycle: 1, cycleOrdinal: 2,
      executionType: a.executionType, executionId: a.executionId,
      workerInstanceId: randomUUID(), leaseVersion: 2, runtimeEpoch: 1,
      leaseUntil: new Date(Date.now() + 60_000),
    } })).rejects.toThrow();
    await prisma.$transaction(async tx => {
      await tx.queueAttempt.update({ where: { id: attemptId }, data: {
        phase: "ended", outcome: "failed", finishedAt: await queueDatabaseNow(tx),
      } });
      await tx.queueJob.update({ where: { id: a.id }, data: { status: "dead_letter" } });
      await tx.queueDeadLetter.create({ data: {
        jobId: a.id, failedAttemptId: attemptId, classification: "terminal",
        safeErrorCode: "TEST_FAILURE", phase: "execute",
      } });
    });
    await expect(prisma.queueDeadLetter.create({ data: {
      jobId: a.id, failedAttemptId: attemptId, classification: "terminal",
      safeErrorCode: "TEST_FAILURE", phase: "execute",
    } })).rejects.toThrow();
  });

  it("enforces group owner and unique order without allowing a foreign blocker", async () => {
    const group = await prisma.queueOrderGroup.create({ data: { ownerScopeDigest: digest, opaqueKey: randomUUID() } });
    groupIds.push(group.id);
    await create({ orderGroupId: group.id, sequence: BigInt(1) });
    await expect(create({ orderGroupId: group.id, sequence: BigInt(1) })).rejects.toThrow();
    await expect(create({ orderGroupId: group.id, sequence: BigInt(2), ownerScopeDigest: "b".repeat(64) })).rejects.toThrow();
    const foreign = await create();
    await expect(prisma.queueOrderGroup.update({ where: { id: group.id }, data: { blockedByJobId: foreign.id } })).rejects.toThrow();
  });

  it("applies the additive migration to a pre-queue schema without changing existing rows", async () => {
    const client = new Client({ connectionString: process.env.DATABASE_URL });
    const schema = "queue_upgrade_" + randomUUID().replaceAll("-", "");
    await client.connect();
    try {
      await client.query("BEGIN");
      await client.query('CREATE SCHEMA "' + schema + '"');
      await client.query('SET LOCAL search_path TO "' + schema + '", public');
      await client.query('CREATE TABLE "MediaCleanupTask" ("id" text PRIMARY KEY, "attempts" integer NOT NULL, "status" text NOT NULL)');
      await client.query('INSERT INTO "MediaCleanupTask" VALUES (\'retained\', 3, \'failed\')');
      const sql = await readFile("prisma/migrations/20261023000000_shared_job_queue/migration.sql", "utf8");
      await client.query(sql);
      expect((await client.query('SELECT * FROM "MediaCleanupTask"')).rows).toEqual([
        { id: "retained", attempts: 3, status: "failed", queueRevision: 0 },
      ]);
      expect((await client.query('SELECT mode FROM "QueueRuntime"')).rows[0]).toEqual({ mode: "paused" });
    } finally {
      await client.query("ROLLBACK");
      await client.end();
    }
  });
});
