import path from "node:path";

export const BASE_CHECKS = ["test", "typecheck", "lint", "build", "security:production", "test:production-integration", "dependencies:check", "license:check"];
export const AREA_NAMES = ["prompt", "canvas", "settings", "media", "generation", "assistant", "capture", "limits"];
const testFile = /(?:^|\/)[^/]+\.(?:test|spec)\.[cm]?[jt]sx?$/;
const storyFile = /\.stories\.[cm]?[jt]sx?$/;
const runtimeFile = /\.(?:[cm]?[jt]sx?|json|css|scss|svg)$/;

const ownedFiles = new Map([
  ["space-node-text", ["prompt"]],
  ["space-generation-prompt", ["prompt", "generation", "assistant"]],
  ["space-node-assistant", ["assistant"]],
  ["space-node-generation", ["generation", "settings"]],
  ["generation-node-parameter-controls", ["generation", "settings"]],
  ["space-model-tools", ["generation", "assistant", "settings"]],
  ["space-model-browser", ["generation", "assistant", "settings"]],
  ["space-workspace-header", ["settings", "canvas"]],
  ["use-space-preferences", ["settings", "generation"]],
  ["use-space-comments", ["settings", "canvas"]],
  ["space-memo-inspector", ["canvas"]],
  ["space-video-capture-menu", ["capture"]],
  ["space-video-capture-controller", ["capture"]],
  ["video-frame-editor", ["capture"]],
  ["space-media-edit-inspector", ["capture"]],
  ...["space-node-media", "space-node-video", "space-node-output", "space-node-gallery", "space-node-compare", "space-media-preview", "space-media-clear-button", "space-input-media-chooser", "space-image-view-settings", "space-gallery-items", "use-space-filmstrip", "use-space-media-download"].map(name => [name, ["media"]]),
  ...["space-canvas", "space-edge", "space-group", "space-editor-toolbar", "space-node-menu", "space-tutorial", "space-quickstart", "space-quickstart-templates", "space-quickstart-types"].map(name => [name, ["canvas"]]),
]);

function fileStem(file) {
  return path.posix.basename(file).replace(/(?:\.module)?\.(?:[cm]?[jt]sx?|css|scss)$/, "");
}

