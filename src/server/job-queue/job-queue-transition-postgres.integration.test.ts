// @vitest-environment node
import { randomUUID } from "node:crypto";
import { execFile, spawn } from "node:child_process";
import { once } from "node:events";
import { readFile } from "node:fs/promises";
import { promisify } from "node:util";
import { Client } from "pg";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { postgresIntegrationEnabled } from "@/test-utils/postgres-integration";
import { runQueueTransition } from "../../../scripts/production/job-queue-transition.mjs";

const exec = promisify(execFile);
const sourceTables = ["ImageGeneration", "VideoGeneration", "AudioGeneration", "MediaOperation", "AssistantExecution", "MediaCleanupTask", "ModelCatalog", "ModalComfyJob"];
const migration = "prisma/migrations/20261023000000_shared_job_queue/migration.sql";

describe.skipIf(!postgresIntegrationEnabled)("paused queue transition against restored legacy data", () => {
  let db: Client;
  let schema: string;
  let environment: NodeJS.ProcessEnv;
  const remote = vi.fn(() => { throw new Error("NO_REMOTE_IO_DURING_TRANSITION"); });
  beforeEach(async () => {
    schema = "queue_transition_" + randomUUID().replaceAll("-", "");
    const url = new URL(process.env.DATABASE_URL!);
    url.searchParams.set("options", "-c search_path=" + schema + ",public");
    environment = { NODE_ENV: "test", DATABASE_URL: url.toString(), SESSION_PASSWORD: "queue-transition-test-scope-secret-32" };
    db = new Client({ connectionString: environment.DATABASE_URL });
    await db.connect();
    await db.query('CREATE SCHEMA "' + schema + '"');
    for (const table of sourceTables) await db.query(`CREATE TABLE "${table}" (LIKE public."${table}" INCLUDING ALL)`);
    await db.query('ALTER TABLE "MediaCleanupTask" DROP COLUMN "queueRevision"');
    remote.mockClear(); vi.stubGlobal("fetch", remote);
  });
  afterEach(async () => {
    expect(remote).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
    await db.query('DROP SCHEMA "' + schema + '" CASCADE');
    await db.end();
  });
  const run = (action: string, epoch = 1) => runQueueTransition(action, { expectedEpoch: epoch }, environment);
  const applyMigration = async () => { await db.query(await readFile(migration, "utf8")); };
  async function finishBackfill() {
    for (let n = 0; n < 20; n++) if ((await run("backfill")).backfillComplete) return;
    throw new Error("BACKFILL_DID_NOT_CONVERGE");
  }
  async function generation(table: string, id: string, status: string) {
    await db.query(`INSERT INTO "${table}" (id,"requestId","ownerEmail",prompt,"modelKey","requestParams",status,progress,"updatedAt")
      VALUES ($1,$1,'legacy@example.com','retained prompt','legacy-model','{"model":"legacy-model"}',$2,0,now())`, [id, status]);
  }
  async function cleanup(id: string, status: string, attempts = 0, future = false) {
    await db.query(`INSERT INTO "MediaCleanupTask" (id,"storageProvider","storageObjectId",reason,status,attempts,"retryAt","updatedAt")
      VALUES ($1,'leemage',$1,'upload_failed',$2,$3,$4,now())`, [id, status, attempts, new Date(Date.now() + (future ? 60_000 : -60_000))]);
  }
  async function restoreLegacyDump() {
    const url = new URL(environment.DATABASE_URL!);
    const container = process.env.PRODUCTION_TEST_POSTGRES_CONTAINER!;
    expect(container).toMatch(/^leesfield-pg-production-test-[\w-]+$/);
    const dump = (await exec("docker", ["exec", container, "pg_dump", "-U", decodeURIComponent(url.username), "-d", url.pathname.slice(1),
      "--schema=" + schema, "--no-owner", "--no-privileges"], { maxBuffer: 8 * 1024 * 1024 })).stdout;
    await db.query('DROP SCHEMA "' + schema + '" CASCADE');
    const child = spawn("docker", ["exec", "-i", container, "psql", "-X", "-v", "ON_ERROR_STOP=1", "-U", decodeURIComponent(url.username), "-d", url.pathname.slice(1)], { stdio: ["pipe", "ignore", "pipe"] });
    let errors = ""; child.stderr.on("data", chunk => { errors += chunk; });
    const closed = once(child, "close"); child.stdin.end(dump);
    const [code] = await closed;
    if (code !== 0) throw new Error("RESTORE_FIXTURE_FAILED: " + errors);
  }

  it("restores idle legacy data, resumes keyset100 once, and preserves terminal history", async () => {
    for (let n = 0; n < 101; n++) await generation("ImageGeneration", "image-" + String(n).padStart(3, "0"), "pending");
    await generation("ImageGeneration", "terminal-image", "completed");
    await generation("VideoGeneration", "terminal-video", "failed");
    await generation("AudioGeneration", "pending-audio", "pending");
    await db.query(`INSERT INTO "MediaOperation" (id,"ownerEmail",type,"configVersion",parameters,status,"updatedAt") VALUES
      ('pending-edit','legacy@example.com','edit.video.trim',1,'{}','pending',now())`);
    await db.query(`INSERT INTO "AssistantExecution" (id,"ownerEmail","graphId","graphNodeId","modelKey","inputSnapshot",status,"updatedAt")
      VALUES ('pending-assistant','legacy@example.com','graph','node','legacy-model','{}','pending',now())`);
    await cleanup("cleanup-partial", "pending", 3);
    await cleanup("cleanup-exhausted", "failed", 5);
    await cleanup("cleanup-linked", "linked");
    await cleanup("cleanup-uploading", "uploading", 0, true);
    await cleanup("cleanup-expired-upload", "uploading");
    await cleanup("cleanup-completed", "completed", 2);
    // Restore actual pg_dump bytes before applying the additive queue migration.
    await restoreLegacyDump(); await applyMigration();
    expect((await run("backfill"))).toMatchObject({ scanned: 100, imported: 100, backfillComplete: false });
    await db.query(`UPDATE "QueueRuntime" SET "migrationCursor" = "migrationCursor" #- '{sources,generate_image}' WHERE id = 1`);
    expect((await run("backfill"))).toMatchObject({ scanned: 100, imported: 0, backfillComplete: false });
    expect((await run("backfill"))).toMatchObject({ scanned: 1, imported: 1 });
    await finishBackfill(); await finishBackfill();
    expect((await db.query('SELECT count(*)::int AS n FROM "QueueJob"')).rows[0].n).toBe(109);
    expect((await db.query(`SELECT count(*)::int AS n FROM "QueueJob" WHERE "sourceId" = 'terminal-image'`)).rows[0].n).toBe(0);
    expect((await db.query(`SELECT status FROM "ImageGeneration" WHERE id = 'terminal-image'`)).rows[0].status).toBe("completed");
    expect((await db.query(`SELECT status FROM "QueueJob" WHERE "sourceId" IN ('cleanup-linked','cleanup-uploading')`)).rows.map(r => r.status)).toEqual(["suspended", "suspended"]);
    expect((await db.query(`SELECT "cycleOrdinal" FROM "QueueAttempt" WHERE "jobId" = (SELECT id FROM "QueueJob" WHERE "sourceId" = 'cleanup-partial') ORDER BY "cycleOrdinal"`)).rows.map(r => r.cycleOrdinal)).toEqual([1, 2, 3]);
    expect((await db.query(`SELECT count(*)::int AS n FROM "QueueDeadLetter" WHERE classification = 'reconciliation'`)).rows[0].n).toBe(0);
    expect((await db.query(`SELECT count(*)::int AS n FROM "QueueReservation" WHERE disposition = 'uncertain' AND "releasedAt" IS NULL`)).rows[0].n).toBe(0);
    await expect(run("activate")).rejects.toThrow("TRANSITION_CHECK_REQUIRED");
    expect(await run("check")).toMatchObject({ verified: true, queueJobs: 109, uncertainReservations: 0 });
    expect(await run("activate")).toMatchObject({ activated: true, previousEpoch: 1, epoch: 2 });
    await expect(run("pause")).rejects.toThrow("TRANSITION_EPOCH_CONFLICT");
    expect(await run("pause", 2)).toMatchObject({ mode: "paused", epoch: 2 });
    await expect(run("rollback-check", 2)).rejects.toThrow("TRANSITION_LEGACY_ROLLBACK_UNSAFE");
    expect(await run("activate", 2)).toMatchObject({ activated: true, epoch: 3 });
  });

  it("does not migrate unexpected active rows under the idle deployment assumption", async () => {
    await generation("VideoGeneration", "unexpected-active", "processing");
    await applyMigration();
    await expect(run("backfill")).rejects.toThrow("TRANSITION_EXPECTED_IDLE");
    expect((await db.query('SELECT count(*)::int AS n FROM "QueueJob"')).rows[0].n).toBe(0);
    expect((await db.query('SELECT count(*)::int AS n FROM "QueueDeadLetter"')).rows[0].n).toBe(0);
  });

  it("permits only a pristine rollback and detects source changes after verification", async () => {
    await applyMigration(); expect(await run("rollback-check")).toMatchObject({ legacyRollbackSafe: true });
    await finishBackfill(); await run("check");
    await generation("ImageGeneration", "late-legacy", "pending");
    await expect(run("activate")).rejects.toThrow("TRANSITION_SOURCE_COUNTS_CHANGED");
    expect((await run("status")).runtime).toMatchObject({ mode: "paused", epoch: 1 });
  });

  it("rolls a failed batch back without moving its cursor or partially registering sources", async () => {
    await generation("ImageGeneration", "a-valid", "pending");
    await generation("ImageGeneration", "b-invalid", "pending");
    await db.query(`UPDATE "ImageGeneration" SET "modelKey" = NULL, "requestParams" = '{}' WHERE id = 'b-invalid'`);
    await applyMigration();
    await expect(run("backfill")).rejects.toThrow("TRANSITION_MODEL_REQUIRED");
    expect((await db.query('SELECT count(*)::int AS n FROM "QueueJob"')).rows[0].n).toBe(0);
    expect((await run("status")).runtime.migrationCursor).toEqual({});
    await db.query(`UPDATE "ImageGeneration" SET "modelKey" = 'legacy-model' WHERE id = 'b-invalid'`);
    await finishBackfill(); expect(await run("check")).toMatchObject({ queueJobs: 2 });
  });

});
