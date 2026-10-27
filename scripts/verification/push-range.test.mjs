// @vitest-environment node
import { afterEach, expect, test } from "vitest";
import { execFile, spawn } from "node:child_process";
import { copyFile, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { parsePushInput, resolvePushRange } from "./push-range.mjs";
import { readGitImpact, readPushImpact } from "./git-impact.mjs";
import { createVerificationPlan } from "./policy.mjs";
import { readStorageDependencyImpact } from "./external-contract.mjs";

const execute = promisify(execFile), directories = [], zero = "0".repeat(40);
const source = dirname(fileURLToPath(import.meta.url));
afterEach(async () => { await Promise.all(directories.splice(0).map(root => rm(root, { recursive: true, force: true }))); });
const git = async (root, ...args) => (await execute("git", args, { cwd: root, encoding: "utf8" })).stdout.trim();

async function fixture() {
  const root = await realpath(await mkdtemp(join(tmpdir(), "leesfield-push-range-"))); directories.push(root);
  await git(root, "init", "-b", "main");
  await git(root, "config", "user.name", "Fixture"); await git(root, "config", "user.email", "fixture@example.invalid");
  await mkdir(join(root, "src/features/node-studio"), { recursive: true });
  await writeFile(join(root, "src/features/node-studio/space-node-text.tsx"), "export const value = 0;\n");
  await writeFile(join(root, "package.json"), JSON.stringify({ name: "fixture", scripts: { test: "old" }, dependencies: { "leemage-sdk": "0.2.0" } }));
  await git(root, "add", "."); await git(root, "commit", "-qm", "base");
  const base = await git(root, "rev-parse", "HEAD");
  await writeFile(join(root, "src/features/node-studio/space-node-text.tsx"), "export const value = 1;\n");
  await git(root, "add", "."); await git(root, "commit", "-qm", "change");
  return { root, base, head: await git(root, "rev-parse", "HEAD") };
}
const input = ({ head, base }) => `refs/heads/main ${head} refs/heads/main ${base}\n`;

test("clean main uses remote-to-local commits although main-to-main is empty", async () => {
  const value = await fixture();
  expect((await readGitImpact(value.root)).changes).toEqual([]);
  const range = await resolvePushRange(value.root, input(value));
  const impact = await readPushImpact(value.root, range);
  expect(impact.changes).toEqual([{ status: "M", path: "src/features/node-studio/space-node-text.tsx" }]);
  const plan = createVerificationPlan(impact);
  expect(plan.level).toBe("related");
  expect(plan.browserTier).toBe("core");
  expect(plan.checks.find(check => check.id === "spaces-e2e").args).toEqual(["e2e:spaces:core"]);
  expect(plan.external.required).toBe(false);
});

test.each([zero, "f".repeat(40)])("new/unavailable remote object %s selects conservative full checks", async remote => {
  const value = await fixture();
  const impact = await readPushImpact(value.root, await resolvePushRange(value.root, input({ ...value, base: remote })));
  const plan = createVerificationPlan(impact);
  expect(plan.browserTier).toBe("all");
  expect(plan.level).toBe("full");
  expect(plan.external.required).toBe(true);
});

test("multiple refs combine their actual bases and change paths", async () => {
  const value = await fixture(), previous = value.head;
  await writeFile(join(value.root, "src/second.ts"), "export const second=2;");
  await git(value.root, "add", "."); await git(value.root, "commit", "-qm", "second");
  value.head = await git(value.root, "rev-parse", "HEAD");
  const payload = input(value) + `refs/heads/main ${value.head} refs/heads/other ${previous}\n`;
  const impact = await readPushImpact(value.root, await resolvePushRange(value.root, payload));
  expect(impact.bases.sort()).toEqual([value.base, previous].sort());
  expect(impact.changes.map(change => change.path).sort()).toEqual(["src/features/node-studio/space-node-text.tsx", "src/second.ts"]);
});

test("uncommitted sources and a different pushed commit are rejected", async () => {
  const value = await fixture();
  await expect(resolvePushRange(value.root, input({ ...value, head: value.base }))).rejects.toThrow("PUSH_COMMIT_NOT_CHECKED_OUT");
  await writeFile(join(value.root, "untracked.ts"), "changed");
  await expect(resolvePushRange(value.root, input(value))).rejects.toThrow("PUSH_CHECKOUT_DIRTY");
});

test("the final fingerprint cannot certify a source changed during verification", async () => {
  const value = await fixture(), range = await resolvePushRange(value.root, input(value));
  await writeFile(join(value.root, "src/new.ts"), "new");
  await git(value.root, "add", "."); await git(value.root, "commit", "-qm", "moved head");
  await expect(readPushImpact(value.root, range)).rejects.toThrow();
});

test("annotated tag objects are peeled to the checked-out commit", async () => {
  const value = await fixture();
  await git(value.root, "tag", "-a", "release-fixture", "-m", "fixture");
  const oid = await git(value.root, "rev-parse", "refs/tags/release-fixture");
  const range = await resolvePushRange(value.root, `refs/tags/release-fixture ${oid} refs/tags/release-fixture ${value.base}\n`);
  expect(range.head).toBe(value.head);
});

test("deletion-only input differs from malformed/empty input", async () => {
  const value = await fixture();
  expect(await resolvePushRange(value.root, `(delete) ${zero} refs/heads/old ${value.base}\n`)).toMatchObject({ deletionOnly: true });
  for (const invalid of ["", "main x main y", `refs/heads/main ${value.head} refs/heads/bad..name ${value.base}`]) {
    await expect(resolvePushRange(value.root, invalid)).rejects.toThrow("PUSH_INPUT_INVALID");
  }
  expect(() => parsePushInput("x")).toThrow();
});

test("SDK dependency comparison checks every remote baseline", async () => {
  const value = await fixture(), previous = JSON.parse(await readFile(join(value.root, "package.json"), "utf8"));
  previous.dependencies["leemage-sdk"] = "0.3.0";
  await writeFile(join(value.root, "package.json"), JSON.stringify(previous));
  await git(value.root, "add", "."); await git(value.root, "commit", "-qm", "sdk");
  const newer = await git(value.root, "rev-parse", "HEAD");
  previous.scripts.test = "new"; await writeFile(join(value.root, "package.json"), JSON.stringify(previous));
  await git(value.root, "add", "."); await git(value.root, "commit", "-qm", "scripts");
  const changes = [{ status: "M", path: "package.json" }];
  expect(await readStorageDependencyImpact(value.root, { base: newer, changes })).toMatchObject({ required: false });
  expect(await readStorageDependencyImpact(value.root, { bases: [newer, value.base], changes })).toMatchObject({ required: true });
});

test("the actual hook passes every stdin ref through pnpm to its node entrypoint without pushing", async () => {
  const value = await fixture();
  await mkdir(join(value.root, ".husky/_"), { recursive: true });
  await copyFile(join(source, "../../.husky/pre-push"), join(value.root, ".husky/pre-push"));
  await writeFile(join(value.root, ".husky/_/husky.sh"), "# fixture hook initialization\n");
  await writeFile(join(value.root, "package.json"), JSON.stringify({ scripts: { "verify:push": "node record.mjs" } }));
  await writeFile(join(value.root, "record.mjs"), 'import { writeFile } from "node:fs/promises";let input="";for await(const chunk of process.stdin)input+=chunk;await writeFile("received",input);');
  const child = spawn("sh", [".husky/pre-push"], { cwd: value.root, stdio: ["pipe", "ignore", "pipe"] });
  const completed = new Promise((resolve, reject) => { child.once("error", reject); child.once("close", code => resolve(code)); });
  const payload = input(value) + `refs/heads/main ${value.head} refs/heads/other ${value.base}\n`;
  child.stdin.end(payload);
  expect(await completed).toBe(0);
  expect(await readFile(join(value.root, "received"), "utf8")).toBe(payload);
});
