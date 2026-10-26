import pg from "pg";
import { createHash, createHmac, randomUUID } from "node:crypto";
import { pathToFileURL } from "node:url";
import { logger } from "../../src/shared/logging/logger.mjs";

const definitions = [
  { kind: "generate_image", type: "image_generation", table: "ImageGeneration", pool: "generation", capacity: 4, media: "image" },
  { kind: "generate_video", type: "video_generation", table: "VideoGeneration", pool: "generation", capacity: 4, media: "video" },
  { kind: "generate_audio", type: "audio_generation", table: "AudioGeneration", pool: "generation", capacity: 4, media: "audio" },
  { kind: "media_operation", type: "media_operation", table: "MediaOperation", pool: "media-operation", capacity: 2 },
  { kind: "assistant", type: "assistant_execution", table: "AssistantExecution", pool: "assistant", capacity: 4 },
  { kind: "storage_cleanup", type: "storage_cleanup", table: "MediaCleanupTask", pool: "storage-cleanup", capacity: 2 },
];
const serverMediaTypes = ["edit.image.removeBackground", "edit.video.stitch", "edit.video.trim", "edit.video.extractFrames"];
const quoted = value => {
  if (!/^[A-Za-z][A-Za-z0-9]*$/.test(value)) throw new Error("TRANSITION_IDENTIFIER_INVALID");
  return '"' + value + '"';
};
const error = code => { throw new Error(code); };
const sha = value => createHash("sha256").update(JSON.stringify(value)).digest("hex");
// Prisma stores timestamp-without-time-zone columns in UTC. Keep this client's
// interpretation and Date binds independent of the release host's TZ.
const transitionTypes = {
  getTypeParser(oid, format) {
    if (oid === pg.types.builtins.TIMESTAMP && format !== "binary") {
      return value => new Date(value.replace(" ", "T") + "Z");
    }
    return pg.types.getTypeParser(oid, format);
  },
};
const eligible = d => d.kind === "storage_cleanup"
  ? `s.status IN ('pending','failed')`
  : `s.status = 'pending'`;
const scopeFilter = d => d.kind === "media_operation"
  ? " AND s.type IN (" + serverMediaTypes.map(t => "'" + t + "'").join(",") + ")" : "";

async function insert(db, table, data, returning = "id") {
  const columns = Object.keys(data);
  const sql = "INSERT INTO " + quoted(table) + " (" + columns.map(quoted).join(",") + ") VALUES (" +
    columns.map((_, i) => "$" + (i + 1)).join(",") + ") RETURNING " + quoted(returning);
  return (await db.query(sql, Object.values(data).map(value => value instanceof Date ? value.toISOString() : value))).rows[0];
}
async function counts(db) {
  const result = {};
  for (const d of definitions) result[d.kind] = Object.fromEntries((await db.query(
    `SELECT s.status::text AS status, count(*)::int AS count FROM ${quoted(d.table)} s WHERE true${scopeFilter(d)} GROUP BY s.status ORDER BY s.status`,
  )).rows.map(r => [r.status, r.count]));
  return result;
}
async function locked(db, expectedEpoch, run) {
  if (!Number.isSafeInteger(expectedEpoch) || expectedEpoch < 1) error("TRANSITION_EXPECTED_EPOCH_REQUIRED");
  await db.query("BEGIN");
  try {
    await db.query("SET LOCAL lock_timeout = '2s'");
    await db.query("SET LOCAL statement_timeout = '5s'");
    await db.query("SELECT pg_advisory_xact_lock(hashtext($1))", ["leesfield:shared-job-queue"]);
    const runtime = (await db.query('SELECT * FROM "QueueRuntime" WHERE id = 1 FOR UPDATE')).rows[0];
    if (!runtime || runtime.epoch !== expectedEpoch) error("TRANSITION_EPOCH_CONFLICT");
    const result = await run(runtime);
    await db.query("COMMIT"); return result;
  } catch (failure) { await db.query("ROLLBACK"); throw failure; }
}

