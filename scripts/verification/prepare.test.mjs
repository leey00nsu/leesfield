// @vitest-environment node
import { afterEach, expect, test } from "vitest";
import { execFile, spawn } from "node:child_process";
import { copyFile, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execute = promisify(execFile), temporary = [];
const source = dirname(fileURLToPath(import.meta.url));
afterEach(async () => { await Promise.all(temporary.splice(0).map(root => rm(root, { recursive: true, force: true }))); });

async function fixture(mode = "success") {
  const root = await realpath(await mkdtemp(join(tmpdir(), "leesfield-verification-prepare-"))); temporary.push(root);
  await mkdir(join(root, "scripts"), { recursive: true });
  await mkdir(join(root, "bin"));
  for (const name of ["bootstrap.mjs", "prepare.mjs", "execution.mjs", "push-range.mjs", "post-merge.mjs", "environment.mjs"]) await copyFile(join(source, name), join(root, "scripts", name));
  await writeFile(join(root, "package.json"), JSON.stringify({ name: "fixture", private: true }));
  await writeFile(join(root, "pnpm-lock.yaml"), "lockfileVersion: '9.0'\n");
  await writeFile(join(root, "pnpm-workspace.yaml"), "packages: ['.']\n");
  await writeFile(join(root, "entry.mjs"), 'import { bootstrapVerification } from "./scripts/bootstrap.mjs"; await bootstrapVerification({root:process.cwd(),args:process.argv.slice(2)});');
  await writeFile(join(root, "scripts", "runner.mjs"), `
import { appendFile, readFile } from "node:fs/promises";
await readFile(process.cwd()+"/node_modules/@vitest/browser-playwright/package.json","utf8");
await appendFile("calls","runner-import\\n");
export async function runVerification(options) { await appendFile("calls","checks:"+options.identity.head+"\\n"); }
`);
  await writeFile(join(root, "bin", "pnpm"), `#!/usr/bin/env node
const fs=require("node:fs"), path=require("node:path");
if(process.argv[2]==="--version"){console.log("10.30.0");process.exit(0)}
fs.appendFileSync("calls","install:"+JSON.stringify(process.argv.slice(2))+"\\n");
if(process.env.FIXTURE_MODE==="failure"){console.error("private-registry-token");process.exit(7)}
if(process.env.FIXTURE_MODE==="hanging"){fs.writeFileSync("ready","yes");process.on("SIGTERM",()=>{fs.writeFileSync("child-stopped","yes");process.exit(143)});setInterval(()=>{},1000)}
else {
if(process.env.FIXTURE_MODE==="changed")fs.appendFileSync("pnpm-lock.yaml","# changed\\n");
if(process.env.FIXTURE_MODE!=="incomplete")for(const name of ["typescript","next","vitest","@vitest/browser-playwright","@playwright/test"]){
const dir=path.join("node_modules",name);fs.mkdirSync(dir,{recursive:true});
fs.writeFileSync(path.join(dir,"package.json"),JSON.stringify({name,version:"4.0.16",main:"index.js"}));fs.writeFileSync(path.join(dir,"index.js"),"");
}
}
`, { mode: 0o755 });
  await execute("git", ["init", "-b", "main"], { cwd: root });
  await execute("git", ["-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "commit", "--allow-empty", "-m", "fixture"], { cwd: root });
  const env = { ...process.env, PATH: join(root, "bin") + ":" + process.env.PATH, FIXTURE_MODE: mode };
  return { root, env };
}

async function run(value, args = []) {
  try { const result = await execute(process.execPath, ["entry.mjs", ...args], { cwd: value.root, env: value.env }); return { ...result, code: 0 }; }
  catch (error) { return { code: error.code, stdout: error.stdout, stderr: error.stderr }; }
}
const calls = root => readFile(join(root, "calls"), "utf8").catch(() => "");
const report = async root => JSON.parse(await readFile(join(root, ".next/verification/last-run.json"), "utf8"));

test("a checkout with missing browser dependencies installs before importing the runner", async () => {
  const value = await fixture();
  expect((await run(value)).code).toBe(0);
  const order = await calls(value.root);
  expect(order.indexOf("install:")).toBeLessThan(order.indexOf("runner-import"));
  expect(order.indexOf("runner-import")).toBeLessThan(order.indexOf("checks:"));
  const result = await report(value.root);
  expect(result.preparation).toMatchObject({ status: "passed", exitCode: 0, cwd: value.root, packages: { "@vitest/browser-playwright": "4.0.16" } });
  expect(result.preparation.args).toEqual(expect.arrayContaining(["--frozen-lockfile", "--prod=false"]));
});

test("install failure preserves the exit code and prevents every downstream import/check", async () => {
  const value = await fixture("failure");
  expect((await run(value)).code).toBe(1);
  const result = await report(value.root);
  expect(result).toMatchObject({ status: "failed", checks: [], preparation: { exitCode: 7, status: "failed" } });
  expect(await calls(value.root)).not.toMatch(/runner-import|checks:/);
  expect(JSON.stringify(result)).not.toContain("private-registry-token");
});

test.each(["incomplete", "changed"])("a superficially successful %s install cannot certify the checkout", async mode => {
  const value = await fixture(mode);
  expect((await run(value)).code).toBe(1);
  expect((await report(value.root)).preparation.status).toBe("failed");
  expect(await calls(value.root)).not.toContain("runner-import");
});

test("planning missing dependencies is explicit and does not install", async () => {
  const value = await fixture();
  const result = await run(value, ["--plan", "--json"]);
  expect(result.code).toBe(1);
  expect(result.stderr).toContain("DEPENDENCY_NOT_READY");
  expect(await calls(value.root)).toBe("");
});

test("a prepared checkout can plan without another install", async () => {
  const value = await fixture();
  expect((await run(value)).code).toBe(0);
  await writeFile(join(value.root, "calls"), "");
  expect((await run(value, ["--plan"])).code).toBe(0);
  expect(await calls(value.root)).not.toContain("install:");
});

test("invalid options fail before installation", async () => {
  const value = await fixture();
  expect((await run(value, ["--unknown"])).code).toBe(1);
  expect(await calls(value.root)).toBe("");
});

test("termination waits for the installer and records failure without importing checks", async () => {
  const value = await fixture("hanging");
  const child = spawn(process.execPath, ["entry.mjs"], { cwd: value.root, env: value.env, stdio: "ignore" });
  const completed = new Promise(resolve => child.once("close", (code, signal) => resolve({ code, signal })));
  await expect.poll(() => readFile(join(value.root, "ready"), "utf8").catch(() => "")).toBe("yes");
  child.kill("SIGTERM");
  expect(await completed).toEqual({ code: 143, signal: null });
  expect(await readFile(join(value.root, "child-stopped"), "utf8")).toBe("yes");
  expect((await report(value.root)).status).toBe("failed");
  expect(await calls(value.root)).not.toContain("runner-import");
});
