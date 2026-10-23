import { pathToFileURL } from "node:url";
import { runQueueTransition } from "./job-queue-transition.mjs";
import { logger } from "../../src/shared/logging/logger.mjs";

export const QUEUE_BOOTSTRAP_TIMEOUT_MS = 90_000;
const kinds = ["generate_image", "generate_video", "generate_audio", "media_operation", "assistant", "storage_cleanup"];

class QueueBootstrapError extends Error {
  constructor(code) { super(code); this.code = code; }
}
function fail(code) { throw new QueueBootstrapError(code); }
function classify(runtime) {
  const cursor = runtime?.migrationCursor;
  if (!runtime || !Number.isSafeInteger(runtime.epoch) || runtime.epoch < 1 ||
      typeof runtime.migrationVerified !== "boolean" ||
      !cursor || typeof cursor !== "object" || Array.isArray(cursor) ||
      (cursor.everShared !== undefined && typeof cursor.everShared !== "boolean")) {
    fail("QUEUE_BOOTSTRAP_INVALID_STATE");
  }
  if (runtime.mode === "shared" && runtime.migrationVerified) return "ready";
  if (runtime.mode !== "paused") fail("QUEUE_BOOTSTRAP_INVALID_STATE");
  if (cursor.everShared || runtime.epoch > 1) fail("QUEUE_BOOTSTRAP_OPERATOR_PAUSED");
  if (cursor.sources !== undefined && (!cursor.sources || typeof cursor.sources !== "object" || Array.isArray(cursor.sources))) {
    fail("QUEUE_BOOTSTRAP_INVALID_STATE");
  }
  for (const [kind, entry] of Object.entries(cursor.sources ?? {})) {
    if (!kinds.includes(kind) || !entry || typeof entry !== "object" || Array.isArray(entry) ||
        typeof entry.afterId !== "string" || !Number.isSafeInteger(entry.imported) || entry.imported < 0 || typeof entry.done !== "boolean") {
      fail("QUEUE_BOOTSTRAP_INVALID_STATE");
    }
  }
  const complete = kinds.every(kind => cursor.sources?.[kind]?.done === true);
  if (runtime.migrationVerified && !complete) fail("QUEUE_BOOTSTRAP_INVALID_STATE");
  return complete ? (runtime.migrationVerified ? "activate" : "check") : "backfill";
}

/** Prepare only an unfinished first transition. Existing queues remain untouched. */
export async function runQueueBootstrap(environment = process.env, { timeoutMs = QUEUE_BOOTSTRAP_TIMEOUT_MS } = {}) {
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0 || timeoutMs > QUEUE_BOOTSTRAP_TIMEOUT_MS) fail("QUEUE_BOOTSTRAP_TIMEOUT_INVALID");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(new QueueBootstrapError("QUEUE_BOOTSTRAP_TIMEOUT")), timeoutMs);
  let prepared = false;
  try {
    const read = async () => (await runQueueTransition("status", { runtimeOnly: true, signal: controller.signal }, environment)).runtime;
    while (true) {
      controller.signal.throwIfAborted();
      const runtime = await read();
      const action = classify(runtime);
      if (action === "ready") return { state: prepared ? "initialized" : "already_ready", mode: "shared", epoch: runtime.epoch };
      prepared = true;
      logger.info("queue.bootstrap.step", { phase: action, runtimeEpoch: runtime.epoch });
      try {
        await runQueueTransition(action, { expectedEpoch: runtime.epoch, signal: controller.signal }, environment);
      } catch (failure) {
        controller.signal.throwIfAborted();
        // A concurrent bootstrap may have committed activation after our read.
        if (!["TRANSITION_EPOCH_CONFLICT", "TRANSITION_PAUSED_REQUIRED"].includes(failure.message)) throw failure;
        const current = await read();
        if (classify(current) !== "ready") throw failure;
        return { state: "already_ready", mode: "shared", epoch: current.epoch };
      }
    }
  } catch (failure) {
    if (controller.signal.aborted) throw controller.signal.reason;
    if (failure instanceof QueueBootstrapError) throw failure;
    const code = /^TRANSITION_[A-Z0-9_]+$/.test(failure?.message ?? "") ? failure.message : "QUEUE_BOOTSTRAP_DATABASE_FAILED";
    throw new QueueBootstrapError(code);
  } finally { clearTimeout(timeout); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (process.argv.length !== 2) {
    logger.error("queue.bootstrap.failed", new QueueBootstrapError("QUEUE_BOOTSTRAP_ARGUMENT_INVALID"));
    process.exitCode = 1;
  } else {
    runQueueBootstrap().then(result => console.log(JSON.stringify(result))).catch(failure => {
      logger.error("queue.bootstrap.failed", failure); process.exitCode = 1;
    });
  }
}
