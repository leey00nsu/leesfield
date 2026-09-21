import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { chmod, mkdir, rename, rm, stat } from "node:fs/promises";
import { basename, dirname, resolve } from "node:path";

const POSTGRES_PROTOCOLS = new Set(["postgres:", "postgresql:"]);
const SSL_MODES = new Set([
  "disable",
  "allow",
  "prefer",
  "require",
  "verify-ca",
  "verify-full",
]);

export class ProductionDbToolError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "ProductionDbToolError";
    this.code = code;
  }
}

function decode(value, label) {
  try {
    return decodeURIComponent(value);
  } catch {
    throw new ProductionDbToolError(
      "INVALID_DATABASE_URL",
      `${label} contains invalid URL encoding`,
    );
  }
}

export function parseDatabaseUrl(raw, label = "DATABASE_URL") {
  if (!raw?.trim()) {
    throw new ProductionDbToolError("DATABASE_URL_REQUIRED", `${label} is required`);
  }

  let parsed;
  try {
    parsed = new URL(raw);
  } catch {
    throw new ProductionDbToolError(
      "INVALID_DATABASE_URL",
      `${label} must be a valid PostgreSQL URL`,
    );
  }

  if (!POSTGRES_PROTOCOLS.has(parsed.protocol)) {
    throw new ProductionDbToolError(
      "INVALID_DATABASE_URL",
      `${label} must use postgres:// or postgresql://`,
    );
  }

  const host = parsed.hostname.replace(/^\[|\]$/g, "");
  const port = parsed.port ? Number(parsed.port) : 5432;
  const database = decode(parsed.pathname.replace(/^\//, ""), `${label} database`);
  const username = parsed.username ? decode(parsed.username, `${label} username`) : "";
  const password = parsed.password ? decode(parsed.password, `${label} password`) : "";
  const sslmode = parsed.searchParams.get("sslmode") ?? "";

  if (!host || !Number.isInteger(port) || port < 1 || port > 65535 || !database) {
    throw new ProductionDbToolError(
      "INVALID_DATABASE_URL",
      `${label} must include a host, valid port, and database`,
    );
  }
  if (sslmode && !SSL_MODES.has(sslmode)) {
    throw new ProductionDbToolError(
      "INVALID_DATABASE_URL",
      `${label} uses an unsupported sslmode`,
    );
  }

  return {
    host,
    port,
    database,
    username,
    password,
    sslmode: sslmode || null,
  };
}

export function databaseTargetKey(target) {
  return `${target.host.toLowerCase()}:${target.port}/${target.database}`;
}

export function databaseTargetSummary(target) {
  return {
    host: target.host,
    port: target.port,
    database: target.database,
    user: target.username || null,
    sslmode: target.sslmode,
  };
}

export function buildPgEnvironment(target, baseEnvironment = process.env) {
  const environment = { ...baseEnvironment };
  delete environment.DATABASE_URL;
  delete environment.PGSERVICE;
  environment.PGHOST = target.host;
  environment.PGPORT = String(target.port);
  if (target.username) environment.PGUSER = target.username;
  else delete environment.PGUSER;
  environment.PGDATABASE = target.database;
  if (target.password) environment.PGPASSWORD = target.password;
  else delete environment.PGPASSWORD;
  if (target.sslmode) environment.PGSSLMODE = target.sslmode;
  return environment;
}

export function safePath(raw, label) {
  if (!raw?.trim() || /[\0\r\n]/.test(raw)) {
    throw new ProductionDbToolError("INVALID_PATH", `${label} must be a valid local path`);
  }
  return resolve(raw);
}

export async function assertRegularFile(filePath, label) {
  let file;
  try {
    file = await stat(filePath);
  } catch {
    throw new ProductionDbToolError("BACKUP_NOT_FOUND", `${label} does not exist`);
  }
  if (!file.isFile() || file.size <= 0) {
    throw new ProductionDbToolError("BACKUP_INVALID", `${label} must be a non-empty regular file`);
  }
}

export async function prepareOutputPath(filePath, overwrite = false) {
  const outputPath = safePath(filePath, "backup output");
  await mkdir(dirname(outputPath), { recursive: true, mode: 0o700 });
  try {
    const existing = await stat(outputPath);
    if (!existing.isFile()) {
      throw new ProductionDbToolError(
        "BACKUP_OUTPUT_NOT_FILE",
        "backup output must be a regular file",
      );
    }
    if (!overwrite) {
      throw new ProductionDbToolError(
        "BACKUP_EXISTS",
        "backup output already exists; pass --force to replace it",
      );
    }
  } catch (error) {
    if (error instanceof ProductionDbToolError) throw error;
    if (error?.code !== "ENOENT") throw error;
  }
  return outputPath;
}

export function temporaryOutputPath(outputPath) {
  return `${dirname(outputPath)}/.${basename(outputPath)}.${process.pid}.${randomUUID()}.tmp`;
}

export async function finishOutput(tempPath, outputPath) {
  await assertRegularFile(tempPath, "temporary backup");
  await chmod(tempPath, 0o600);
  await rename(tempPath, outputPath);
  await chmod(outputPath, 0o600);
}

export async function removeIfPresent(filePath) {
  await rm(filePath, { force: true });
}

function toolLabel(command) {
  const value = basename(command).replace(/[^A-Za-z0-9_.-]/g, "");
  return value.slice(0, 32) || "postgres-client";
}

export function runPgTool(
  command,
  args,
  { environment = process.env, capture = false, timeoutMs = 30 * 60 * 1000 } = {},
) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, {
      env: environment,
      stdio: capture ? ["ignore", "pipe", "inherit"] : ["ignore", "inherit", "inherit"],
    });
    let stdout = "";
    let outputTooLarge = false;
    let timedOut = false;
    const timeoutId = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
    }, timeoutMs);
    if (capture && child.stdout) {
      child.stdout.setEncoding("utf8");
      child.stdout.on("data", (chunk) => {
        stdout += chunk;
        if (stdout.length > 64 * 1024 && !outputTooLarge) {
          outputTooLarge = true;
          child.kill("SIGTERM");
        }
      });
    }
    child.once("error", () => {
      clearTimeout(timeoutId);
      reject(
        new ProductionDbToolError(
          "POSTGRES_TOOL_UNAVAILABLE",
          `${toolLabel(command)} is unavailable; install the PostgreSQL client tools`,
        ),
      );
    });
    child.once("close", (code, signal) => {
      clearTimeout(timeoutId);
      if (timedOut) {
        reject(new ProductionDbToolError("POSTGRES_TOOL_TIMEOUT", `${toolLabel(command)} exceeded its time limit`));
        return;
      }
      if (outputTooLarge) {
        reject(new ProductionDbToolError("POSTGRES_OUTPUT_TOO_LARGE", "PostgreSQL output exceeded the safety limit"));
        return;
      }
      if (code !== 0) {
        reject(
          new ProductionDbToolError(
            "POSTGRES_TOOL_FAILED",
            `${toolLabel(command)} failed${signal ? ` (${signal})` : ""}`,
          ),
        );
        return;
      }
      resolvePromise(stdout);
    });
  });
}

export function displayPath(filePath) {
  return filePath.replace(/[\r\n]/g, "").slice(0, 256);
}
