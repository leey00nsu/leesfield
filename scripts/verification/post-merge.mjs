import { execFile } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { promisify } from "node:util";
import { checkoutIdentity, declarationHashes } from "./prepare.mjs";
import { executeVerificationBatch, runCheckProcess } from "./execution.mjs";
import { verificationEnvironment } from "./environment.mjs";

const execute = promisify(execFile);

export async function assertPostMergeCheckout(root, expected) {
  const identity = await checkoutIdentity(root);
  if (identity.branch !== "main") throw new Error("POST_MERGE_REQUIRES_MAIN");
  if (expected && (identity.head !== expected.head || identity.tree !== expected.tree)) throw new Error("POST_MERGE_SOURCE_CHANGED");
  const status = await execute("git", ["status", "--porcelain=v1", "--untracked-files=all"], { cwd: root, encoding: "utf8" });
  if (status.stdout.trim()) throw new Error("POST_MERGE_CHECKOUT_DIRTY");
  return identity;
}

export async function runPostMergeVerification({ root, preparation, identity, startedAt, shutdown }) {
  const directory = resolve(root, ".next/verification");
  const record = { schemaVersion: 3, context: "post-merge", cwd: root, identity, preparation,
    startedAt: new Date(startedAt).toISOString(), status: "running", checks: [] };
  const persist = async () => {
    await mkdir(directory, { recursive: true });
    await writeFile(resolve(directory, "last-post-merge-run.json"), JSON.stringify(record, null, 2) + "\n");
  };
  try {
    await assertPostMergeCheckout(root, identity);
    await persist();
    for (const script of ["typecheck", "build"]) {
      process.stdout.write(`[post-merge] ${root} ${identity.head}: pnpm ${script}\n`);
      await executeVerificationBatch([{ id: script, command: "pnpm", args: [script] }],
        (check, signal) => runCheckProcess(check, { cwd: root, env: verificationEnvironment(process.env), signal }),
        async result => { record.checks.push(result); await persist(); }, shutdown.signal);
    }
    await assertPostMergeCheckout(root, identity);
    if (JSON.stringify(preparation.declarations) !== JSON.stringify(await declarationHashes(root))) throw new Error("POST_MERGE_SOURCE_CHANGED");
    record.status = "passed";
  } catch (error) {
    record.status = "failed";
    record.errorCode = /^POST_MERGE_[A-Z_]+/.exec(error.message)?.[0] ?? "POST_MERGE_CHECK_FAILED";
    process.stderr.write(record.errorCode + "\n");
    process.exitCode = shutdown.signal.reason === "SIGINT" ? 130 : shutdown.signal.reason === "SIGTERM" ? 143 : 1;
  } finally {
    record.finishedAt = new Date().toISOString(); record.durationMs = Date.now() - startedAt;
    await persist();
  }
  return record;
}
