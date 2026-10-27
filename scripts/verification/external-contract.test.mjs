// @vitest-environment node
import { execFile } from "node:child_process";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterEach, expect, test } from "vitest";
import { externalContractDecision, readStorageDependencyImpact } from "./external-contract.mjs";
import { readImportGraph } from "./git-impact.mjs";

const exec = promisify(execFile), roots = [];
const change = path => ({ path, status: "M" });
const decide = (files, extra = {}) => externalContractDecision({ changes: files.map(change), ...extra });
afterEach(async () => { await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))); });

test("ordinary UI, unit harness and local fixture changes do not require live storage", () => {
  for (const file of ["src/features/node-studio/ui/nodes/space-node-text.tsx", "src/features/media-assets/ui/media-asset-card.tsx",
    "scripts/verification/run.mjs", "scripts/spaces/local-storage.mjs", "vitest.config.ts"]) {
    expect(decide([file]).required).toBe(false);
  }
  expect(decide([], { forceExternal: true }).required).toBe(true);
});

test("actual upload, read, delete, SDK and contract boundaries require live storage", () => {
  for (const file of ["src/server/shared/leemage-bounded-upload.ts", "src/server/image-generation/storage/adapters/leemage-storage-adapter.ts",
    "src/app/api/media-assets/uploads/[uploadId]/confirm/route.ts", "src/app/api/media-assets/[assetId]/content/route.ts",
    "src/server/job-queue/handlers/storage-cleanup-handler.ts", "scripts/spaces/e2e/storage-contract.spec.mjs",
    "scripts/spaces/run-e2e.mjs", "pnpm-lock.yaml"]) expect(decide([file]).required).toBe(true);
});

test("transitive and ambiguous storage dependencies cannot hide an external contract change", () => {
  const adapter = "src/server/media-assets/leemage-media-storage.ts", utility = "src/shared/lib/upload.ts";
  const reverseImports = new Map([[utility, new Set(["src/shared/lib/bridge.ts"])], ["src/shared/lib/bridge.ts", new Set([adapter])]]);
  expect(decide([utility], { reverseImports }).required).toBe(true);
  expect(decide(["src/shared/lib/missing.ts"], {
    reverseImports, unresolvedImports: [{ importer: adapter, candidates: ["src/shared/lib/missing.ts"] }],
  }).required).toBe(true);
  expect(decide([], { rangeProblem: "no Git baseline" }).required).toBe(true);
  expect(externalContractDecision({ changes: [{ path: "src/new.ts", oldPath: utility, status: "R100" }] }).required).toBe(true);
});

test("new SDK consumers outside the known storage folders are found from real imports", async () => {
  const root = await mkdtemp(join(tmpdir(), "leesfield-new-storage-")); roots.push(root);
  await mkdir(join(root, "src", "new-domain"), { recursive: true });
  await writeFile(join(root, "src", "new-domain", "adapter.ts"), "import { LeemageClient } from 'leemage-sdk'; export { LeemageClient };");
  const graph = await readImportGraph(root);
  expect(decide(["src/new-domain/adapter.ts"], graph).required).toBe(true);
});

test("scripts-only manifest edits are proven against the actual Git baseline; SDK edits and lock uncertainty remain required", async () => {
  const root = await mkdtemp(join(tmpdir(), "leesfield-external-impact-")); roots.push(root);
  const pkg = { name: "fixture", scripts: { test: "old" }, dependencies: { "leemage-sdk": "0.2.0" } };
  await writeFile(join(root, "package.json"), JSON.stringify(pkg));
  await exec("git", ["init", "-q"], { cwd: root });
  await exec("git", ["add", "package.json"], { cwd: root });
  await exec("git", ["-c", "user.name=Test", "-c", "user.email=test@example.invalid", "commit", "-qm", "fixture"], { cwd: root });
  const base = (await exec("git", ["rev-parse", "HEAD"], { cwd: root })).stdout.trim();
  pkg.scripts.test = "new"; await writeFile(join(root, "package.json"), JSON.stringify(pkg));
  const impact = { base, changes: [change("package.json")] };
  expect(await readStorageDependencyImpact(root, impact)).toMatchObject({ required: false });
  expect(decide(["package.json"], { dependencyImpact: await readStorageDependencyImpact(root, impact) }).required).toBe(false);
  pkg.dependencies["leemage-sdk"] = "0.3.0"; await writeFile(join(root, "package.json"), JSON.stringify(pkg));
  expect(await readStorageDependencyImpact(root, impact)).toMatchObject({ required: true });
  expect(await readStorageDependencyImpact(root, { base, changes: [change("pnpm-lock.yaml")] })).toMatchObject({ required: true });
  expect(await readStorageDependencyImpact(root, { ...impact, base: null })).toMatchObject({ required: true });
});
