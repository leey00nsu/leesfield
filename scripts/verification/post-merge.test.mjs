// @vitest-environment node
import { afterEach, expect, test } from "vitest";
import { execFile } from "node:child_process";
import { copyFile, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execute = promisify(execFile), roots = [], source = dirname(fileURLToPath(import.meta.url));
afterEach(async () => { await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))); });
async function git(root, args) { return (await execute("git", args, { cwd: root, encoding: "utf8" })).stdout.trim(); }
async function fixture(failure = "") {
  const root = await realpath(await mkdtemp(join(tmpdir(), "leesfield-post-merge-"))); roots.push(root);
  await mkdir(join(root, "scripts")); await mkdir(join(root, "bin")); await mkdir(join(root, ".next/verification"), { recursive: true });
  for (const name of ["bootstrap.mjs", "prepare.mjs", "execution.mjs", "post-merge.mjs", "environment.mjs", "push-range.mjs"]) await copyFile(join(source, name), join(root, "scripts", name));
  await writeFile(join(root, "entry.mjs"), 'import { bootstrapVerification } from "./scripts/bootstrap.mjs";await bootstrapVerification({root:process.cwd(),args:process.argv.slice(2)});');
  await writeFile(join(root, ".gitignore"), "node_modules/\n.next/\n");
  await writeFile(join(root, "package.json"), JSON.stringify({ name: "fixture" }));
  await writeFile(join(root, "pnpm-lock.yaml"), "lockfileVersion: '9.0'\n");
  await writeFile(join(root, "pnpm-workspace.yaml"), "packages: ['.']\n");
  await writeFile(join(root, ".next/verification/last-run.json"), '{"status":"original-feature-record"}');
  await writeFile(join(root, "bin/pnpm"), `#!/usr/bin/env node
const fs=require("node:fs"),path=require("node:path"),cp=require("node:child_process");
const action=process.argv[2];
if(action==="--version"){console.log("10.34.5");process.exit(0)}
fs.appendFileSync(".next/calls",action+"\\n");
if(process.env.FIXTURE_FAILURE===action)process.exit(action==="typecheck"?9:11);
if(action==="install")for(const name of ["typescript","next","vitest","@vitest/browser-playwright","@playwright/test"]){
const dir=path.join("node_modules",name);fs.mkdirSync(dir,{recursive:true});
fs.writeFileSync(path.join(dir,"package.json"),JSON.stringify({name,version:"4.0.16",main:"index.js"}));fs.writeFileSync(path.join(dir,"index.js"),"");
}
if(action==="build"&&process.env.FIXTURE_FAILURE==="source-change")cp.execFileSync("git",["commit","--allow-empty","-qm","concurrent commit"]);
`, { mode: 0o755 });
  await git(root, ["init", "-b", "main"]); await git(root, ["config", "user.name", "Fixture"]); await git(root, ["config", "user.email", "fixture@example.invalid"]);
  await git(root, ["add", "."]); await git(root, ["commit", "-qm", "fixture"]);
  return { root, env: { ...process.env, PATH: join(root, "bin") + ":" + process.env.PATH, FIXTURE_FAILURE: failure } };
}
async function run(value, args = ["--post-merge"]) {
  try { await execute(process.execPath, ["entry.mjs", ...args], { cwd: value.root, env: value.env }); return 0; }
  catch (error) { return error.code; }
}
const report = async root => JSON.parse(await readFile(join(root, ".next/verification/last-post-merge-run.json"), "utf8"));
const calls = root => readFile(join(root, ".next/calls"), "utf8").catch(() => "");

test("post-merge records real main identity and runs only prepared typecheck/build, preserving Feature evidence", async () => {
  const value = await fixture(), head = await git(value.root, ["rev-parse", "HEAD"]);
  expect(await run(value)).toBe(0);
  const result = await report(value.root);
  expect(result).toMatchObject({ status: "passed", context: "post-merge", cwd: value.root, identity: { head, branch: "main" }, preparation: { status: "passed" } });
  expect(result.checks.map(check => [check.id, check.exitCode])).toEqual([["typecheck", 0], ["build", 0]]);
  expect(await calls(value.root)).toBe("install\ntypecheck\nbuild\n");
  expect(JSON.parse(await readFile(join(value.root, ".next/verification/last-run.json"), "utf8"))).toEqual({ status: "original-feature-record" });
});

test.each(["install", "typecheck", "build"])("%s failure returns nonzero and never certifies main", async failed => {
  const value = await fixture(failed);
  expect(await run(value)).toBe(1);
  const result = await report(value.root);
  expect(result.status).toBe("failed");
  if (failed === "install") {
    expect(result.checks).toEqual([]); expect(await calls(value.root)).toBe("install\n");
  } else {
    expect(result.checks.at(-1)).toMatchObject({ id: failed, exitCode: failed === "typecheck" ? 9 : 11 });
    if (failed === "typecheck") expect(await calls(value.root)).not.toContain("build");
  }
});

test("a Feature branch cannot be mistaken for an actual main check", async () => {
  const value = await fixture();
  await git(value.root, ["checkout", "-b", "feat/wrong"]);
  expect(await run(value)).toBe(1);
  expect((await report(value.root)).errorCode).toBe("POST_MERGE_REQUIRES_MAIN");
  expect(await calls(value.root)).toBe("");
});

test("dirty main and conflicting options stop before preparation", async () => {
  const value = await fixture();
  await writeFile(join(value.root, "unexpected.ts"), "changed");
  expect(await run(value)).toBe(1);
  expect((await report(value.root)).errorCode).toBe("POST_MERGE_CHECKOUT_DIRTY");
  expect(await calls(value.root)).toBe("");
  expect(await run(value, ["--post-merge", "--full"])).toBe(1);
  expect((await report(value.root)).errorCode).toBe("VERIFICATION_CONTEXT_CONFLICT");
});

test("a concurrent commit prevents a successful report even when both commands exit zero", async () => {
  const value = await fixture("source-change");
  expect(await run(value)).toBe(1);
  expect((await report(value.root))).toMatchObject({ status: "failed", errorCode: "POST_MERGE_SOURCE_CHANGED" });
});
