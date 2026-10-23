// @vitest-environment node
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";
import { runQueueBootstrap } from "./job-queue-bootstrap.mjs";

const exec = promisify(execFile);
const script = resolve("scripts/production/job-queue-bootstrap.mjs");
async function run(binary, args, environment) {
  try { return { code: 0, ...await exec(binary, args, { env: { ...process.env, ...environment }, timeout: 5000, maxBuffer: 128 * 1024 }) }; }
  catch (error) { return { code: typeof error.code === "number" ? error.code : 1, stdout: error.stdout ?? "", stderr: error.stderr ?? "" }; }
}

describe("queue bootstrap CLI boundary", () => {
  it("can be imported without opening a database or running startup", async () => {
    const result = await run(process.execPath, ["--input-type=module", "-e", "await import(" + JSON.stringify(pathToFileURL(script).href) + "); console.log('imported')"], { DATABASE_URL: "" });
    expect(result).toMatchObject({ code: 0, stdout: "imported\n", stderr: "" });
  });
  it("fails with a safe reason when the database URL is missing", async () => {
    const result = await run(process.execPath, [script], { DATABASE_URL: "" });
    expect(result.code).toBe(1); expect(result.stderr).toContain("TRANSITION_DATABASE_URL_REQUIRED");
  });
  it("rejects arguments before connecting", async () => {
    const result = await run(process.execPath, [script, "--force"], { DATABASE_URL: "" });
    expect(result.code).toBe(1); expect(result.stderr).toContain("QUEUE_BOOTSTRAP_ARGUMENT_INVALID");
  });
  it("returns a nonzero database failure without leaking credentials", async () => {
    const result = await run(process.execPath, [script], { DATABASE_URL: "postgresql://fixture:private-db-secret@127.0.0.1:1/bootstrap", SESSION_PASSWORD: "private-session-secret" });
    expect(result.code).toBe(1); expect(result.stderr).toContain("QUEUE_BOOTSTRAP_DATABASE_FAILED");
    expect(result.stdout + result.stderr).not.toMatch(/private-db-secret|private-session-secret|postgresql:\/\//);
  });
  it.each([0, -1, NaN, 90_001])("refuses an invalid deadline without accessing the DB (%s)", async timeoutMs => {
    await expect(runQueueBootstrap({}, { timeoutMs })).rejects.toThrow("QUEUE_BOOTSTRAP_TIMEOUT_INVALID");
  });
});

describe("actual Nixpacks startup command", () => {
  async function executeChain(failedStep) {
    const directory = await mkdtemp(join(tmpdir(), "leesfield-queue-chain-"));
    const trace = join(directory, "calls.txt");
    try {
      // Execute the repository command itself; replace pnpm only at the process boundary.
      const config = await readFile("nixpacks.toml", "utf8");
      const command = config.match(/^cmd\s*=\s*"([^"]+)"$/m)?.[1];
      if (!command) throw new Error("NIXPACKS_START_COMMAND_MISSING");
      await writeFile(join(directory, "pnpm"), '#!/bin/sh\nprintf "%s\\n" "$*" >> "$QUEUE_CHAIN_TRACE"\nif [ "$1" = "$QUEUE_CHAIN_FAIL" ]; then exit 23; fi\n', { mode: 0o700 });
      const result = await run("/bin/sh", ["-c", command], { PATH: directory + ":" + process.env.PATH, QUEUE_CHAIN_TRACE: trace, QUEUE_CHAIN_FAIL: failedStep ?? "" });
      const calls = (await readFile(trace, "utf8")).trim().split("\n");
      return { ...result, calls };
    } finally { await rm(directory, { recursive: true, force: true }); }
  }
  it("runs migration, queue preparation and application in order", async () => {
    expect(await executeChain()).toMatchObject({ code: 0, calls: ["release:migrate", "queue:bootstrap", "start"] });
  });
  it("does not prepare the queue or start the app after migration failure", async () => {
    expect(await executeChain("release:migrate")).toMatchObject({ code: 23, calls: ["release:migrate"] });
  });
  it("does not start the app after queue preparation failure", async () => {
    expect(await executeChain("queue:bootstrap")).toMatchObject({ code: 23, calls: ["release:migrate", "queue:bootstrap"] });
  });
});
