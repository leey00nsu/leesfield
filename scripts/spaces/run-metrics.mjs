import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { cpus, totalmem } from "node:os";
import { createResourceMonitor } from "../verification/resources.mjs";

// Only allow-listed metadata is persisted. Never serialize env, cookies, URLs,
// test attachments or errors containing signed storage requests.
export function createRunMetrics(output) {
  const started = Date.now();
  const resources = createResourceMonitor(); resources.start();
  const report = { schemaVersion: 1, startedAt: new Date(started).toISOString(), status: "running", phases: [], tests: [] };
  return {
    compilerCache(cache) { report.compilerCache = cache; },
    configure({ mode, workers, selected, profile, workerBudget }) {
      report.storageMode = mode;
      if (profile) report.profile = profile;
      if (workerBudget) report.workerBudget = workerBudget;
      report.workers = workers;
      report.selected = selected.length;
      report.scopeHash = createHash("sha256").update(JSON.stringify(selected)).digest("hex");
      report.environment = { node: process.version, platform: process.platform, arch: process.arch, cpus: cpus().length, totalMemoryBytes: totalmem() };
    },
    async phase(name, action) {
      const begin = Date.now();
      let status = "failed";
      try { const result = await action(); status = "passed"; return result; }
      finally { report.phases.push({ name, status, durationMs: Date.now() - begin }); }
    },
    async finish(success, storage) {
      report.resources = await resources.stop();
      try {
        const results = JSON.parse(await readFile(join(output, "results.json"), "utf8"));
        // Includes the storage profile's fixed one worker and CLI overrides.
        if (Number.isInteger(results.config?.workers)) report.workers = results.config.workers;
        report.diagnostics = { hmrReloads: 0, hmrRestarts: 0, clipboardLeases: 0, clipboardWaitMaxMs: 0 };
        function visit(suite, project) {
          for (const spec of suite.specs ?? []) for (const test of spec.tests) {
            report.tests.push({ title: spec.title, project: test.projectName ?? project, status: test.status,
              attempts: test.results.length, durationMs: test.results.reduce((sum, result) => sum + result.duration, 0) });
            for (const annotation of test.annotations ?? []) {
              if (annotation.type === "hmr-counters") {
                const counters = JSON.parse(annotation.description);
                report.diagnostics.hmrReloads += counters.reloads;
                report.diagnostics.hmrRestarts += counters.restarts;
              } else if (annotation.type === "native-clipboard-lease") {
                const lease = JSON.parse(annotation.description);
                report.diagnostics.clipboardLeases++;
                report.diagnostics.clipboardWaitMaxMs = Math.max(report.diagnostics.clipboardWaitMaxMs, lease.waitMs ?? 0);
              }
            }
          }
          for (const child of suite.suites ?? []) visit(child, suite.projectName ?? project);
        }
        for (const suite of results.suites ?? []) visit(suite);
      } catch (error) { if (error.code !== "ENOENT") throw error; }
      try {
        const readiness = JSON.parse(await readFile(join(output, "readiness.json"), "utf8"));
        report.editorReadiness = { ready: readiness.ready, durationMs: readiness.durationMs };
      } catch (error) { if (error.code !== "ENOENT") throw error; }
      report.storage = storage ?? null;
      report.durationMs = Date.now() - started;
      report.otherSetupMs = Math.max(0, report.durationMs - report.phases.reduce((sum, phase) => sum + phase.durationMs, 0));
      report.status = success ? "passed" : "failed";
      report.finishedAt = new Date().toISOString();
      await writeFile(join(output, "metrics.json"), JSON.stringify(report, null, 2) + "\n");
      process.stdout.write(`Spaces timings: ${report.phases.map(item => `${item.name}=${(item.durationMs / 1000).toFixed(1)}s`).join(", ")}; total=${(report.durationMs / 1000).toFixed(1)}s\n`);
    },
  };
}
