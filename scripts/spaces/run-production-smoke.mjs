import { spawn, execFile } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { createWriteStream } from "node:fs";
import { mkdir, readFile } from "node:fs/promises";
import { createServer as httpServer, request } from "node:http";
import { createServer as httpsServer } from "node:https";
import { resolve } from "node:path";
import { promisify } from "node:util";
import { hashSync } from "bcryptjs";
import { createSpacesWorkspace } from "./isolated-workspace.mjs";
import { createRunMetrics } from "./run-metrics.mjs";
import { readGitImpact } from "../verification/git-impact.mjs";

const args = process.argv.slice(2);
if (args.some(arg => arg !== "--development") || args.length > 1) throw new Error("Only --development is supported for the matched comparison");
const mode = args.length ? "development" : "production";
const id = randomUUID().slice(0, 8), container = "leesfield-core-" + id;
const output = resolve(".next/core-smoke/" + id);
await mkdir(output, { recursive: true });
const metrics = createRunMetrics(output);
metrics.configure({ mode: "none", workers: 1, profile: mode + "-core", selected: [{ title: "Prompt and settings durable core", mode }] });
const exec = promisify(execFile), children = new Set();
const upgradedSockets = new Set();
const docker = args => exec("docker", args, { timeout: 30_000, maxBuffer: 128 * 1024 });
let workspace, proxy, containerStarted = false, stopping = false, cleanupPromise;
const log = createWriteStream(output + "/server.log");
function launch(binary, args, env, cwd, background = false) {
  if (stopping) throw new Error("Core smoke cancelled");
  const child = spawn(binary, args, { cwd, env, stdio: ["ignore", log, log], detached: process.platform !== "win32" });
  children.add(child);
  const done = new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("close", (code, signal) => {
      children.delete(child);
      if (code === 0) resolve(); else reject(new Error("Core subprocess failed: " + (signal ?? code)));
    });
  });
  if (background) { done.catch(() => {}); return child; }
  return done;
}
async function waitFor(check, label, timeout = 60_000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (stopping) throw new Error("Core smoke cancelled");
    try { if (await check()) return; } catch { /* Owned service is starting. */ }
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  throw new Error("Timed out waiting for " + label);
}
async function freePort() {
  const server = httpServer();
  await new Promise((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
  const port = server.address().port;
  await new Promise(resolve => server.close(resolve)); return port;
}
function kill(child, signal) {
  try { if (process.platform === "win32") child.kill(signal); else process.kill(-child.pid, signal); }
  catch (error) { if (error.code !== "ESRCH") throw error; }
}
function cleanup() {
  if (cleanupPromise) return cleanupPromise;
  stopping = true;
  cleanupPromise = (async () => {
    await Promise.all([...children].map(child => new Promise(resolve => {
      const timer = setTimeout(() => kill(child, "SIGKILL"), 5_000);
      child.once("close", () => { clearTimeout(timer); resolve(); }); kill(child, "SIGTERM");
    })));
    const results = await Promise.allSettled([
      proxy ? new Promise((resolve, reject) => {
        for (const socket of upgradedSockets) socket.destroy();
        proxy.close(error => error ? reject(error) : resolve()); proxy.closeAllConnections();
      }) : undefined,
      containerStarted ? docker(["rm", "--force", container]) : undefined,
      workspace?.cleanup(),
    ]);
    await new Promise(resolve => log.end(resolve));
    if (results.some(result => result.status === "rejected")) throw new Error("Core smoke cleanup failed");
  })(); return cleanupPromise;
}
for (const signal of ["SIGINT", "SIGTERM"]) process.once(signal, () => {
  process.exitCode = signal === "SIGINT" ? 130 : 143; stopping = true;
  // Let in-flight source/Docker setup finish before finally removes resources.
  // Starting cleanup concurrently could miss a just-created container.
  for (const child of children) {
    kill(child, "SIGTERM");
    const timer = setTimeout(() => kill(child, "SIGKILL"), 5_000);
    timer.unref(); child.once("close", () => clearTimeout(timer));
  }
});
try {
  const source = await readGitImpact(process.cwd());
  workspace = await metrics.phase("source-copy", () => createSpacesWorkspace(process.cwd(), { profile: mode === "development" ? "core-development" : "production", publicEnvironment: {} }));
  metrics.compilerCache(workspace.cache);
  if (stopping) throw new Error("Core smoke cancelled");
  const password = randomBytes(24).toString("hex"), database = "core_" + id;
  let dbPort;
  await metrics.phase("database-prepare", async () => {
    await docker(["run", "--detach", "--rm", "--name", container, "--env", "POSTGRES_DB=" + database, "--env", "POSTGRES_USER=" + database,
      "--env", "POSTGRES_PASSWORD=" + password, "--tmpfs", "/var/lib/postgresql/data:rw,size=1g", "--publish", "127.0.0.1::5432", "postgres:16"]);
    containerStarted = true;
    await waitFor(async () => { dbPort = Number((await docker(["port", container, "5432/tcp"])).stdout.match(/:(\d+)\s*$/m)?.[1]); return dbPort; }, "PostgreSQL port");
    await waitFor(async () => (await docker(["exec", container, "pg_isready", "-U", database])).stdout.includes("accepting"), "PostgreSQL");
  });
  const appPort = await freePort();
  const keyFile = workspace.directory + "/test.key", certFile = workspace.directory + "/test.crt";
  await exec("openssl", ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-keyout", keyFile, "-out", certFile, "-days", "1", "-subj", "/CN=localhost"], { timeout: 30_000 });
  proxy = httpsServer({ key: await readFile(keyFile), cert: await readFile(certFile) }, (incoming, outgoing) => {
    const upstream = request({ hostname: "127.0.0.1", port: appPort, path: incoming.url, method: incoming.method,
      headers: { ...incoming.headers, "x-forwarded-proto": "https", "x-forwarded-host": incoming.headers.host } }, response => {
      outgoing.writeHead(response.statusCode, response.headers); response.pipe(outgoing);
    });
    upstream.on("error", () => { outgoing.writeHead(502); outgoing.end(); }); incoming.pipe(upstream);
    outgoing.on("close", () => upstream.destroy());
  });
  // Turbopack's initial hydration waits for its HMR handshake. Forward that
  // native connection in the matched dev run instead of suppressing HMR.
  proxy.on("upgrade", (incoming, socket, head) => {
    upgradedSockets.add(socket); socket.once("close", () => upgradedSockets.delete(socket));
    const upstream = request({ hostname: "127.0.0.1", port: appPort, path: incoming.url,
      headers: { ...incoming.headers, "x-forwarded-proto": "https", "x-forwarded-host": incoming.headers.host } });
    upstream.once("upgrade", (response, target, targetHead) => {
      upgradedSockets.add(target); target.once("close", () => upgradedSockets.delete(target));
      socket.write("HTTP/1.1 101 Switching Protocols\r\n" + Object.entries(response.headers).map(([key, value]) => key + ": " + value).join("\r\n") + "\r\n\r\n");
      if (targetHead.length) socket.write(targetHead);
      if (head.length) target.write(head);
      target.pipe(socket); socket.pipe(target);
      target.on("error", () => socket.destroy()); socket.on("error", () => target.destroy());
      socket.once("close", () => target.destroy());
    });
    upstream.once("response", () => socket.destroy()); upstream.once("error", () => socket.destroy()); upstream.end();
  });
  await new Promise((resolve, reject) => { proxy.once("error", reject); proxy.listen(0, "localhost", resolve); });
  const base = "https://localhost:" + proxy.address().port;
  // Allow-list inherited OS settings; no developer DB, provider credentials,
  // NODE_OPTIONS, .env file or mock/local transport flags enter this server.
  const env = Object.fromEntries(["PATH", "HOME", "TMPDIR", "TEMP", "SystemRoot", "LANG"].filter(key => process.env[key]).map(key => [key, process.env[key]]));
  Object.assign(env, { CI: "1", NEXT_TELEMETRY_DISABLED: "1", NODE_ENV: mode,
    DATABASE_URL: "postgresql://" + database + ":" + password + "@127.0.0.1:" + dbPort + "/" + database,
    SESSION_PASSWORD: randomBytes(40).toString("hex"), ADMIN_EMAIL: "core-admin@localhost",
    ADMIN_PASSWORD_HASH: Buffer.from(hashSync(randomBytes(32).toString("hex"), 4)).toString("base64url"),
    DEV_AUTH_BYPASS: "false", APP_ORIGIN: base, TRUST_PROXY_HEADERS: "true", TRUSTED_PROXY_HOPS: "1",
    SPACES_E2E_MODULE_ROOT: workspace.moduleRoot, SPACES_E2E_ISOLATED: "1",
    SPACES_E2E_OUTPUT_DIR: output, SPACES_BASE_URL: base, SPACES_CORE_MODE: mode,
  });
  await metrics.phase("prisma-generate", () => launch(process.execPath, ["node_modules/prisma/build/index.js", "generate"], env, workspace.directory));
  await metrics.phase("database-migrate", () => launch(process.execPath, ["node_modules/prisma/build/index.js", "migrate", "deploy"], env, workspace.directory));
  if (mode === "production") await metrics.phase("production-build", () => launch(process.execPath, ["node_modules/next/dist/bin/next", "build"], env, workspace.directory));
  const server = launch(process.execPath, ["node_modules/next/dist/bin/next", mode === "production" ? "start" : "dev", "--hostname", "127.0.0.1", "--port", String(appPort)], env, workspace.directory, true);
  await metrics.phase("api-ready", () => waitFor(async () => {
    return server.exitCode === null && (await fetch("http://127.0.0.1:" + appPort + "/api/health/live", { signal: AbortSignal.timeout(2_000) })).ok;
  }, "owned Next server"));
  await metrics.phase("browser", () => launch(process.execPath, ["node_modules/@playwright/test/cli.js", "test", "--config=playwright.production.config.mjs"], env, process.cwd()));
  const current = await readGitImpact(process.cwd());
  if (!source.fingerprint || current.fingerprint !== source.fingerprint || current.head !== source.head) throw new Error("Source changed during core smoke; run again");
} catch (error) {
  process.stderr.write(error.message + "; diagnostics: " + output + "\n"); process.exitCode ||= 1;
} finally {
  try { await metrics.phase("cleanup", cleanup); } catch (error) { process.stderr.write(error.message + "\n"); process.exitCode = 1; }
  await metrics.finish(!process.exitCode);
}
