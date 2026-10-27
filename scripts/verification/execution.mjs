import { spawn } from "node:child_process";

const independent = new Set(["test", "lint", "security:production", "test:production-integration", "dependencies:check", "license:check"]);

export function verificationBatches(checks, { constrained = false } = {}) {
  if (new Set(checks.map(check => check.id)).size !== checks.length) throw new Error("Duplicate verification check");
  const preparation = checks.filter(check => check.id === "typecheck");
  const unit = constrained ? checks.filter(check => check.id === "test") : [];
  const concurrent = checks.filter(check => independent.has(check.id) && (!constrained || check.id !== "test"));
  // typecheck's pre-script finishes Prisma generation before either Vitest
  // process imports it. Build regenerates only after both suites have exited.
  return [...(preparation.length ? [preparation] : []), ...(unit.length ? [unit] : []), ...(concurrent.length ? [concurrent] : []),
    ...checks.filter(check => check.id !== "typecheck" && !independent.has(check.id)).map(check => [check])];
}

export function runCheckProcess(check, { cwd, env, signal, stdio = "inherit", killGraceMs = 35_000 }) {
  if (signal?.aborted) return Promise.resolve({ exitCode: null, signal: "SIGTERM" });
  return new Promise((resolve, reject) => {
    const child = spawn(check.command, check.args, { cwd, env, stdio, detached: process.platform !== "win32" });
    let forceKill;
    const send = name => {
      if (!child.pid) return;
      try { if (process.platform === "win32") child.kill(name); else process.kill(-child.pid, name); }
      catch (error) { if (error.code !== "ESRCH") throw error; }
    };
    const abort = () => {
      send("SIGTERM");
      // Cancellation only: normal check timeouts/retries are unchanged. Give
      // isolated runners time to remove their disposable DB/storage resources.
      forceKill = setTimeout(() => send("SIGKILL"), killGraceMs);
      forceKill.unref();
    };
    signal?.addEventListener("abort", abort, { once: true });
    child.once("error", error => { signal?.removeEventListener("abort", abort); clearTimeout(forceKill); reject(error); });
    child.once("close", (code, termination) => {
      signal?.removeEventListener("abort", abort); clearTimeout(forceKill);
      resolve({ exitCode: code, signal: termination });
    });
    if (signal?.aborted) abort();
  });
}

export async function executeVerificationBatch(checks, run, onResult, signal) {
  const controller = new AbortController();
  let firstFailure;
  const abort = () => controller.abort();
  signal?.addEventListener("abort", abort, { once: true });
  if (signal?.aborted) controller.abort();
  try {
    const settled = await Promise.allSettled(checks.map(async check => {
      const started = Date.now();
      let recorded = false;
      try {
        const result = await run(check, controller.signal);
        if (result.exitCode !== 0) {
          firstFailure ??= new Error(`Verification failed: ${check.id}`);
          controller.abort();
        }
        recorded = true;
        await onResult({ ...check, ...result, durationMs: Date.now() - started });
        if (result.exitCode !== 0) throw new Error(`Verification failed: ${check.id}`);
      } catch (error) {
        firstFailure ??= error;
        controller.abort();
        if (!recorded) await onResult({ ...check, exitCode: null, signal: null, errorCode: "CHECK_START_FAILED", durationMs: Date.now() - started });
        throw error;
      }
    }));
    const failed = settled.find(result => result.status === "rejected");
    if (failed) throw firstFailure ?? failed.reason;
    if (signal?.aborted) throw new Error("Verification interrupted");
  } finally { signal?.removeEventListener("abort", abort); }
}
