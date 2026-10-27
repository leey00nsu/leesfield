import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { AREA_NAMES, createVerificationPlan } from "./policy.mjs";
import { readGitImpact, readImportGraph } from "./git-impact.mjs";
import { executeVerificationBatch, runCheckProcess, verificationBatches } from "./execution.mjs";
import { verificationEnvironment } from "./environment.mjs";
import { readStorageDependencyImpact } from "./external-contract.mjs";
import { resolveVerificationWorkerPlan } from "./worker-plan.mjs";
import { createResourceMonitor } from "./resources.mjs";
import { selectTier, validateTierCatalog } from "../spaces/e2e-tiers.mjs";
import { collectSpacesTests, selectSpacesTests, SPACES_E2E_AREAS } from "../spaces/e2e-groups.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const reportDirectory = resolve(root, ".next/verification");
const argumentsSet = new Set(process.argv.slice(2));
for (const argument of argumentsSet) if (!["--plan", "--json", "--full", "--release"].includes(argument)) throw new Error(`Unknown verification option: ${argument}`);
if (argumentsSet.has("--json") && !argumentsSet.has("--plan")) throw new Error("--json is available with --plan only");
let cancelled = null;
const shutdown = new AbortController();
for (const signal of ["SIGINT", "SIGTERM"]) process.once(signal, () => { cancelled = signal; shutdown.abort(); });
let persistTail = Promise.resolve();
async function persist(name, value) {
  await mkdir(reportDirectory, { recursive: true });
  await writeFile(resolve(reportDirectory, name), JSON.stringify(value, null, 2) + "\n");
}

function describe(plan) {
  const labels = { base: "기본", related: "관련", full: "전체" };
  process.stdout.write(`검증 범위: ${labels[plan.level]}\nGit 기준: ${plan.git.baseRef} merge-base ${plan.git.base ?? "판단 불가"}\n`);
  if (plan.browser) process.stdout.write(`스페이스 E2E: ${plan.browser.selected}/${plan.browser.total}회, ${plan.level === "full" ? "모든 영역" : "핵심 smoke + " + (plan.areas.join(", ") || "화면 조작")}\n`);
  else process.stdout.write("스페이스 E2E: 관련 변경 없음\n");
  process.stdout.write("실제 Leemage 연동: " + (plan.external.required ? "필수 실행" : "선택되지 않음") + "\n");
  for (const reason of plan.reasons.slice(0, 8)) process.stdout.write(`  ${reason.path ?? "전체"}: ${reason.reason}${reason.via && reason.via !== reason.path ? " (소비 경로: " + reason.via + ")" : ""}\n`);
  if (plan.reasons.length > 8) process.stdout.write(`  그 외 ${plan.reasons.length - 8}개 근거는 .next/verification/last-plan.json에서 확인\n`);
  for (const check of plan.checks) process.stdout.write(`  → ${check.command} ${check.args.join(" ")}\n`);
}

