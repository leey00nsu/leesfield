import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { readGitImpact, readImportGraph } from "./git-impact.mjs";
import { verificationEnvironment } from "./environment.mjs";
import { executeVerificationBatch, runCheckProcess } from "./execution.mjs";
import { discoverQuickTests, parseQuickArguments, quickScope, validateQuickFiles } from "./quick-plan.mjs";
import { resolveVerificationWorkerPlan } from "./worker-plan.mjs";
import { createResourceMonitor } from "./resources.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const output = resolve(root, ".next/verification/quick", randomUUID());
const started = Date.now();
const record = { schemaVersion: 1, official: false, status: "running", startedAt: new Date(started).toISOString(), plan: null, checks: [] };
const resources = createResourceMonitor();
if (!process.argv.includes("--plan")) resources.start();
const cancellation = new AbortController();
let interrupted;
for (const signal of ["SIGINT", "SIGTERM"]) process.once(signal, () => { interrupted = signal; cancellation.abort(); });
let tail = Promise.resolve();
async function persist() {
  await mkdir(output, { recursive: true });
  const json = JSON.stringify(record, null, 2) + "\n";
  await writeFile(resolve(output, "run.json"), json);
  await writeFile(resolve(root, ".next/verification/last-quick.json"), json);
}

try {
  const args = parseQuickArguments(process.argv.slice(2));
  const workerPlan = await resolveVerificationWorkerPlan(process.env);
  const env = verificationEnvironment(process.env, { unitWorkers: workerPlan.unitWorkers });
  // Discovery loads the same Vitest config. A focused DB shell must not turn
  // this development command into a DB suite or use the developer database.
  delete process.env.PRODUCTION_INTEGRATION_TEST;
  delete process.env.PRODUCTION_INTEGRATION_TEST_TARGETS;
  const initial = await readGitImpact(root, args.since);
  const files = args.files.length ? await validateQuickFiles(root, args.files) : initial.changes.map(change => change.path);
  let graph = { reverseImports: new Map(), unresolvedImports: [] };
  let graphProblem = null;
  try { graph = await readImportGraph(root); } catch { graphProblem = "Internal dependency analysis failed"; }
  const scope = quickScope({
    ...initial, changes: args.files.length ? files.map(path => ({ status: "M", path })) : initial.changes,
    rangeProblem: initial.rangeProblem ?? graphProblem,
  }, graph);
  const discovery = files.length || scope.fullVerificationRequired
    ? await discoverQuickTests(root, files, scope.fullVerificationRequired) : { files: [], fallback: null };
  const lintFiles = (await Promise.all(files.filter(file => /\.[cm]?[jt]sx?$/.test(file))
    .map(async file => { try { return (await validateQuickFiles(root, [file]))[0]; } catch { return null; } })))
    .filter(Boolean);
  const testsReport = resolve(output, "tests.json");
  const checks = [];
  if (files.length || scope.fullVerificationRequired) {
    checks.push({ id: "typecheck", command: "pnpm", args: ["typecheck"] });
    if (discovery.files.length) checks.push({ id: "test", command: "pnpm", args: ["exec", "vitest", "run", ...discovery.files,
      "--maxWorkers=" + workerPlan.unitWorkers, "--reporter=json", "--outputFile=" + testsReport] });
    if (scope.fullVerificationRequired || lintFiles.length) checks.push({ id: "lint", command: "pnpm",
      args: ["exec", "eslint", ...(scope.fullVerificationRequired ? [] : lintFiles)] });
  }
  const plan = record.plan = {
    ...scope, workerPlan, since: args.since, input: args.files.length ? "explicit-files" : "git-changes", changedFiles: files,
    git: { head: initial.head, fingerprint: initial.fingerprint },
    unitTests: discovery.files, selectionFallback: discovery.fallback,
    noRelatedUnitTests: files.length > 0 && discovery.files.length === 0,
    checks,
  };
  if (args.planOnly) {
    if (args.json) process.stdout.write(JSON.stringify(plan, null, 2) + "\n");
    else process.stdout.write("개발용 빠른 검사 계획 (공식 전체 검증 별도)\n" + JSON.stringify(plan, null, 2) + "\n");
  } else {
    process.stdout.write("개발용 빠른 검사: 관련 단위/UI " + discovery.files.length + "개 파일; 공식 전체 검증 별도\n");
    if (plan.fullVerificationRequired) process.stdout.write("영향 범위가 넓거나 불확실해 단위/UI와 lint 전체를 확인합니다. 공식 전체 검증이 필요합니다.\n");
    if (plan.noRelatedUnitTests) process.stdout.write("관련 단위 검사 대상이 없습니다. 타입/lint 결과와 구분합니다.\n");
    await persist();
    const preparation = checks.filter(check => check.id === "typecheck");
    const remaining = checks.filter(check => check.id !== "typecheck");
    for (const batch of (workerPlan.constrained ? [...preparation.map(check => [check]), ...remaining.map(check => [check])] : [preparation, remaining]).filter(batch => batch.length)) {
      await executeVerificationBatch(batch,
        (check, signal) => runCheckProcess(check, { cwd: root, env, signal }),
        result => { record.checks.push(result); tail = tail.then(persist); return tail; },
        cancellation.signal);
    }
    if (discovery.files.length) {
      const result = JSON.parse(await readFile(testsReport, "utf8"));
      const actual = result.testResults.map(test => relative(root, test.name).replaceAll(sep, "/")).sort();
      if (JSON.stringify([...new Set(actual)]) !== JSON.stringify(discovery.files)) throw new Error("Executed unit scope differs from the quick plan");
      record.unitResult = { files: actual.length, passed: result.numPassedTests, failed: result.numFailedTests, skipped: result.numPendingTests };
    }
    const current = await readGitImpact(root, args.since);
    if (!initial.fingerprint || initial.fingerprint !== current.fingerprint || initial.head !== current.head) throw new Error("Source changed during quick verification");
    record.status = checks.length ? "passed" : "no_changes";
    record.resources = await resources.stop();
    record.durationMs = Date.now() - started;
    record.finishedAt = new Date().toISOString();
    await persist();
    process.stdout.write((checks.length ? "빠른 검사 통과" : "변경 없음: 실행한 검사 없음") + ": " +
      (record.durationMs / 1000).toFixed(1) + "초; 공식 전체 검증을 대체하지 않습니다.\n");
  }
} catch (error) {
  record.status = "failed"; record.error = error.message;
  record.resources = await resources.stop();
  record.durationMs = Date.now() - started; record.finishedAt = new Date().toISOString();
  await tail.catch(() => undefined);
  await persist().catch(() => undefined);
  process.stderr.write(error.message + "\n");
  process.exitCode = interrupted === "SIGINT" ? 130 : interrupted === "SIGTERM" ? 143 : 1;
}
