import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { checkoutIdentity, inspectDependencies, prepareDependencies } from "./prepare.mjs";
import { readPushInput, resolvePushRange } from "./push-range.mjs";
import { assertPostMergeCheckout } from "./post-merge.mjs";

export async function bootstrapVerification({ root, args }) {
  const startedAt = Date.now(), shutdown = new AbortController();
  let cancelled = null, preparation = null, identity = null, push = null;
  const context = args.includes("--post-merge") ? "post-merge" : args.includes("--pre-push") ? "push" : "feature";
  const runName = context === "post-merge" ? "last-post-merge-run.json" : context === "push" ? "last-push-run.json" : "last-run.json";
  const record = { schemaVersion: 3, context, cwd: root,
    startedAt: new Date(startedAt).toISOString(), status: "running", stage: "preparation", checks: [] };
  const persist = async () => {
    await mkdir(resolve(root, ".next/verification"), { recursive: true });
    await writeFile(resolve(root, ".next/verification", runName), JSON.stringify(record, null, 2) + "\n");
  };
  const interrupt = signal => { cancelled = signal; shutdown.abort(signal); };
  const onInt = () => interrupt("SIGINT"), onTerm = () => interrupt("SIGTERM");
  process.once("SIGINT", onInt); process.once("SIGTERM", onTerm);
  try {
    for (const argument of args) if (!["--plan", "--json", "--full", "--release", "--pre-push", "--post-merge"].includes(argument)) throw new Error("UNKNOWN_VERIFICATION_OPTION");
    if (args.includes("--json") && !args.includes("--plan")) throw new Error("JSON_REQUIRES_PLAN");
    if (context === "post-merge" && args.some(argument => argument !== "--post-merge")) throw new Error("VERIFICATION_CONTEXT_CONFLICT");
    identity = await checkoutIdentity(root);
    record.identity = identity;
    if (context === "post-merge") await assertPostMergeCheckout(root, identity);
    if (context === "push") {
      push = await resolvePushRange(root, await readPushInput(process.stdin));
      record.push = { refs: push.refs, deletionOnly: push.deletionOnly };
      if (push.deletionOnly) {
        record.status = "not-required"; record.reason = "PUSH_DELETIONS_ONLY";
        record.finishedAt = new Date().toISOString(); record.durationMs = Date.now() - startedAt;
        await persist(); process.stdout.write("Push contains deletions only; no product tree to verify.\n");
        return record;
      }
    }
    if (args.includes("--plan")) await inspectDependencies(root);
    else preparation = await prepareDependencies(root, { signal: shutdown.signal, onRecord: async value => {
      record.preparation = value;
      await persist();
    } });
    if (shutdown.signal.aborted) throw new Error("VERIFICATION_INTERRUPTED");
    record.stage = "runner";
    if (context === "post-merge") {
      const { runPostMergeVerification } = await import("./post-merge.mjs");
      return await runPostMergeVerification({ root, preparation, identity, startedAt, shutdown });
    }
    const { runVerification } = await import("./runner.mjs");
    return await runVerification({ root, args, preparation, identity, startedAt, shutdown, push, context });
  } catch (error) {
    record.status = "failed";
    record.errorCode = /^(?:POST_MERGE_[A-Z_]+|PUSH_[A-Z_]+|DEPENDENCY_[A-Z_]+|UNKNOWN_VERIFICATION_OPTION|JSON_REQUIRES_PLAN|VERIFICATION_[A-Z_]+)/.exec(error.message)?.[0] ?? "VERIFICATION_BOOTSTRAP_FAILED";
    record.preparation = error.preparation ?? preparation ?? record.preparation;
    record.finishedAt = new Date().toISOString(); record.durationMs = Date.now() - startedAt;
    await persist();
    process.stderr.write(record.errorCode + "\n");
    if (record.errorCode === "DEPENDENCY_NOT_READY") process.stderr.write("Run pnpm install --frozen-lockfile --prod=false before planning.\n");
    process.exitCode = cancelled === "SIGINT" ? 130 : cancelled === "SIGTERM" ? 143 : 1;
    return record;
  } finally {
    process.removeListener("SIGINT", onInt); process.removeListener("SIGTERM", onTerm);
  }
}
