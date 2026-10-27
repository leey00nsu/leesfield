// @vitest-environment node
import { afterEach, expect, test } from "vitest";
import { mkdtemp, mkdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseQuickArguments, quickScope, validateQuickFiles } from "./quick-plan.mjs";

const directories = [];
afterEach(async () => { await Promise.all(directories.splice(0).map(dir => rm(dir, { recursive: true, force: true }))); });

test("quick scope is advisory even for a small frontend change with related tests", () => {
  const scope = quickScope({ changes: [{ path: "src/features/node-studio/ui/nodes/space-node-text.tsx", status: "M" }] }, {});
  expect(scope).toMatchObject({ official: false, level: "quick", formalLevel: "related", selection: "related-unit-tests" });
});

test("uncertain imports, deleted runtime and missing Git baseline cannot narrow the unit scope", () => {
  const file = "src/shared/lib/renamed.ts";
  for (const impact of [{ changes: [{ path: file, status: "D" }] }, { changes: [], rangeProblem: "no baseline" }]) {
    expect(quickScope(impact, {})).toMatchObject({ fullVerificationRequired: true, selection: "all-unit-tests" });
  }
  expect(quickScope({ changes: [{ path: file, status: "M" }] }, {
    unresolvedImports: [{ importer: "src/features/node-studio/ui/nodes/space-node-text.tsx", candidates: [file] }],
  })).toMatchObject({ fullVerificationRequired: true, selection: "all-unit-tests" });
});

test("file selection rejects traversal, hidden files and symlinks outside the repository", async () => {
  const root = await mkdtemp(join(tmpdir(), "leesfield-quick-path-")); directories.push(root);
  const outside = await mkdtemp(join(tmpdir(), "leesfield-quick-outside-")); directories.push(outside);
  await mkdir(join(root, "src")); await writeFile(join(root, "src", "owned.ts"), "export {};");
  await writeFile(join(outside, "outside.ts"), "export {};");
  await symlink(join(outside, "outside.ts"), join(root, "src", "linked.ts"));
  expect(await validateQuickFiles(root, ["src/owned.ts", "src/owned.ts"])).toEqual(["src/owned.ts"]);
  for (const file of ["../outside.ts", "/tmp/outside.ts", ".env", "src/../owned.ts", "src/linked.ts", "src"]) {
    await expect(validateQuickFiles(root, [file])).rejects.toThrow();
  }
});

test("CLI options cannot inject test runner flags or silently request JSON execution", () => {
  expect(parseQuickArguments(["--since", "HEAD~1", "--plan", "--json", "src/a.ts"])).toEqual({
    files: ["src/a.ts"], since: "HEAD~1", planOnly: true, json: true,
  });
  for (const args of [["--since"], ["--since=--all"], ["--retry=9"], ["--json"]]) expect(() => parseQuickArguments(args)).toThrow();
});
