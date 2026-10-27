// @vitest-environment node
import { randomUUID } from "node:crypto";
import { execFile, spawn, type ChildProcess } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";
import { prisma } from "@/server/db/prisma";
import { postgresIntegrationEnabled } from "@/test-utils/postgres-integration";
import { removeFixtureQueueJobs } from "@/test-utils/job-queue-postgres";
import { withQueueTransaction } from "./job-queue-transaction";
import { enqueueQueueJobTx } from "./job-queue-registration";

const exec = promisify(execFile);

describe.skipIf(!postgresIntegrationEnabled)("queue OS-process crash and shutdown", () => {
  it("retains unknown slots after SIGKILL, continues independent work and drains SIGTERM", async () => {
    const directory = await mkdtemp(join(tmpdir(), "leesfield-queue-process-"));
    const tracePath = join(directory, "calls.jsonl");
    const sourceIds: string[] = [];
    const digest = "f".repeat(64);
    const children: Array<{ child: ChildProcess; closed: Promise<unknown> }> = [];
    const trace = async (): Promise<Array<{ event: string; pid: number; jobId?: string; kind?: string }>> => {
      try { return (await readFile(tracePath, "utf8")).trim().split("\n").filter(Boolean).map(line => JSON.parse(line)); }
      catch { return []; }
    };
    const start = () => {
      const child = spawn(process.execPath, ["--loader", "./src/test-utils/queue-process-loader.mjs", "./src/test-utils/queue-process-fixture.mjs"], {
        env: { ...process.env, QUEUE_PROCESS_TRACE: tracePath }, stdio: ["ignore", "ignore", "pipe"],
      });
      let errors = "";
      child.stderr!.on("data", chunk => { errors = (errors + chunk).slice(-5000); });
      const closed = once(child, "close"); children.push({ child, closed });
      return { child, closed, assertRunning() { if (child.exitCode !== null) throw new Error("QUEUE_CHILD_EXITED: " + errors); } };
    };
    const bootstrap = async () => {
      const result = await exec(process.execPath, ["./scripts/production/job-queue-bootstrap.mjs"], { env: process.env, timeout: 5000 });
      expect(result.stdout).toContain('"state":"already_ready"');
    };
    const generationState = async () => ({
      runtime: await prisma.queueRuntime.findUniqueOrThrow({ where: { id: 1 }, select: { mode: true, epoch: true, migrationVerified: true, migrationCursor: true } }),
      jobs: await prisma.queueJob.findMany({ where: { ownerScopeDigest: digest, kind: "generate_image" }, orderBy: { id: "asc" } }),
      attempts: await prisma.queueAttempt.findMany({ where: { job: { ownerScopeDigest: digest, kind: "generate_image" } }, orderBy: { id: "asc" } }),
      reservations: await prisma.queueReservation.findMany({ where: { attempt: { job: { ownerScopeDigest: digest, kind: "generate_image" } } }, orderBy: [{ attemptId: "asc" }, { resourceKey: "asc" }] }),
      dlq: await prisma.queueDeadLetter.findMany({ where: { job: { ownerScopeDigest: digest } }, orderBy: { id: "asc" } }),
      groups: await prisma.queueOrderGroup.findMany({ where: { ownerScopeDigest: digest }, orderBy: { id: "asc" } }),
    });
    const register = (kind: "generate_image" | "assistant", orderKey?: string) => withQueueTransaction(tx => {
      const id = randomUUID(); sourceIds.push(id);
      return enqueueQueueJobTx(tx, { kind, source: { type: kind === "assistant" ? "assistant_execution" : "image_generation", id },
        ownerScopeDigest: digest, snapshotRef: id, orderKey });
    });
    try {
      await prisma.queueRuntime.update({ where: { id: 1 }, data: { mode: "shared", migrationVerified: true } });
      const group = randomUUID();
      const head = await register("generate_image", group);
      const tail = await register("generate_image", group);
      for (let n = 0; n < 4; n++) await register("generate_image");
      await bootstrap();
      const first = start();
      await expect.poll(async () => { first.assertRunning(); return (await trace()).filter(e => e.event === "start").length; }, { timeout: 15_000 }).toBe(4);
      expect(await prisma.queueReservation.count({ where: { resourceKey: "generation", releasedAt: null } })).toBe(4);
      await bootstrap(); // A redeploy can start while another server holds live leases.
      const second = start();
      await expect.poll(async () => {
        second.assertRunning();
        return (await trace()).some(e => e.pid === second.child.pid && e.event === "ready");
      }, { timeout: 15_000 }).toBe(true);
      // Both live runners may claim assistant work. Kill the first before
      // enqueueing so the second PID is a deterministic ownership assertion.
      first.child.kill("SIGKILL"); await first.closed;
      expect(await prisma.queueReservation.count({ where: { resourceKey: "generation", releasedAt: null } })).toBe(4);
      const independent = await register("assistant");
      await expect.poll(async () => (await prisma.queueJob.findUniqueOrThrow({ where: { id: independent.id } })).status, { timeout: 15_000 }).toBe("succeeded");
      expect((await trace()).find(e => e.jobId === independent.id && e.event === "start")?.pid).toBe(second.child.pid);
      await prisma.queueAttempt.updateMany({ where: { job: { ownerScopeDigest: digest, kind: "generate_image" }, finishedAt: null },
        data: { leaseUntil: new Date(Date.now() - 1) } });
      await expect.poll(async () => (await prisma.queueJob.findUniqueOrThrow({ where: { id: head.id } })).status, { timeout: 5000 }).toBe("reconciliation_required");
      expect(await prisma.queueDeadLetter.count({ where: { job: { ownerScopeDigest: digest }, classification: "reconciliation" } })).toBe(4);
      expect(await prisma.queueReservation.count({ where: { resourceKey: "generation", releasedAt: null, disposition: "uncertain" } })).toBe(4);
      expect((await prisma.queueJob.findUniqueOrThrow({ where: { id: tail.id } })).status).toBe("ready");
      const starts = (await trace()).filter(e => e.event === "start");
      expect(new Set(starts.map(e => e.jobId)).size).toBe(starts.length);
      expect(starts.some(e => e.jobId === tail.id)).toBe(false);
      second.child.kill("SIGTERM");
      expect(await second.closed).toEqual([0, null]);
      expect((await trace()).some(e => e.pid === second.child.pid && e.event === "disconnected")).toBe(true);
      // Every old worker is now gone. Reuse the DB with a new startup process.
      const preserved = await generationState();
      const completed = await prisma.queueJob.findUniqueOrThrow({ where: { id: independent.id } });
      const afterRestart = await register("assistant");
      expect((await prisma.queueJob.findUniqueOrThrow({ where: { id: afterRestart.id } })).status).toBe("ready");
      await bootstrap();
      const third = start();
      await expect.poll(async () => (await prisma.queueJob.findUniqueOrThrow({ where: { id: afterRestart.id } })).status, { timeout: 15_000 }).toBe("succeeded");
      third.child.kill("SIGTERM"); expect(await third.closed).toEqual([0, null]);
      expect(await generationState()).toEqual(preserved);
      expect(await prisma.queueJob.findUniqueOrThrow({ where: { id: independent.id } })).toEqual(completed);
      const restartedStarts = (await trace()).filter(e => e.event === "start");
      expect(new Set(restartedStarts.map(e => e.jobId)).size).toBe(restartedStarts.length);
      expect(restartedStarts.find(e => e.jobId === afterRestart.id)?.pid).toBe(third.child.pid);
      expect(restartedStarts.some(e => e.jobId === tail.id)).toBe(false);
    } finally {
      for (const { child, closed } of children) {
        if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
        await closed;
      }
      await removeFixtureQueueJobs(sourceIds);
      await prisma.queueOrderGroup.deleteMany({ where: { ownerScopeDigest: digest } });
      await prisma.queueRuntime.update({ where: { id: 1 }, data: { mode: "paused", migrationVerified: false } });
      await rm(directory, { recursive: true, force: true });
    }
  }, 40_000);
});
