import { execFile } from "node:child_process";
import { mkdtemp, mkdir, writeFile, rm, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { afterEach, describe, expect, it } from "vitest";
import { createVerificationPlan } from "./policy.mjs";
import { parseNameStatus, readGitImpact, readImportGraph } from "./git-impact.mjs";
import { verificationEnvironment } from "./environment.mjs";
import { getTestSuiteSelection } from "../production/test-suite-groups.mjs";

const modified = file => ({ path: file, status: "M" });
const planFor = (files, extra = {}) => createVerificationPlan({ changes: files.map(modified), ...extra });
const scripts = plan => plan.checks.map(check => check.args[0]);
const temporary = [];
const execute = promisify(execFile);
afterEach(async () => { for (const directory of temporary.splice(0)) await rm(directory, { recursive: true, force: true }); });
async function fixture(files) {
  const root = await mkdtemp(path.join(os.tmpdir(), "leesfield-verify-test-")); temporary.push(root);
  for (const [file, source] of Object.entries(files)) {
    await mkdir(path.dirname(path.join(root, file)), { recursive: true }); await writeFile(path.join(root, file), source);
  }
  return root;
}

describe("verification impact decisions", () => {
  it("runs the regular suite even when invoked from a focused database-test shell", () => {
    const inherited = { PRODUCTION_INTEGRATION_TEST: "1", PRODUCTION_INTEGRATION_TEST_TARGETS: '["src/server/generation-graph/generation-graph-migration.test.ts"]', DATABASE_URL: "kept-database", SESSION_PASSWORD: "kept-session" };
    const normalized = verificationEnvironment(inherited);
    const selection = getTestSuiteSelection(normalized);
    expect(selection.include).toBeUndefined();
    expect(selection.exclude).toContain("**/*-postgres.integration.test.ts");
    expect(normalized.DATABASE_URL).toBe(inherited.DATABASE_URL);
    expect(normalized.SESSION_PASSWORD).toBe(inherited.SESSION_PASSWORD);
    expect(inherited.PRODUCTION_INTEGRATION_TEST).toBe("1");
  });
  it("passes only this verification's observed memory constraint to the browser", () => {
    const inherited = { SPACES_E2E_MEMORY_CONSTRAINED: "1", SPACES_E2E_WORKERS: "4" };
    expect(verificationEnvironment(inherited).SPACES_E2E_MEMORY_CONSTRAINED).toBeUndefined();
    expect(verificationEnvironment(inherited, { memoryConstrained: true })).toMatchObject({ SPACES_E2E_MEMORY_CONSTRAINED: "1", SPACES_E2E_WORKERS: "4" });
    expect(inherited.SPACES_E2E_MEMORY_CONSTRAINED).toBe("1");
  });
  it("keeps unrelated API work on the basic checks, including database and security contracts", () => {
    const plan = planFor(["src/app/api/unrelated-report/route.ts"]);
    expect(plan.level).toBe("base");
    expect(scripts(plan)).toEqual(expect.arrayContaining(["test", "test:production-integration", "typecheck", "lint", "build", "security:production", "license:check", "dependencies:check"]));
    expect(scripts(plan)).not.toContain("e2e:spaces:isolated");
  });
  it("builds stories for unrelated UI without claiming that it affects the editor", () => {
    const plan = planFor(["src/widgets/api-docs/ui/api-docs-widget.tsx"]);
    expect(plan.level).toBe("base"); expect(plan.storybook).toBe(true);
    expect(scripts(plan)).toContain("build-storybook"); expect(scripts(plan)).not.toContain("e2e:spaces:isolated");
    expect(scripts(plan)).toContain("test:browser");
  });
  it("runs browser component changes in Chrome and production core in release only", () => {
    expect(scripts(planFor(["src/shared/ui/app-tabs.browser.test.tsx"]))).toContain("test:browser");
    expect(planFor(["vitest.browser.config.ts"]).level).toBe("full");
    expect(scripts(planFor([], { forceFull: true }))).toContain("test:browser");
    expect(scripts(planFor([], { forceFull: true }))).not.toContain("e2e:spaces:production");
    expect(scripts(planFor([], { forceFull: true, forceExternal: true }))).toContain("e2e:spaces:production");
  });
  it("keeps unit-only corrections in the owned baseline suites", () => {
    expect(planFor(["src/features/node-studio/model/space-editor-document.test.ts"]).level).toBe("base");
  });
  it("selects Assistant and smoke while keeping the rest of the browser suite available", () => {
    const plan = planFor(["src/features/node-studio/ui/nodes/space-node-assistant.tsx"]);
    expect(plan.level).toBe("related"); expect(plan.areas).toEqual(["assistant"]); expect(plan.smoke).toBe(true);
    expect(plan.checks.at(-1).args).toEqual(["e2e:spaces:core"]);
  });
  it("follows reverse imports but stops at a functional owner instead of the shared registry", () => {
    const graph = new Map([
      ["src/shared/lib/prompt-format.ts", new Set(["src/features/node-studio/ui/nodes/space-node-assistant.tsx"])],
      ["src/features/node-studio/ui/nodes/space-node-assistant.tsx", new Set(["src/features/node-studio/ui/node-studio-workspace.tsx"])],
    ]);
    expect(planFor(["src/shared/lib/prompt-format.ts"], { reverseImports: graph }).areas).toEqual(["assistant"]);
  });
  it("unions different runtime consumers of a shared helper", () => {
    const graph = new Map([["src/shared/lib/shared.ts", new Set(["src/features/node-studio/ui/nodes/space-node-assistant.tsx", "src/features/node-studio/ui/nodes/space-node-media.tsx"])]]);
    const plan = planFor(["src/shared/lib/shared.ts"], { reverseImports: graph });
    expect(plan.level).toBe("related"); expect(plan.areas).toEqual(["media", "assistant"]);
  });
  it.each([
    "prisma/schema.prisma", "pnpm-lock.yaml", "next.config.ts", "scripts/verification/policy.mjs", ".husky/pre-push",
    "scripts/spaces/e2e/spaces.spec.mjs", "src/features/node-studio/model/space-editor-document.ts",
    "src/server/generation-graph/generation-graph-service.ts", "src/features/node-studio/ui/unknown-new-owner.tsx",
    "src/app/api/models/route.ts", "src/app/api/history/[historyId]/route.ts",
  ])("uses the full suite for the broad contract %s", file => {
    const plan = planFor([file]); expect(plan.level).toBe("full"); expect(plan.storybook).toBe(true);
    expect(plan.browserTier).toBe("core");
    expect(plan.checks.at(-1).args).toEqual(["e2e:spaces:core"]);
  });
  it("keeps a deleted or renamed runtime edge from disappearing from impact analysis", () => {
    for (const change of [{ status: "D", path: "src/shared/lib/deleted.ts" }, { status: "R100", path: "src/new.ts", oldPath: "src/old.ts" }]) {
      expect(createVerificationPlan({ changes: [change] }).level).toBe("full");
    }
  });
  it("escalates a missing baseline and explicit full requests", () => {
    expect(planFor([], { rangeProblem: "main unavailable" })).toMatchObject({ level: "full", browserTier: "all" });
    expect(planFor([], { forceFull: true }).checks.at(-1).args).toEqual(["e2e:spaces:isolated"]);
    expect(planFor(["documentation.md"], { forceFull: true }).level).toBe("full");
  });
  it("requires real storage for storage and SDK changes, but not unrelated local full or UI checks", () => {
    for (const file of ["src/server/media-assets/leemage-media-storage.ts", "pnpm-lock.yaml", "scripts/spaces/run-e2e.mjs"]) {
      expect(scripts(planFor([file]))).toContain("test:storage-contract:isolated");
    }
    expect(scripts(planFor([], { forceFull: true }))).not.toContain("test:storage-contract:isolated");
    expect(scripts(planFor([], { forceFull: true, forceExternal: true }))).toContain("test:storage-contract:isolated");
    expect(scripts(planFor(["scripts/spaces/local-storage.mjs"]))).not.toContain("test:storage-contract:isolated");
    expect(scripts(planFor(["src/features/node-studio/ui/nodes/space-node-media.tsx"]))).not.toContain("test:storage-contract:isolated");
  });
  it("escalates an unresolved internal dependency which could conceal a Space consumer", () => {
    const plan = planFor(["src/shared/lib/missing.ts"], { unresolvedImports: [{ importer: "src/features/node-studio/ui/nodes/space-node-assistant.tsx", candidates: ["src/shared/lib/missing.ts"] }] });
    expect(plan.level).toBe("full"); expect(plan.reasons.some(reason => reason.via?.includes("assistant"))).toBe(true);
  });
  it("does not promote unrelated unresolved imports into a full browser run", () => {
    const plan = planFor(["src/widgets/api-docs/example.ts"], { unresolvedImports: [{ importer: "src/widgets/unrelated/example.ts", candidates: ["src/widgets/api-docs/example.ts"] }] });
    expect(plan.level).toBe("base");
  });
});

describe("Git and dependency inputs", () => {
  it("parses NUL-delimited renames, deletions and names with spaces without splitting paths", () => {
    expect(parseNameStatus("R100\0src/옛 파일.ts\0src/new file.ts\0D\0src/delete.ts\0M\0src/edited.ts\0")).toEqual([
      { status: "R100", oldPath: "src/옛 파일.ts", path: "src/new file.ts" }, { status: "D", path: "src/delete.ts" }, { status: "M", path: "src/edited.ts" },
    ]);
    expect(() => parseNameStatus("R100\0only-old\0")).toThrow("Incomplete Git rename");
  });
  it("propagates aliases, re-exports and CSS imports through real source fixtures", async () => {
    const root = await fixture({
      "src/features/node-studio/ui/nodes/space-node-assistant.tsx": "import {value} from '@/shared/lib/export'; import './view.module.css'; export default value;",
      "src/shared/lib/export.ts": "export {value} from './format';",
      "src/shared/lib/format.ts": "export const value = 'prompt';",
      "src/features/node-studio/ui/nodes/view.module.css": "@import '../../../styles/type.css';",
      "src/features/styles/type.css": ".text { color: red; }",
    });
    const graph = await readImportGraph(root);
    expect(planFor(["src/shared/lib/format.ts"], graph).areas).toEqual(["assistant"]);
    expect(planFor(["src/features/styles/type.css"], graph).level).toBe("full");
  });
  it.each([
    "const view = import(`@/entities/format-${kind}`);",
    "const view = import(resolveModule());",
  ])("does not conceal changed source behind dynamic imports: %s", async source => {
    const root = await fixture({
      "src/features/node-studio/ui/nodes/space-node-assistant.tsx": source,
      "src/entities/format-card.ts": "export default 'card';",
    });
    const graph = await readImportGraph(root);
    const plan = planFor(["src/entities/format-card.ts"], graph);
    expect(plan.level).toBe("full");
    expect(plan.reasons.some(reason => reason.reason.includes("의존 해석"))).toBe(true);
  });
  it("includes committed, staged, unstaged and untracked changes and detects content changes", async () => {
    const root = await fixture({ "src/original.ts": "export const value = 1;\n" });
    const git = args => execute("git", args, { cwd: root });
    await git(["init", "--quiet", "--initial-branch=main"]);
    await git(["add", "."]);
    await git(["-c", "user.name=Verification fixture", "-c", "user.email=verify@localhost", "-c", "commit.gpgsign=false", "commit", "--quiet", "-m", "baseline"]);
    await git(["checkout", "--quiet", "-b", "feature"]);
    await writeFile(path.join(root, "src/committed.ts"), "export const committed = true;\n");
    await git(["add", "."]);
    await git(["-c", "user.name=Verification fixture", "-c", "user.email=verify@localhost", "-c", "commit.gpgsign=false", "commit", "--quiet", "-m", "feature"]);
    await writeFile(path.join(root, "src/original.ts"), "export const value = 2;\n"); await git(["add", "."]);
    await writeFile(path.join(root, "src/original.ts"), "export const value = 3;\n");
    await writeFile(path.join(root, "src/untracked.ts"), "export const fresh = true;\n");
    const first = await readGitImpact(root);
    expect(first.rangeProblem).toBeNull(); expect(first.changes.map(change => change.path).sort()).toEqual(["src/committed.ts", "src/original.ts", "src/untracked.ts"]);
    // An index-only edit must remain visible even when the working file is
    // restored to the baseline; a later index change must change identity too.
    await writeFile(path.join(root, "src/original.ts"), "export const value = 1;\n");
    const indexOnly = await readGitImpact(root);
    expect(indexOnly.changes.some(change => change.path === "src/original.ts")).toBe(true);
    await writeFile(path.join(root, "src/original.ts"), "export const value = 4;\n"); await git(["add", "src/original.ts"]);
    await writeFile(path.join(root, "src/original.ts"), "export const value = 1;\n");
    expect((await readGitImpact(root)).fingerprint).not.toBe(indexOnly.fingerprint);
    await writeFile(path.join(root, "src/untracked.ts"), "export const fresh = false;\n");
    expect((await readGitImpact(root)).fingerprint).not.toBe(first.fingerprint);
    const unavailable = await readGitImpact(root, "nonexistent-base");
    expect(unavailable.rangeProblem).toBeTruthy(); expect(unavailable.head).toBe(first.head); expect(unavailable.fingerprint).toBeTruthy();
    expect(await readFile(path.join(root, "src/original.ts"), "utf8")).toContain("value = 1");
  });
});
