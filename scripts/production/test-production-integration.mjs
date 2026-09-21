import { execFile, spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const host = "127.0.0.1";
const suffix = randomUUID().slice(0, 12);
const containerName = `leesfield-pg-production-test-${process.pid}-${suffix}`;
const databaseName = `leesfield_ci_${suffix.replace(/-/g, "")}`;
const databaseUser = `leesfield_ci_${suffix.replace(/-/g, "")}`;
const databasePassword = `ci-${randomUUID()}`;
const postgresImage = process.env.PRODUCTION_TEST_POSTGRES_IMAGE ?? "postgres:16";
const processTimeoutMs = Number(process.env.PRODUCTION_TEST_TIMEOUT_MS ?? 20 * 60_000);

let containerStarted = false;
let activeChild = null;

function wait(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function docker(args) {
  return execFileAsync("docker", args, {
    cwd: process.cwd(),
    maxBuffer: 128 * 1024,
    timeout: 30_000,
  });
}

function publishedPort(output) {
  const match = output.match(/:(\d+)\s*$/m);
  const port = match ? Number(match[1]) : NaN;
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("Docker did not publish an isolated PostgreSQL port");
  }
  return port;
}

function validateProcessTimeout() {
  if (!Number.isInteger(processTimeoutMs) || processTimeoutMs < 60_000 || processTimeoutMs > 60 * 60_000) {
    throw new Error("PRODUCTION_TEST_TIMEOUT_MS must be an integer between 60000 and 3600000");
  }
}

async function waitForPort() {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    try {
      const result = await docker(["port", containerName, "5432/tcp"]);
      return publishedPort(result.stdout);
    } catch {
      await wait(250);
    }
  }
  throw new Error("isolated PostgreSQL port was not published within 30 seconds");
}

async function waitForPostgres() {
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    try {
      await docker([
        "exec",
        containerName,
        "pg_isready",
        "-U",
        databaseUser,
        "-d",
        databaseName,
      ]);
      return;
    } catch {
      await wait(500);
    }
  }
  throw new Error("isolated PostgreSQL did not become ready within 60 seconds");
}

function signalChild(child, signal) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  try {
    if (process.platform !== "win32" && child.pid) process.kill(-child.pid, signal);
    else child.kill(signal);
  } catch {
    // The child can exit between the state check and signal delivery.
  }
}

function runProcess(command, args, environment) {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd: process.cwd(),
      env: environment,
      stdio: "inherit",
      detached: process.platform !== "win32",
    });
    activeChild = child;
    let finished = false;
    const timeout = setTimeout(() => {
      console.error(`[production-integration] ${command} exceeded ${processTimeoutMs}ms`);
      signalChild(child, "SIGTERM");
      const forceKill = setTimeout(() => signalChild(child, "SIGKILL"), 5_000);
      forceKill.unref();
    }, processTimeoutMs);

    const finish = (code) => {
      if (finished) return;
      finished = true;
      clearTimeout(timeout);
      if (activeChild === child) activeChild = null;
      resolve(code);
    };

    child.once("error", () => finish(1));
    child.once("exit", (code, signal) => finish(code ?? (signal ? 1 : 0)));
  });
}

async function cleanup() {
  if (!containerStarted) return;
  containerStarted = false;
  try {
    await docker(["stop", "--timeout", "10", containerName]);
  } catch {
    // The container can already be gone after a Docker daemon failure.
  }
}

let terminationRequested = false;
async function terminate(signal) {
  if (terminationRequested) return;
  terminationRequested = true;
  signalChild(activeChild, signal);
  const forceKill = setTimeout(() => signalChild(activeChild, "SIGKILL"), 5_000);
  forceKill.unref();
  await cleanup();
  process.exitCode = signal === "SIGINT" ? 130 : 143;
}

process.on("SIGINT", () => void terminate("SIGINT"));
process.on("SIGTERM", () => void terminate("SIGTERM"));

async function main() {
  validateProcessTimeout();
  if (postgresImage !== "postgres:16" && process.env.PRODUCTION_TEST_ALLOW_CUSTOM_IMAGE !== "YES") {
    throw new Error("PRODUCTION_TEST_POSTGRES_IMAGE must be postgres:16 unless explicitly overridden");
  }

  await docker([
    "run",
    "--detach",
    "--rm",
    "--name",
    containerName,
    "--env",
    `POSTGRES_DB=${databaseName}`,
    "--env",
    `POSTGRES_USER=${databaseUser}`,
    "--env",
    `POSTGRES_PASSWORD=${databasePassword}`,
    "--tmpfs",
    "/var/lib/postgresql/data:rw,size=1g",
    "--publish",
    `${host}::5432`,
    postgresImage,
  ]);
  containerStarted = true;

  const port = await waitForPort();
  await waitForPostgres();

  const databaseUrl = `postgresql://${encodeURIComponent(databaseUser)}:${encodeURIComponent(databasePassword)}@${host}:${port}/${databaseName}`;
  const environment = {
    ...process.env,
    CI: "1",
    NODE_ENV: "test",
    PRODUCTION_INTEGRATION_TEST: "1",
    DATABASE_URL: databaseUrl,
    SESSION_PASSWORD: "production-integration-test-session-password",
  };

  const migrationCode = await runProcess("pnpm", ["db:migrate:deploy"], environment);
  if (migrationCode !== 0) return migrationCode;

  const indexCode = await runProcess("pnpm", ["db:indexes:history"], environment);
  if (indexCode !== 0) return indexCode;

  const vendorCode = await runProcess("pnpm", ["vendor:node-banana:prepare"], environment);
  if (vendorCode !== 0) return vendorCode;

  // PostgreSQL suites share global worker and queue tables by design. Keep the
  // disposable-database run serial so one suite cannot claim another suite's
  // short-lived fixture while Vitest executes files in parallel.
  return runProcess(
    "pnpm",
    ["exec", "vitest", "run", "--maxWorkers=1"],
    environment,
  );
}

let exitCode = 1;
try {
  exitCode = await main();
} catch (error) {
  const message = error instanceof Error ? error.message : "unknown setup failure";
  console.error(`[production-integration] ${message}`);
  exitCode = 1;
} finally {
  await cleanup();
}

if (!terminationRequested) process.exitCode = exitCode;
