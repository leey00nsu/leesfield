import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { promisify } from "node:util";

const exec = promisify(execFile);
const roots = [
  /^src\/server\/(?:image|video|audio)-generation\/storage\//,
  /^src\/server\/shared\/leemage-/,
  /^src\/server\/media-assets\/(?:leemage-media-storage|media-storage|media-asset-(?:service|repository|http)|media-cleanup|media-inspection|image-upload-policy)/,
  /^src\/app\/api\/media-assets\/(?:uploads(?:\/|$)|\[assetId\]\/(?:content|download)\/|\[assetId\]\/route\.)/,
  /^src\/server\/job-queue\/handlers\/storage-cleanup-handler\./,
  /^scripts\/spaces\/(?:run-e2e|storage-fetch|storage-admission)\.mjs$/,
  /^scripts\/spaces\/e2e\/storage-contract\.spec\.mjs$/,
  /^playwright\.storage\.config\.mjs$/,
  /^next\.config\./,
];
const dependencyFiles = new Set(["package.json", "pnpm-lock.yaml", "pnpm-workspace.yaml"]);
const isRoot = file => roots.some(pattern => pattern.test(file));

function reachesStorage(file, reverseImports, storageSdkConsumers) {
  const queue = [file], seen = new Set();
  while (queue.length) {
    const current = queue.shift();
    if (seen.has(current)) continue;
    seen.add(current);
    if (isRoot(current) || storageSdkConsumers.has(current)) return true;
    for (const consumer of reverseImports.get(current) ?? []) queue.push(consumer);
  }
  return false;
}

export function externalContractDecision({
  changes, reverseImports = new Map(), unresolvedImports = [], rangeProblem,
  forceExternal = false, dependencyImpact, storageSdkConsumers = new Set(),
}) {
  const reasons = [];
  if (forceExternal) reasons.push({ path: null, reason: "명시적인 release 검증" });
  if (rangeProblem) reasons.push({ path: null, reason: "변경 범위를 확정할 수 없음" });
  for (const change of changes) {
    for (const file of [change.path, change.oldPath].filter(Boolean)) {
      if (dependencyFiles.has(file)) {
        if (dependencyImpact?.required !== false) reasons.push({ path: file, reason: dependencyImpact?.reason ?? "저장소 SDK 의존 변경 여부가 불확실함" });
        continue;
      }
      if (reachesStorage(file, reverseImports, storageSdkConsumers)) {
        reasons.push({ path: file, reason: "실제 저장소 연결부·계약 또는 소비 의존 변경" });
        continue;
      }
      if (/^[DRC]/.test(change.status) && file.startsWith("src/")) {
        reasons.push({ path: file, reason: "이전 저장소 소비 경로가 사라졌을 수 있는 소스 이동·삭제" });
        continue;
      }
      if (unresolvedImports.some(item => reachesStorage(item.importer, reverseImports, storageSdkConsumers) &&
        (item.candidates?.includes(file) || (item.prefix && file.startsWith(item.prefix)) ||
          (!item.candidates && !item.prefix && file.startsWith("src/"))))) {
        reasons.push({ path: file, reason: "저장소 연결부의 내부 의존 해석이 불확실함" });
      }
    }
  }
  return { required: reasons.length > 0, reasons };
}

export async function readStorageDependencyImpact(root, impact) {
  const paths = impact.changes.flatMap(change => [change.path, change.oldPath].filter(Boolean));
  if (paths.some(file => file === "pnpm-lock.yaml" || file === "pnpm-workspace.yaml")) {
    return { required: true, reason: "lock/workspace 변경으로 저장소 SDK의 전이 의존 재확인이 필요함" };
  }
  if (!paths.includes("package.json")) return { required: false, reason: "의존 manifest 변경 없음" };
  try {
    if (!/^[a-f0-9]{40,64}$/.test(impact.base ?? "")) throw new Error("Unknown manifest baseline");
    const previous = JSON.parse((await exec("git", ["show", impact.base + ":package.json"], { cwd: root })).stdout);
    const current = JSON.parse(await readFile(root + "/package.json", "utf8"));
    // Only a scripts-only edit is proven independent of SDK resolution.
    delete previous.scripts; delete current.scripts;
    const onlyScripts = JSON.stringify(previous) === JSON.stringify(current);
    return { required: !onlyScripts, reason: onlyScripts ? "manifest의 명령만 변경됨" : "manifest의 SDK/의존 해석 영향 재확인" };
  } catch { return { required: true, reason: "의존 manifest 비교가 불확실함" }; }
}