// Deployment assumes old workers are idle; unexpected active rows need attention.
async function requireIdleSources(db) {
  for (const d of definitions) {
    const states = d.kind === "storage_cleanup" || d.kind === "assistant" ? "'processing'" : "'processing','uploading'";
    const active = (await db.query(`SELECT count(*)::int AS count FROM ${quoted(d.table)} s WHERE s.status::text IN (${states})${scopeFilter(d)}`)).rows[0].count;
    if (active) error("TRANSITION_EXPECTED_IDLE");
  }
}
function saveCursor(db, cursor, verified = false) {
  return db.query('UPDATE "QueueRuntime" SET "migrationCursor" = $1::jsonb, "migrationVerified" = $2, "updatedAt" = clock_timestamp() WHERE id = 1', [JSON.stringify(cursor), verified]);
}
async function resource(db, key, policy) {
  const data = { key, staticCapacity: null, modelType: null, modelKey: null, ...policy };
  await db.query(`INSERT INTO "QueueResource" ("key","staticCapacity","modelType","modelKey") VALUES ($1,$2,$3,$4) ON CONFLICT ("key") DO NOTHING`,
    [key, data.staticCapacity, data.modelType, data.modelKey]);
  const stored = (await db.query('SELECT * FROM "QueueResource" WHERE key = $1', [key])).rows[0];
  if (stored.staticCapacity !== data.staticCapacity || stored.modelType !== data.modelType || stored.modelKey !== data.modelKey)
    error("TRANSITION_RESOURCE_POLICY_CONFLICT");
}
function noteTransition(cursor, kind, from, to) {
  if (from === to) return;
  const key = kind + ":" + from + ":" + to;
  cursor.transitions[key] = (cursor.transitions[key] ?? 0) + 1;
}
async function importSource(db, d, source, runtime, cursor, password) {
  const now = new Date();
  const revision = d.kind === "storage_cleanup" ? source.queueRevision : 0;
  const existing = (await db.query(`SELECT id FROM "QueueJob" WHERE kind = $1 AND "sourceType" = $2 AND "sourceId" = $3 AND "sourceRevision" = $4`,
    [d.kind, d.type, source.id, revision])).rows[0];
  if (existing) return false;
  const cleanup = d.kind === "storage_cleanup";
  const exhausted = cleanup && (source.status === "failed" || source.status === "pending" && source.attempts >= 5);
  const cancelled = Boolean(source.cancelRequestedAt);
  const resources = [d.pool];
  await resource(db, d.pool, { staticCapacity: d.capacity });
  let modelKey = source.modelKey;
  if (d.media) {
    modelKey ??= typeof source.requestParams?.model === "string" ? source.requestParams.model : null;
    if (!modelKey) modelKey = (await db.query(`SELECT key FROM "ModelCatalog" WHERE type = $1 AND "isActive" = true ORDER BY "isDefault" DESC, "createdAt", id LIMIT 1`, [d.media])).rows[0]?.key;
    if (!modelKey) error("TRANSITION_MODEL_REQUIRED");
    if (!source.modelKey || !source.requestParams?.model) {
      const params = { ...(source.requestParams ?? {}), model: modelKey };
      await db.query(`UPDATE ${quoted(d.table)} SET "modelKey" = $1, "requestParams" = $2::jsonb WHERE id = $3`, [modelKey, JSON.stringify(params), source.id]);
      cursor.sourceMutated = true;
    }
    const key = "model:" + d.media + ":" + modelKey;
    await resource(db, key, { modelType: d.media, modelKey }); resources.push(key);
  }
  const owner = source.ownerEmail ?? (cleanup ? "storage:" + source.storageProvider : "legacy:" + source.requestId);
  const digest = createHmac("sha256", password).update("queue-scope|" + owner).digest("hex");
  const snapshotRef = cleanup ? "cleanup:" + source.id + ":" + revision : d.media
    ? d.media + ":" + source.id + (source.graphNodeId ? ":node:" + source.graphNodeId : ":classic")
    : (d.kind === "assistant" ? "assistant:" : "media-operation:") + source.id;
  const jobId = randomUUID();
  const status = exhausted ? "dead_letter" : cancelled ? "cancelled" : "ready";
  await insert(db, "QueueJob", { id: jobId, kind: d.kind, sourceType: d.type, sourceId: source.id,
    sourceRevision: revision, snapshotRef, ownerScopeDigest: digest, executionType: d.type, executionId: source.id,
    status, availableAt: cleanup ? source.retryAt : source.createdAt, maxAttempts: cleanup ? 5 : 1, retryDelayMs: cleanup ? 60_000 : 0,
    createdAt: source.createdAt, updatedAt: now, cancelRequestedAt: source.cancelRequestedAt ?? null });
  for (const key of resources) await insert(db, "QueueJobResource", { jobId, resourceKey: key }, "jobId");
  const previousAttempts = cleanup ? Math.min(5, Math.max(0, source.attempts)) : 0;
  const attemptCount = exhausted ? Math.max(1, previousAttempts) : previousAttempts;
  let lastAttempt;
  for (let n = 1; n <= attemptCount; n++) {
    lastAttempt = randomUUID();
    const final = n === attemptCount;
    await insert(db, "QueueAttempt", { id: lastAttempt, jobId, lifetimeOrdinal: n, cycle: 1, cycleOrdinal: n,
      executionType: d.type, executionId: source.id, workerInstanceId: "00000000-0000-4000-8000-000000000009",
      leaseToken: randomUUID(), leaseVersion: n, runtimeEpoch: runtime.epoch, leaseUntil: new Date(now.getTime() + 1),
      phase: "ended", outcome: final && exhausted ? "failed" : "retrying",
      startedAt: now, finishedAt: now, heartbeatAt: now,
      remoteEvidenceRef: "legacy:" + d.type + ":" + source.id });
  }
  if (lastAttempt) {
    await db.query('UPDATE "QueueJob" SET "currentAttemptId" = $1, version = $2 WHERE id = $3', [lastAttempt, attemptCount, jobId]);
  }
  if (exhausted) {
    await insert(db, "QueueDeadLetter", { id: randomUUID(), jobId, failedAttemptId: lastAttempt,
      classification: "terminal",
      safeErrorCode: /^[A-Z][A-Z0-9_]{0,119}$/.test(source.lastError ?? "") ? source.lastError : "QUEUE_LEGACY_FAILURE",
      phase: "migration", detail: { imported: true, legacyStatus: source.status, priorAttempts: source.attempts ?? null } });
  }
  const nextStatus = exhausted ? "failed" : cancelled ? "cancelled" : cleanup ? "pending" : source.status;
  if (nextStatus !== source.status) {
    const leaseColumns = cleanup ? '"leaseToken" = NULL, "leaseUntil" = NULL' : '"executionLeaseToken" = NULL, "executionLeaseUntil" = NULL';
    const terminal = !cleanup ? ', "finishedAt" = COALESCE("finishedAt", clock_timestamp())' : "";
    await db.query(`UPDATE ${quoted(d.table)} SET status = $1, ${leaseColumns}, "updatedAt" = clock_timestamp()${terminal} WHERE id = $2`, [nextStatus, source.id]);
    noteTransition(cursor, d.kind, source.status, nextStatus);
    cursor.sourceMutated = true;
  }
  return true;
}
async function verify(db, runtime, cursor) {
  await requireIdleSources(db);
  if (!definitions.every(d => cursor.sources?.[d.kind]?.done)) error("TRANSITION_BACKFILL_INCOMPLETE");
  const currentCounts = await counts(db);
  if (!cursor.everShared) {
    const expected = structuredClone(cursor.initialCounts);
    for (const [key, count] of Object.entries(cursor.transitions ?? {})) {
      const [kind, from, to] = key.split(":");
      expected[kind][from] = (expected[kind][from] ?? 0) - count;
      expected[kind][to] = (expected[kind][to] ?? 0) + count;
    }
    for (const d of definitions) for (const status of new Set([...Object.keys(expected[d.kind]), ...Object.keys(currentCounts[d.kind])]))
      if ((expected[d.kind][status] ?? 0) !== (currentCounts[d.kind][status] ?? 0)) error("TRANSITION_SOURCE_COUNTS_CHANGED");
  }
  for (const d of definitions) {
    const missing = (await db.query(`SELECT count(*)::int AS count FROM ${quoted(d.table)} s
      LEFT JOIN "QueueJob" j ON j.kind = $1 AND j."sourceId" = s.id AND j."sourceRevision" = ${d.kind === "storage_cleanup" ? 's."queueRevision"' : "0"}
      WHERE ${eligible(d)}${scopeFilter(d)} AND j.id IS NULL`, [d.kind])).rows[0].count;
    if (missing) error("TRANSITION_QUEUE_MAPPING_MISSING");
    const invalid = (await db.query(`SELECT count(*)::int AS count FROM "QueueJob" j
      LEFT JOIN ${quoted(d.table)} s ON s.id = j."executionId"
      WHERE j.kind = $1 AND j.status IN ('ready','retry_wait','active','suspended')
        AND (s.id IS NULL OR s.status::text NOT IN (${d.kind === "storage_cleanup" ? "'pending','processing','uploading','linked'" : "'pending','processing','uploading'"}))`, [d.kind])).rows[0].count;
    if (invalid) error("TRANSITION_TERMINAL_JOB_EXECUTABLE");
  }
  if ((await db.query('SELECT count(*)::int AS count FROM "QueueAttempt" WHERE "finishedAt" IS NULL')).rows[0].count) error("TRANSITION_ACTIVE_DRAIN_REQUIRED");
  const over = (await db.query(`SELECT r.key FROM "QueueResource" r JOIN "QueueReservation" v ON v."resourceKey" = r.key
    WHERE r."staticCapacity" IS NOT NULL AND v."releasedAt" IS NULL GROUP BY r.key, r."staticCapacity" HAVING count(*) > r."staticCapacity"`)).rows;
  if (over.length) error("TRANSITION_RESOURCE_OVER_CAPACITY");
  return { counts: currentCounts, queueJobs: (await db.query('SELECT count(*)::int AS count FROM "QueueJob"')).rows[0].count,
    uncertainReservations: (await db.query(`SELECT count(*)::int AS count FROM "QueueReservation" WHERE disposition = 'uncertain' AND "releasedAt" IS NULL`)).rows[0].count,
    epoch: runtime.epoch };
}

