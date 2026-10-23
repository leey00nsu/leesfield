// @vitest-environment node
import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { readFile } from "node:fs/promises";
import { Client } from "pg";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { postgresIntegrationEnabled } from "@/test-utils/postgres-integration";
import { runQueueBootstrap } from "../../../scripts/production/job-queue-bootstrap.mjs";
import { runQueueTransition } from "../../../scripts/production/job-queue-transition.mjs";

const sources = ["ImageGeneration", "VideoGeneration", "AudioGeneration", "MediaOperation", "AssistantExecution", "MediaCleanupTask", "ModelCatalog", "ModalComfyJob"];
const queueTables = ["QueueRuntime", "QueueJob", "QueueAttempt", "QueueOrderGroup", "QueueResource", "QueueJobResource", "QueueReservation", "QueueDeadLetter", "QueueAdminAction"];

describe.skipIf(!postgresIntegrationEnabled)("automatic first queue bootstrap and durable redeployment", () => {
  let db: Client;
  let schema: string;
  let environment: NodeJS.ProcessEnv;
  const children: Array<{ child: ReturnType<typeof spawn>; closed: Promise<unknown[]> }> = [];
  const remote = vi.fn(() => { throw new Error("BOOTSTRAP_MUST_NOT_CALL_PROVIDER"); });
  beforeEach(async () => {
    schema = "queue_bootstrap_" + randomUUID().replaceAll("-", "");
    const url = new URL(process.env.DATABASE_URL!);
    url.searchParams.set("options", "-c search_path=" + schema + ",public");
    environment = { ...process.env, NODE_ENV: "test", DATABASE_URL: url.toString(), SESSION_PASSWORD: "bootstrap-fixture-secret-longer-than32" };
    db = new Client({ connectionString: environment.DATABASE_URL });
    await db.connect();
    await db.query('CREATE SCHEMA "' + schema + '"');
    for (const table of sources) await db.query(`CREATE TABLE "${table}" (LIKE public."${table}" INCLUDING ALL)`);
    await db.query('ALTER TABLE "MediaCleanupTask" DROP COLUMN "queueRevision"');
    await db.query(await readFile("prisma/migrations/20261023000000_shared_job_queue/migration.sql", "utf8"));
    remote.mockClear(); vi.stubGlobal("fetch", remote);
  });
  afterEach(async () => {
    for (const { child, closed } of children.splice(0)) {
      if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
      await closed;
    }
    expect(remote).not.toHaveBeenCalled(); vi.unstubAllGlobals();
    await db.query("ROLLBACK");
    await db.query('DROP SCHEMA "' + schema + '" CASCADE'); await db.end();
  });
  async function generation(id: string, status = "pending", valid = true) {
    await db.query(`INSERT INTO "ImageGeneration" (id,"requestId","ownerEmail",prompt,"modelKey","requestParams",status,progress,"updatedAt")
      VALUES ($1,$1,'bootstrap@example.test','retained prompt',$2,$3::jsonb,$4,0,now())`,
    [id, valid ? "legacy-model" : null, valid ? '{"model":"legacy-model"}' : "{}", status]);
  }
  async function cleanup(id: string, status: string, attempts = 0) {
    await db.query(`INSERT INTO "MediaCleanupTask" (id,"storageProvider","storageObjectId",reason,status,attempts,"retryAt","updatedAt")
      VALUES ($1,'leemage',$1,'upload_failed',$2,$3,now()+interval '1 hour',now())`, [id, status, attempts]);
  }
  const runtime = async () => (await db.query('SELECT * FROM "QueueRuntime" WHERE id=1')).rows[0];
  async function snapshot() {
    const result: Record<string, unknown> = {};
    for (const table of [...sources, ...queueTables]) result[table] = (await db.query(`SELECT to_jsonb(t) AS row FROM "${table}" t ORDER BY t::text`)).rows;
    return result;
  }
  function cli(overrides: Partial<NodeJS.ProcessEnv> = {}) {
    const child = spawn(process.execPath, ["scripts/production/job-queue-bootstrap.mjs"], { env: { ...environment, ...overrides }, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "", stderr = "";
    child.stdout!.on("data", chunk => { stdout += chunk; }); child.stderr!.on("data", chunk => { stderr += chunk; });
    const closed = once(child, "close"); children.push({ child, closed });
    return { child, closed, async result() { const [code, signal] = await closed; return { code, signal, stdout, stderr }; } };
  }

  it("initializes an empty database through the real CLI, and repeated startup writes nothing", async () => {
    const first = await cli().result(); expect(first.code).toBe(0);
    expect(first.stdout).toContain('"state":"initialized"');
    expect(await runtime()).toMatchObject({ mode: "shared", epoch: 2, migrationVerified: true, migrationCursor: { everShared: true } });
    const before = await snapshot();
    const second = await cli().result(); expect(second.code).toBe(0);
    expect(second.stdout).toContain('"state":"already_ready"'); expect(await snapshot()).toEqual(before);
  });

  it("imports more than one batch while preserving protected intents, terminal history and cleanup failures", async () => {
    for (let n = 0; n < 101; n++) await generation("image-" + String(n).padStart(3, "0"));
    await generation("completed", "completed");
    await cleanup("linked", "linked"); await cleanup("uploading", "uploading"); await cleanup("failed", "failed", 5); await cleanup("completed", "completed");
    expect(await runQueueBootstrap(environment)).toMatchObject({ state: "initialized", epoch: 2 });
    const jobs = (await db.query('SELECT "sourceId", status FROM "QueueJob" ORDER BY "sourceId"')).rows;
    expect(jobs).toHaveLength(104);
    expect(jobs.filter(j => j.status === "ready").map(j => j.sourceId)).toEqual(Array.from({ length: 101 }, (_, n) => "image-" + String(n).padStart(3, "0")));
    expect(jobs.filter(j => j.status === "suspended").map(j => j.sourceId)).toEqual(["linked", "uploading"]);
    expect(jobs.find(j => j.sourceId === "failed")?.status).toBe("dead_letter");
    expect((await db.query('SELECT count(*)::int AS n FROM "QueueDeadLetter"')).rows[0].n).toBe(1);
    expect((await db.query('SELECT count(*)::int AS n FROM "QueueAttempt"')).rows[0].n).toBe(5);
    expect((await db.query(`SELECT status FROM "ImageGeneration" WHERE id='completed'`)).rows[0].status).toBe("completed");
  });

  it("resumes the committed cursor after an actual bootstrap process is killed during its next batch", async () => {
    for (let n = 0; n < 101; n++) await generation("image-" + String(n).padStart(3, "0"));
    await runQueueTransition("backfill", { expectedEpoch: 1 }, environment);
    const before = await snapshot();
    const blocker = new Client({ connectionString: environment.DATABASE_URL }); await blocker.connect();
    try {
      await blocker.query("BEGIN"); await blocker.query(`SELECT id FROM "ImageGeneration" WHERE id='image-100' FOR UPDATE`);
      const running = cli();
      await expect.poll(async () => (await db.query(`SELECT count(*)::int AS n FROM pg_stat_activity WHERE application_name='leesfield-queue-transition' AND wait_event_type='Lock'`)).rows[0].n, { timeout: 1500 }).toBe(1);
      running.child.kill("SIGKILL"); await running.closed;
      await blocker.query("ROLLBACK");
      expect(await snapshot()).toEqual(before);
    } finally { await blocker.end(); }
    expect((await cli().result()).code).toBe(0);
    expect((await db.query('SELECT count(*)::int AS n FROM "QueueJob"')).rows[0].n).toBe(101);
    expect((await runtime()).epoch).toBe(2);
  }, 20_000);

  it("converges two independent startup processes to a single activation", async () => {
    await generation("concurrent");
    const one = cli(), two = cli();
    const results = await Promise.all([one.result(), two.result()]);
    expect(results.map(r => ({ code: r.code, stderr: r.stderr }))).toEqual([{ code: 0, stderr: "" }, { code: 0, stderr: "" }]);
    expect(await runtime()).toMatchObject({ mode: "shared", epoch: 2 });
    expect((await db.query('SELECT count(*)::int AS n FROM "QueueJob"')).rows[0].n).toBe(1);
  });

  it.each(["UTC", "Asia/Seoul"])("preserves database UTC timestamps and uploading protection with process TZ=%s", async TZ => {
    await generation("dated"); await cleanup("protected", "uploading");
    await db.query(`UPDATE "ImageGeneration" SET "createdAt"='2026-01-01 12:34:56.123' WHERE id='dated'`);
    const result = await cli({ TZ }).result(); expect(result.code).toBe(0);
    expect((await db.query(`SELECT count(*)::int AS n FROM "QueueJob" j JOIN "ImageGeneration" s ON s.id=j."sourceId"
      WHERE j."createdAt"<>s."createdAt" OR j."availableAt"<>s."createdAt"`)).rows[0].n).toBe(0);
    expect((await db.query(`SELECT j.status, j."availableAt"=s."retryAt" AS "sameRetryAt", s.status AS "sourceStatus"
      FROM "QueueJob" j JOIN "MediaCleanupTask" s ON s.id=j."sourceId" WHERE s.id='protected'`)).rows[0]).toEqual({ status: "suspended", sameRetryAt: true, sourceStatus: "uploading" });
  });

  it("leaves an active lease, unknown reservations, DLQ and audit unchanged on redeploy", async () => {
    await generation("active"); await cleanup("failed", "failed", 5); await runQueueBootstrap(environment);
    const job = (await db.query(`SELECT * FROM "QueueJob" WHERE "sourceId"='active'`)).rows[0];
    const attempt = randomUUID();
    await db.query("BEGIN");
    await db.query(`INSERT INTO "QueueAttempt" (id,"jobId","lifetimeOrdinal",cycle,"cycleOrdinal","executionType","executionId","workerInstanceId","leaseVersion","leaseUntil","runtimeEpoch",phase)
      VALUES ($1,$2,1,1,1,'image_generation','active',$3,1,now()+interval '1 minute',2,'remote_started')`, [attempt, job.id, randomUUID()]);
    await db.query(`UPDATE "QueueJob" SET status='active',"currentAttemptId"=$1,version=1 WHERE id=$2`, [attempt, job.id]);
    await db.query(`UPDATE "ImageGeneration" SET status='processing' WHERE id='active'`);
    await db.query(`INSERT INTO "QueueReservation" ("attemptId","resourceKey",disposition) SELECT $1,"resourceKey",'uncertain' FROM "QueueJobResource" WHERE "jobId"=$2`, [attempt, job.id]);
    await db.query(`INSERT INTO "QueueAdminAction" ("requestId","requestFingerprint","actorDigest",action,"safeReason",outcome) VALUES ($1,$2,$2,'reconcile','TEST_PENDING','accepted')`, [randomUUID(), "a".repeat(64)]);
    await db.query("COMMIT");
    const before = await snapshot();
    expect((await cli().result()).code).toBe(0);
    expect(await snapshot()).toEqual(before);
  });

  it("preserves an operator pause and refuses startup without altering any stored record", async () => {
    await cleanup("failed", "failed", 5); await runQueueBootstrap(environment);
    await runQueueTransition("pause", { expectedEpoch: 2 }, environment);
    const before = await snapshot(); const result = await cli().result();
    expect(result.code).toBe(1); expect(result.stderr).toContain("QUEUE_BOOTSTRAP_OPERATOR_PAUSED");
    expect(await snapshot()).toEqual(before);
  });

  it("does not scan or lock source tables when an existing queue is ready", async () => {
    await runQueueBootstrap(environment);
    const blocker = new Client({ connectionString: environment.DATABASE_URL }); await blocker.connect();
    try {
      await blocker.query("BEGIN"); await blocker.query('LOCK TABLE "ImageGeneration" IN ACCESS EXCLUSIVE MODE');
      expect(await runQueueBootstrap(environment, { timeoutMs: 500 })).toMatchObject({ state: "already_ready", epoch: 2 });
    } finally { await blocker.query("ROLLBACK"); await blocker.end(); }
  });

  it("rejects ambiguous initial metadata rather than resetting it", async () => {
    await db.query(`UPDATE "QueueRuntime" SET "migrationVerified"=true`);
    const before = await snapshot();
    await expect(runQueueBootstrap(environment)).rejects.toThrow("QUEUE_BOOTSTRAP_INVALID_STATE");
    expect(await snapshot()).toEqual(before);
  });

  it("fails an invalid source atomically and permits a corrected restart", async () => {
    await generation("a-valid"); await generation("b-invalid", "pending", false);
    const before = await snapshot(); const result = await cli().result();
    expect(result.code).toBe(1); expect(result.stderr).not.toContain(environment.DATABASE_URL!);
    expect(result.stderr).not.toContain(environment.SESSION_PASSWORD!); expect(await snapshot()).toEqual(before);
    await db.query(`UPDATE "ImageGeneration" SET "modelKey"='legacy-model' WHERE id='b-invalid'`);
    expect((await cli().result()).code).toBe(0);
    expect((await db.query('SELECT count(*)::int AS n FROM "QueueJob"')).rows[0].n).toBe(2);
  });

  it("refuses unexpected active legacy work without importing or mutating it", async () => {
    await generation("unexpected-active", "processing"); const before = await snapshot();
    await expect(runQueueBootstrap(environment)).rejects.toThrow("TRANSITION_EXPECTED_IDLE");
    expect(await snapshot()).toEqual(before);
  });

  it("aborts a blocked transaction at the overall deadline and releases its connection", async () => {
    const blocker = new Client({ connectionString: environment.DATABASE_URL }); await blocker.connect();
    const before = await snapshot(); const started = Date.now();
    try {
      await blocker.query("BEGIN"); await blocker.query("SELECT pg_advisory_xact_lock(hashtext($1))", ["leesfield:shared-job-queue"]);
      await expect(runQueueBootstrap(environment, { timeoutMs: 100 })).rejects.toThrow("QUEUE_BOOTSTRAP_TIMEOUT");
      expect(Date.now() - started).toBeLessThan(1500);
      await blocker.query("ROLLBACK");
      await expect.poll(async () => (await db.query(`SELECT count(*)::int AS n FROM pg_stat_activity WHERE application_name='leesfield-queue-transition'`)).rows[0].n).toBe(0);
      expect(await snapshot()).toEqual(before);
    } finally { await blocker.end(); }
    expect(await runQueueBootstrap(environment)).toMatchObject({ state: "initialized" });
  });
});
