import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { promisify } from "node:util";
import { runCheckProcess } from "./execution.mjs";

const execute = promisify(execFile);
const requiredPackages = ["typescript", "next", "vitest", "@vitest/browser-playwright", "@playwright/test"];

export async function declarationHashes(root) {
  const hashes = {};
  for (const name of ["package.json", "pnpm-lock.yaml", "pnpm-workspace.yaml"]) {
    const value = await readFile(resolve(root, name));
    hashes[name] = createHash("sha256").update(value).digest("hex");
  }
  return hashes;
}

export async function inspectDependencies(root) {
  const require = createRequire(resolve(root, "package.json"));
  const versions = {};
  for (const name of requiredPackages) {
    try {
      require.resolve(name);
      const metadata = JSON.parse(await readFile(resolve(root, "node_modules", name, "package.json"), "utf8"));
      versions[name] = metadata.version;
    } catch {
      throw new Error(`DEPENDENCY_NOT_READY: ${name}; run pnpm install --frozen-lockfile --prod=false`);
    }
  }
  return versions;
}

export async function checkoutIdentity(root) {
  const git = async args => (await execute("git", args, { cwd: root, encoding: "utf8" })).stdout.trim();
  return { head: await git(["rev-parse", "HEAD"]), tree: await git(["rev-parse", "HEAD^{tree}"]),
    branch: await git(["branch", "--show-current"]) };
}

export async function prepareDependencies(root, { signal, onRecord = () => {} } = {}) {
  const started = Date.now();
  const record = { status: "running", cwd: root, command: "pnpm",
    args: ["install", "--frozen-lockfile", "--prefer-offline", "--prod=false"],
    node: process.version, declarations: null, exitCode: null, signal: null, durationMs: 0 };
  try {
    record.declarations = await declarationHashes(root);
    record.pnpm = (await execute("pnpm", ["--version"], { cwd: root, encoding: "utf8", signal })).stdout.trim();
    await onRecord(record);
    const result = await runCheckProcess(record, { cwd: root, env: { ...process.env, CI: "true" }, signal });
    Object.assign(record, result);
    if (result.exitCode !== 0 || signal?.aborted) throw new Error("DEPENDENCY_PREPARATION_FAILED");
    if (JSON.stringify(record.declarations) !== JSON.stringify(await declarationHashes(root))) throw new Error("DEPENDENCY_DECLARATIONS_CHANGED");
    record.packages = await inspectDependencies(root);
    record.status = "passed";
    return record;
  } catch (error) {
    record.status = "failed";
    record.errorCode = /^(DEPENDENCY_[A-Z_]+)/.exec(error.message)?.[1] ?? "DEPENDENCY_PREPARATION_FAILED";
    const failure = new Error(record.errorCode);
    failure.preparation = record;
    throw failure;
  } finally {
    record.durationMs = Date.now() - started;
    await onRecord(record);
  }
}
