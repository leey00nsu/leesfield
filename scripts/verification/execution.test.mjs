// @vitest-environment node
import { afterEach, expect, test } from "vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { executeVerificationBatch, runCheckProcess, verificationBatches } from "./execution.mjs";

const directories = [];
afterEach(async () => { await Promise.all(directories.splice(0).map(path => rm(path, { recursive: true, force: true }))); });
test("Prisma preparation is exclusive, independent suites share a batch, builds and remote/browser checks remain serial", () => {
  const ids = ["test", "typecheck", "lint", "build", "security:production", "test:production-integration", "dependencies:check", "license:check", "storybook", "storage-contract", "spaces-e2e"];
  const batches = verificationBatches(ids.map(id => ({ id })));
  expect(batches[0].map(check => check.id)).toEqual(["typecheck"]);
  expect(batches[1].map(check => check.id)).toEqual(["test", "lint", "security:production", "test:production-integration", "dependencies:check", "license:check"]);
  expect(batches.slice(2).map(batch => batch.map(check => check.id))).toEqual([["build"], ["storybook"], ["storage-contract"], ["spaces-e2e"]]);
  expect(batches.flat().map(check => check.id).sort()).toEqual([...ids].sort());
});

test("a real child failure cancels its sibling and waits for cleanup before rejecting, preserving both results", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "leesfield-check-execution-")); directories.push(cwd);
  const checks = [
    { id: "failure", command: process.execPath, args: ["-e", `const fs=require('node:fs');const timer=setInterval(()=>{if(fs.existsSync('ready')){clearInterval(timer);process.exit(7)}},10)`] },
    { id: "cleanup", command: process.execPath, args: ["-e", `const fs=require('node:fs');process.on('SIGTERM',()=>setTimeout(()=>{fs.writeFileSync('cleaned','yes');process.exit(143)},30));fs.writeFileSync('ready','yes');setInterval(()=>{},1000)`] },
  ];
  checks.reverse(); // The cancelled sibling appears first; report the actual cause.
  const results = [];
  await expect(executeVerificationBatch(checks, (check, signal) => runCheckProcess(check, { cwd, signal, stdio: "ignore" }), result => results.push(result))).rejects.toThrow("Verification failed: failure");
  expect(results.find(result => result.id === "failure").exitCode).toBe(7);
  expect(results).toHaveLength(2);
  expect(await readFile(join(cwd, "cleaned"), "utf8")).toBe("yes");
});

test("external cancellation is a failure even when a cooperative child exits zero", async () => {
  const controller = new AbortController();
  const cwd = await mkdtemp(join(tmpdir(), "leesfield-check-abort-")); directories.push(cwd);
  const check = { id: "cancelled", command: process.execPath, args: ["-e", `process.on('SIGTERM',()=>process.exit(0));setInterval(()=>{},1000)`] };
  controller.abort();
  const results = [];
  await expect(executeVerificationBatch([check], (value, signal) => runCheckProcess(value, { cwd, signal, stdio: "ignore" }), result => results.push(result), controller.signal)).rejects.toThrow();
  expect(results[0]).toMatchObject({ exitCode: null, signal: "SIGTERM" });
});

test("a missing executable still leaves an explicit failed result", async () => {
  const results = [];
  await expect(executeVerificationBatch([{ id: "missing", command: "/nonexistent/leesfield-check", args: [] }],
    (value, signal) => runCheckProcess(value, { signal, stdio: "ignore" }), result => results.push(result))).rejects.toThrow();
  expect(results).toEqual([expect.objectContaining({ id: "missing", exitCode: null, errorCode: "CHECK_START_FAILED" })]);
});

test("a non-cooperative child is reaped after cancellation grace", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "leesfield-check-force-")); directories.push(cwd);
  const controller = new AbortController();
  const running = runCheckProcess({ command: process.execPath, args: ["-e", `require('node:fs').writeFileSync('ready','yes');process.on('SIGTERM',()=>{});setInterval(()=>{},1000)`] }, { cwd, signal: controller.signal, stdio: "ignore", killGraceMs: 50 });
  await expect.poll(async () => readFile(join(cwd, "ready"), "utf8").catch(() => "")).toBe("yes");
  controller.abort();
  expect(await running).toMatchObject({ exitCode: null, signal: "SIGKILL" });
});
