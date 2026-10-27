// @vitest-environment node
import { afterEach, expect, test } from "vitest";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRunMetrics } from "./run-metrics.mjs";

const directories = [];
afterEach(async () => { await Promise.all(directories.splice(0).map(path => rm(path, { recursive: true, force: true }))); });

test("a failed cleanup is recorded without exposing errors or browser attachments", async () => {
  const output = await mkdtemp(join(tmpdir(), "spaces-metrics-")); directories.push(output);
  const metrics = createRunMetrics(output);
  metrics.configure({ mode: "local", workers: 3, selected: ["desktop:representative"] });
  await writeFile(join(output, "results.json"), JSON.stringify({ config: { workers: 1 }, suites: [{ specs: [{ title: "representative", tests: [{ projectName: "desktop", status: "expected", annotations: [{ type: "hmr-counters", description: JSON.stringify({ reloads: 1, restarts: 2 }) }, { type: "native-clipboard-lease", description: JSON.stringify({ waitMs: 37 }) }, { type: "isolated-owner", description: "secret-owner" }], results: [{ duration: 21, attachments: [{ body: "secret-cookie" }] }] }] }] }] }));
  await metrics.phase("browser", async () => undefined);
  await expect(metrics.phase("cleanup", async () => { throw new Error("secret-presigned-url"); })).rejects.toThrow();
  await metrics.finish(false, { upload: { count: 2, waitMs: 40 } });
  const raw = await readFile(join(output, "metrics.json"), "utf8"), result = JSON.parse(raw);
  expect(result.status).toBe("failed");
  expect(result.workers).toBe(1);
  expect(result.phases).toEqual(expect.arrayContaining([expect.objectContaining({ name: "cleanup", status: "failed" })]));
  expect(result.tests).toEqual([{ title: "representative", project: "desktop", status: "expected", attempts: 1, durationMs: 21 }]);
  expect(result.storage.upload.count).toBe(2);
  expect(result.diagnostics).toEqual({ hmrReloads: 1, hmrRestarts: 2, clipboardLeases: 1, clipboardWaitMaxMs: 37 });
  expect(raw).not.toContain("secret-");
});