/** All mutations are explicit, epoch-fenced and restricted to the selected DB.
 * @param {string} action
 * @param {{expectedEpoch?: number, runtimeOnly?: boolean, signal?: AbortSignal}} options
 */
export async function runQueueTransition(action, options = {}, environment = process.env) {
  if (!["status", "backfill", "check", "activate", "pause", "rollback-check"].includes(action)) error("TRANSITION_ACTION_REQUIRED");
  if (!environment.DATABASE_URL) error("TRANSITION_DATABASE_URL_REQUIRED");
  options.signal?.throwIfAborted();
  const db = new pg.Client({ connectionString: environment.DATABASE_URL, connectionTimeoutMillis: 2000, application_name: "leesfield-queue-transition", query_timeout: 5000, types: transitionTypes });
  const abort = () => { void db.end().catch(() => {}); };
  options.signal?.addEventListener("abort", abort, { once: true });
  try {
    await db.connect();
    options.signal?.throwIfAborted();
    if (action === "status") {
      const runtime = (await db.query('SELECT mode, epoch, "migrationVerified", "migrationCursor" FROM "QueueRuntime" WHERE id = 1')).rows[0];
      if (options.runtimeOnly) return { runtime };
      return { runtime, sourceCounts: await counts(db) };
    }
    return await locked(db, options.expectedEpoch, async runtime => {
      const cursor = runtime.migrationCursor ?? {};
      if (action === "pause") {
        await db.query(`UPDATE "QueueRuntime" SET mode = 'paused', "updatedAt" = clock_timestamp() WHERE id = 1`);
        return { mode: "paused", epoch: runtime.epoch, activeAttempts: (await db.query('SELECT count(*)::int AS count FROM "QueueAttempt" WHERE "finishedAt" IS NULL')).rows[0].count };
      }
      if (runtime.mode !== "paused") error("TRANSITION_PAUSED_REQUIRED");
      if (action === "rollback-check") {
        const occupied = (await db.query(`SELECT (SELECT count(*) FROM "QueueJob") + (SELECT count(*) FROM "QueueAdminAction") AS count`)).rows[0].count;
        if (Number(occupied) || cursor.sourceMutated || cursor.everShared) error("TRANSITION_LEGACY_ROLLBACK_UNSAFE");
        return { legacyRollbackSafe: true, epoch: runtime.epoch };
      }
      if (action === "backfill") {
        if (cursor.everShared) error("TRANSITION_BACKFILL_ALREADY_ACTIVATED");
        if (!environment.SESSION_PASSWORD || environment.SESSION_PASSWORD.length < 32) error("TRANSITION_SCOPE_SECRET_REQUIRED");
        await requireIdleSources(db);
        cursor.initialCounts ??= await counts(db); cursor.sources ??= {}; cursor.transitions ??= {};
        const d = definitions.find(d => !cursor.sources[d.kind]?.done);
        if (!d) return { backfillComplete: true };
        const previous = cursor.sources[d.kind] ?? { afterId: "", imported: 0 };
        const rows = (await db.query(`SELECT s.* FROM ${quoted(d.table)} s WHERE ${eligible(d)}${scopeFilter(d)}
          AND s.id > $1 ORDER BY s.id LIMIT 100 FOR UPDATE`, [previous.afterId])).rows;
        let imported = 0;
        for (const source of rows) if (await importSource(db, d, source, runtime, cursor, environment.SESSION_PASSWORD)) imported++;
        cursor.sources[d.kind] = { afterId: rows.at(-1)?.id ?? previous.afterId, imported: previous.imported + imported, done: rows.length < 100 };
        await saveCursor(db, cursor);
        return { source: d.kind, scanned: rows.length, imported, backfillComplete: definitions.every(d => cursor.sources[d.kind]?.done) };
      }
      const report = await verify(db, runtime, cursor);
      cursor.lastCheck = { signature: sha(report), checkedAt: new Date().toISOString(), report };
      if (action === "check") { await saveCursor(db, cursor, true); return { verified: true, ...report }; }
      if (!runtime.migrationVerified) error("TRANSITION_CHECK_REQUIRED");
      cursor.everShared = true;
      await saveCursor(db, cursor, true);
      await db.query(`UPDATE "QueueRuntime" SET mode = 'shared', epoch = epoch + 1, "updatedAt" = clock_timestamp() WHERE id = 1`);
      return { activated: true, ...report, epoch: runtime.epoch + 1, previousEpoch: runtime.epoch };
    });
  } finally {
    options.signal?.removeEventListener("abort", abort);
    await db.end();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [action, ...flags] = process.argv.slice(2);
  const options = {};
  for (const flag of flags) {
    if (flag.startsWith("--expected-epoch=")) options.expectedEpoch = Number(flag.slice("--expected-epoch=".length));
    else error("TRANSITION_ARGUMENT_INVALID");
  }
  runQueueTransition(action, options).then(result => console.log(JSON.stringify(result))).catch(failure => {
    logger.error("queue.transition.failed", failure); process.exitCode = 1;
  });
}