/** A runtime ownership boundary stops propagation into the editor's registry. */
export function ownership(file) {
  if (/^src\/app\/(?:.*\/)?layout\.[jt]sx?$/.test(file) || file === "src/app/globals.css") {
    return { full: true, reason: "공통 레이아웃·전역 스타일" };
  }
  if (/^src\/(?:server\/(?:generation-graph|generation-events|node-execution|image-generation|video-generation|audio-generation|assistant|media-assets|auth)(?:\/|$)|shared\/(?:generation-graph|media-assets|auth)(?:\/|$))/.test(file)) {
    return { full: true, reason: "저장·실행·미디어·인증의 공통 계약" };
  }
  if (/^src\/app\/(?:api\/(?:generation-graphs|spaces|media-assets|image-generation|video-generation|audio-generation|assistant|auth|models|history|prompt-presets)(?:\/|$)|.*\/spaces(?:\/|$))/.test(file)) {
    return { full: true, reason: "스페이스 라우트·서버 경계" };
  }
  if (/^src\/shared\/i18n\//.test(file)) return { areas: ["prompt", "settings", "assistant"], reason: "현지화·IME·설정·어시스턴트 표시" };
  if (/^src\/shared\/ui\/(?:app-(?:audio|video|media)-player|use-app-media-player)/.test(file)) {
    return { areas: ["media"], reason: "공용 미디어 플레이어" };
  }
  if (file.startsWith("src/features/node-studio/")) {
    const areas = ownedFiles.get(fileStem(file));
    return areas ? { areas, reason: "스페이스 기능 소유 경계" } : { full: true, reason: "에디터 공통 상태·조립 또는 미분류 경계" };
  }
  return null;
}

function broadChange(file) {
  return /^(?:package\.json|pnpm-(?:lock|workspace)\.yaml|(?:next|vitest|playwright\.[^.]+|postcss|tailwind|eslint)\.config\.[^/]+|tsconfig[^/]*\.json|instrumentation\.[jt]s|(?:middleware|proxy)\.[jt]s)$/.test(file)
    || /^(?:prisma\/|configs\/|scripts\/verification\/|scripts\/spaces\/|scripts\/production\/test-(?:suite|production)|src\/(?:middleware|proxy|instrumentation)\.)/.test(file);
}

function isRuntime(file) {
  return /^(?:src|scripts|public|configs|prisma)\//.test(file) || broadChange(file);
}

function affect(file, reverseImports) {
  const found = [], visited = new Set(), queue = [file];
  while (queue.length) {
    const next = queue.shift();
    if (visited.has(next)) continue;
    visited.add(next);
    const owner = ownership(next);
    if (owner) { found.push({ ...owner, via: next }); continue; }
    for (const importer of reverseImports.get(next) ?? []) queue.push(importer);
  }
  return found;
}

/** Pure policy: reasons and selected checks are part of the verification record. */
export function createVerificationPlan({ changes, reverseImports = new Map(), unresolvedImports = [], rangeProblem = null, forceFull = false }) {
  const areas = new Set(), reasons = [];
  let full = forceFull || Boolean(rangeProblem), storybook = false, smoke = false;
  if (forceFull) reasons.push({ path: null, level: "full", reason: "명시적인 전체 검증" });
  if (rangeProblem) reasons.push({ path: null, level: "full", reason: `Git 비교 범위를 확정할 수 없음: ${rangeProblem}` });
  for (const change of changes) {
    const file = change.path;
    if (!file || file.startsWith("/") || file.split("/").includes("..") || file.includes("\\")) throw new Error("Invalid repository-relative change path");
    if (broadChange(file)) {
      full = true; reasons.push({ path: file, level: "full", reason: "의존·빌드·DB·검증 실행 경계 변경" }); continue;
    }
    if ((/^[DT]/.test(change.status) || /^[RC]/.test(change.status)) && (isRuntime(file) || isRuntime(change.oldPath ?? ""))) {
      full = true; reasons.push({ path: file, oldPath: change.oldPath, level: "full", reason: "런타임 경로 삭제·이동·복사로 이전 의존 관계 재검증" }); continue;
    }
    if (testFile.test(file)) { reasons.push({ path: file, level: "base", reason: "소유 단위·통합 검사는 기본 실행에 포함" }); continue; }
    if (storyFile.test(file) || file.startsWith(".storybook/")) {
      storybook = true; reasons.push({ path: file, level: "base", reason: "Storybook 구성·스토리 검증 추가" }); continue;
    }
    if (/^src\/.*\.(?:tsx|jsx|css|scss)$/.test(file)) storybook = true;
    if (file.startsWith("public/")) {
      smoke = true;
      if (/\.(?:mp4|webm|mov|wav|mp3|ogg|png|jpe?g|webp|avif)$/i.test(file)) areas.add("media");
      reasons.push({ path: file, level: "related", reason: "정적 표시 자산과 핵심 화면 조작 확인" }); continue;
    }
    const owners = affect(file, reverseImports);
    for (const owner of owners) {
      if (owner.full) full = true;
      else for (const area of owner.areas) areas.add(area);
      reasons.push({ path: file, via: owner.via, level: owner.full ? "full" : "related", reason: owner.reason });
    }
    // An unresolved internal import can conceal a dependency. Escalate if its
    // importer is in the editor and the changed source could supply that import.
    const uncertain = unresolvedImports.find(item => affect(item.importer, reverseImports).length &&
      (item.candidates?.includes(file) || (item.prefix && file.startsWith(item.prefix)) ||
        (!item.candidates && !item.prefix && file.startsWith("src/"))));
    if (uncertain) {
      full = true; reasons.push({ path: file, via: uncertain.importer, level: "full", reason: "스페이스 내부 의존 해석이 불확실함" });
    }
    if (!owners.length && !uncertain) {
      if (/^src\//.test(file) && !runtimeFile.test(file)) {
        full = true; reasons.push({ path: file, level: "full", reason: "해석하지 못하는 소스 형식" });
      } else reasons.push({ path: file, level: "base", reason: "스페이스 런타임 소비 경로 없음; 기본 검사로 확인" });
    }
  }
  const level = full ? "full" : areas.size || smoke ? "related" : "base";
  const selectedAreas = AREA_NAMES.filter(area => areas.has(area));
  const checks = BASE_CHECKS.map(script => ({ id: script, command: "pnpm", args: [script] }));
  if (storybook || full) checks.push({ id: "storybook", command: "pnpm", args: ["build-storybook"] });
  if (level !== "base") checks.push({ id: "spaces-e2e", command: "pnpm", args: full ? ["e2e:spaces:isolated"]
    : ["e2e:spaces:isolated", "--areas", selectedAreas.length ? selectedAreas.join(",") : "smoke"] });
  return { schemaVersion: 1, level, areas: full ? [...AREA_NAMES] : selectedAreas, smoke: level !== "base", storybook: storybook || full, reasons, checks };
}
