import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { AREA_NAMES, createVerificationPlan } from "./policy.mjs";
import { readGitImpact, readImportGraph } from "./git-impact.mjs";
import { verificationEnvironment } from "./environment.mjs";
import { collectSpacesTests, selectSpacesTests, SPACES_E2E_AREAS } from "../spaces/e2e-groups.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const reportDirectory = resolve(root, ".next/verification");
const argumentsSet = new Set(process.argv.slice(2));
for (const argument of argumentsSet) if (!["--plan", "--json", "--full"].includes(argument)) throw new Error(`Unknown verification option: ${argument}`);
if (argumentsSet.has("--json") && !argumentsSet.has("--plan")) throw new Error("--json is available with --plan only");
let activeChild = null, cancelled = null;
function terminate(signal) {
  cancelled = signal;
  if (!activeChild?.pid) return;
  try {
    if (process.platform === "win32") activeChild.kill(signal);
    else process.kill(-activeChild.pid, signal);
  } catch (error) { if (error.code !== "ESRCH") throw error; }
}
for (const signal of ["SIGINT", "SIGTERM"]) process.once(signal, () => terminate(signal));

async function persist(name, value) {
  await mkdir(reportDirectory, { recursive: true });
  await writeFile(resolve(reportDirectory, name), JSON.stringify(value, null, 2) + "\n");
}

async function command(check) {
  if (cancelled) throw new Error(`Verification interrupted: ${cancelled}`);
  return new Promise((resolveCommand, reject) => {
    activeChild = spawn(check.command, check.args, { cwd: root, env: verificationEnvironment(process.env), stdio: "inherit", detached: process.platform !== "win32" });
    activeChild.once("error", reject);
    activeChild.once("close", (code, signal) => {
      activeChild = null;
      resolveCommand({ exitCode: code, signal });
    });
  });
}

function describe(plan) {
  const labels = { base: "기본", related: "관련", full: "전체" };
  process.stdout.write(`검증 범위: ${labels[plan.level]}\nGit 기준: ${plan.git.baseRef} merge-base ${plan.git.base ?? "판단 불가"}\n`);
  if (plan.browser) process.stdout.write(`스페이스 E2E: ${plan.browser.selected}/${plan.browser.total}회, ${plan.level === "full" ? "모든 영역" : "핵심 smoke + " + (plan.areas.join(", ") || "화면 조작")}\n`);
  else process.stdout.write("스페이스 E2E: 관련 변경 없음\n");
  for (const reason of plan.reasons.slice(0, 8)) process.stdout.write(`  ${reason.path ?? "전체"}: ${reason.reason}${reason.via && reason.via !== reason.path ? " (소비 경로: " + reason.via + ")" : ""}\n`);
  if (plan.reasons.length > 8) process.stdout.write(`  그 외 ${plan.reasons.length - 8}개 근거는 .next/verification/last-plan.json에서 확인\n`);
  for (const check of plan.checks) process.stdout.write(`  → ${check.command} ${check.args.join(" ")}\n`);
}

const record = { schemaVersion: 1, startedAt: new Date().toISOString(), status: "running", plan: null, checks: [] };
try {
  if ([...SPACES_E2E_AREAS].sort().join(",") !== [...AREA_NAMES].sort().join(",")) throw new Error("검증 정책과 브라우저 영역 목록이 다릅니다.");
  const impact = await readGitImpact(root);
  let graph = { reverseImports: new Map(), unresolvedImports: [] }, graphProblem = null;
  try { graph = await readImportGraph(root); }
  catch (error) { graphProblem = `내부 의존 분석 실패: ${error.message}`; }
  const plan = createVerificationPlan({ ...impact, ...graph, rangeProblem: impact.rangeProblem ?? graphProblem, forceFull: argumentsSet.has("--full") });
  plan.git = { head: impact.head, baseRef: impact.baseRef, base: impact.base, fingerprint: impact.fingerprint };
  plan.changedFiles = impact.changes;
  if (plan.level !== "base") {
    const catalog = await collectSpacesTests(root);
    const selected = selectSpacesTests(catalog, plan.level === "full" ? null : plan.areas);
    plan.browser = { total: catalog.length, selected: selected.length, tests: selected };
  } else plan.browser = null;
  record.plan = plan;
  await persist("last-plan.json", plan);
  if (argumentsSet.has("--plan")) {
    if (argumentsSet.has("--json")) process.stdout.write(JSON.stringify(plan, null, 2) + "\n");
    else describe(plan);
  } else {
    describe(plan);
    for (const check of plan.checks) {
      const started = Date.now();
      process.stdout.write(`\n[verify] ${check.command} ${check.args.join(" ")}\n`);
      const result = await command(check);
      record.checks.push({ ...check, ...result, durationMs: Date.now() - started });
      await persist("last-run.json", record);
      if (result.exitCode !== 0 || cancelled) throw new Error(`Verification failed: ${check.id}${result.signal ? " (" + result.signal + ")" : ""}`);
    }
    const current = await readGitImpact(root);
    if (!impact.fingerprint || impact.fingerprint !== current.fingerprint || impact.head !== current.head) {
      throw new Error("검증 중 소스가 변경되었습니다. 현재 작업 트리로 다시 실행하세요.");
    }
    record.status = "passed";
    record.finishedAt = new Date().toISOString();
    record.durationMs = record.checks.reduce((sum, check) => sum + check.durationMs, 0);
    await persist("last-run.json", record);
    process.stdout.write(`\n검증 통과: ${plan.level}, ${record.checks.length}개 명령, ${(record.durationMs / 1000).toFixed(1)}초\n`);
  }
} catch (error) {
  record.status = "failed"; record.error = error.message; record.finishedAt = new Date().toISOString();
  await persist("last-run.json", record).catch(() => undefined);
  process.stderr.write(error.message + "\n");
  process.exitCode = cancelled === "SIGINT" ? 130 : cancelled === "SIGTERM" ? 143 : 1;
}