const runStarted = Date.now();
const record = { schemaVersion: 2, startedAt: new Date(runStarted).toISOString(), status: "running", plan: null, checks: [], batches: [] };
const resources = createResourceMonitor();
if (!argumentsSet.has("--plan")) resources.start();
try {
  if ([...SPACES_E2E_AREAS].sort().join(",") !== [...AREA_NAMES].sort().join(",")) throw new Error("검증 정책과 브라우저 영역 목록이 다릅니다.");
  const impact = await readGitImpact(root);
  let graph = { reverseImports: new Map(), unresolvedImports: [] }, graphProblem = null;
  try { graph = await readImportGraph(root); }
  catch (error) { graphProblem = `내부 의존 분석 실패: ${error.message}`; }
  const dependencyImpact = await readStorageDependencyImpact(root, impact);
  const plan = createVerificationPlan({ ...impact, ...graph, rangeProblem: impact.rangeProblem ?? graphProblem,
    forceFull: argumentsSet.has("--full") || argumentsSet.has("--release"), forceExternal: argumentsSet.has("--release"), dependencyImpact });
  plan.git = { head: impact.head, baseRef: impact.baseRef, base: impact.base, fingerprint: impact.fingerprint };
  plan.changedFiles = impact.changes;
  if (plan.level !== "base") {
    const catalog = await collectSpacesTests(root);
    validateTierCatalog(catalog);
    const selected = selectTier(selectSpacesTests(catalog), plan.browserTier);
    plan.browser = { tier: plan.browserTier, total: catalog.length, selected: selected.length, tests: selected };
  } else plan.browser = null;
  const workerPlan = await resolveVerificationWorkerPlan(process.env);
  plan.workerPlan = workerPlan;
  try { plan.rootCompilerCachePresent = (await readdir(resolve(root, ".next/cache"))).length > 0; }
  catch { plan.rootCompilerCachePresent = false; }
  const unitReport = resolve(reportDirectory, "unit-results.json");
  const unitCheck = plan.checks.find(check => check.id === "test");
  if (unitCheck) unitCheck.args = ["test", "--reporter=default", "--reporter=json", "--outputFile=" + unitReport];
  const batches = verificationBatches(plan.checks, workerPlan);
  plan.executionBatches = batches.map(batch => batch.map(check => check.id));
  record.plan = plan;
  await persist("last-plan.json", plan);
  if (argumentsSet.has("--plan")) {
    if (argumentsSet.has("--json")) process.stdout.write(JSON.stringify(plan, null, 2) + "\n");
    else describe(plan);
  } else {
    describe(plan);
    process.stdout.write("Unit workers: " + workerPlan.unitWorkers + "; " + workerPlan.reason + "\n");
    for (const batch of batches) {
      const started = Date.now();
      const batchRecord = { checks: batch.map(check => check.id), status: "running", durationMs: 0 };
      record.batches.push(batchRecord);
      process.stdout.write("\n[verify] " + batch.map(check => check.command + " " + check.args.join(" ")).join(" | ") + "\n");
      try {
        await executeVerificationBatch(batch,
          (check, signal) => runCheckProcess(check, { cwd: root,
            env: verificationEnvironment(process.env, { memoryConstrained: check.id === "spaces-e2e" && (workerPlan.constrained || resources.memoryConstrained()), unitWorkers: workerPlan.unitWorkers }), signal }),
          async result => {
            record.checks.push(result);
            if (result.id === "test") {
              try {
                const unit = JSON.parse(await readFile(unitReport, "utf8"));
                record.unitTests = { total: unit.numTotalTests, passed: unit.numPassedTests, failed: unit.numFailedTests,
                  skipped: unit.numPendingTests, files: unit.testResults.map(file => ({
                    path: relative(root, file.name).replaceAll(sep, "/"),
                    testBodyDurationMs: Math.max(0, file.endTime - file.startTime),
                    tests: file.assertionResults.map(test => ({ title: test.fullName, status: test.status, durationMs: test.duration ?? null })),
                  })) };
              } catch {
                record.unitTimingUnavailable = true;
                if (result.exitCode === 0) throw new Error("Unit test timing report unavailable");
              }
            }
            // Parallel completions serialize report writes; preserve every result.
            persistTail = persistTail.then(() => persist("last-run.json", record));
            return persistTail;
          }, shutdown.signal);
        batchRecord.status = "passed";
      } catch (error) { batchRecord.status = "failed"; throw error; }
      finally { batchRecord.durationMs = Date.now() - started; await persistTail; await persist("last-run.json", record); }
    }
    const current = await readGitImpact(root);
    if (!impact.fingerprint || impact.fingerprint !== current.fingerprint || impact.head !== current.head) {
      throw new Error("검증 중 소스가 변경되었습니다. 현재 작업 트리로 다시 실행하세요.");
    }
    record.status = "passed";
    record.finishedAt = new Date().toISOString();
    record.resources = await resources.stop();
    record.durationMs = Date.now() - runStarted;
    record.summedCheckDurationMs = record.checks.reduce((sum, check) => sum + check.durationMs, 0);
    // Next build recreates .next; restore the plan alongside the final record.
    await persist("last-plan.json", plan);
    await persist("last-run.json", record);
    process.stdout.write(`\n검증 통과: ${plan.level}, ${record.checks.length}개 명령, ${(record.durationMs / 1000).toFixed(1)}초\n`);
  }
} catch (error) {
  record.status = "failed"; record.error = error.message; record.finishedAt = new Date().toISOString();
  record.resources = await resources.stop();
  record.durationMs = Date.now() - runStarted;
  if (record.plan) await persist("last-plan.json", record.plan).catch(() => undefined);
  await persist("last-run.json", record).catch(() => undefined);
  process.stderr.write(error.message + "\n");
  process.exitCode = cancelled === "SIGINT" ? 130 : cancelled === "SIGTERM" ? 143 : 1;
}
