/**
 * Validates the environment the server actually runs with.
 *
 * The prestart script only inspects a local .env file, so it cannot catch a
 * container that was started without required values or with the published
 * example placeholders. Server entry points funnel through getServerEnv(), so a
 * misconfigured process fails fast with the offending keys and without printing
 * secret values.
 */

export type ServerDbBudget = {
  poolMax: number;
  acquireTimeoutMs: number;
  idleTimeoutMs: number;
  statementTimeoutMs: number;
  lockTimeoutMs: number;
  transactionTimeoutMs: number;
  listenerConnectTimeoutMs: number;
};

export type ServerEnv = {
  isProduction: boolean;
  databaseUrl: string;
  sessionPassword: string;
  adminEmail: string | null;
  adminPasswordHash: string | null;
  appOrigin: string | null;
  trustProxyHeaders: boolean;
  trustedProxyHops: number;
  db: ServerDbBudget;
};

type Limit = { name: string; min: number; max: number; defaultValue: number };

const SERVER_DB_LIMITS: Record<keyof ServerDbBudget, Limit> = {
  poolMax: { name: "DB_POOL_MAX", min: 1, max: 50, defaultValue: 10 },
  acquireTimeoutMs: {
    name: "DB_ACQUIRE_TIMEOUT_MS",
    min: 100,
    max: 60_000,
    defaultValue: 2_000,
  },
  idleTimeoutMs: {
    name: "DB_IDLE_TIMEOUT_MS",
    min: 1_000,
    max: 600_000,
    defaultValue: 30_000,
  },
  statementTimeoutMs: {
    name: "DB_STATEMENT_TIMEOUT_MS",
    min: 1_000,
    max: 300_000,
    defaultValue: 10_000,
  },
  lockTimeoutMs: {
    name: "DB_LOCK_TIMEOUT_MS",
    min: 100,
    max: 60_000,
    defaultValue: 2_000,
  },
  transactionTimeoutMs: {
    name: "DB_TRANSACTION_TIMEOUT_MS",
    min: 1_000,
    max: 300_000,
    defaultValue: 5_000,
  },
  listenerConnectTimeoutMs: {
    name: "PG_LISTENER_CONNECT_TIMEOUT_MS",
    min: 500,
    max: 60_000,
    defaultValue: 2_000,
  },
};

const EXAMPLE_SESSION_PASSWORD_FRAGMENT = "change-me";
const EXAMPLE_DATABASE_CREDENTIAL = "leesfield";
const EXAMPLE_EMAIL_DOMAIN = "@example.com";

export class ServerEnvError extends Error {
  readonly problems: string[];

  constructor(problems: string[]) {
    super("Invalid server environment: " + problems.join(" | "));
    this.name = "ServerEnvError";
    this.problems = problems;
  }
}

function readBoundedInt(
  env: NodeJS.ProcessEnv,
  limit: Limit,
  problems: string[],
): number {
  const raw = env[limit.name];
  const trimmed = typeof raw === "string" ? raw.trim() : "";
  if (trimmed === "") return limit.defaultValue;
  if (!/^[0-9]+$/.test(trimmed)) {
    problems.push(
      limit.name +
        " must be an integer between " +
        limit.min +
        " and " +
        limit.max,
    );
    return limit.defaultValue;
  }
  const value = Number(trimmed);
  if (value < limit.min || value > limit.max) {
    problems.push(
      limit.name +
        " must be between " +
        limit.min +
        " and " +
        limit.max,
    );
    return limit.defaultValue;
  }
  return value;
}

function readDatabaseUrl(
  env: NodeJS.ProcessEnv,
  isProduction: boolean,
  problems: string[],
): string {
  const raw = env.DATABASE_URL?.trim() ?? "";
  if (!raw) {
    problems.push("DATABASE_URL is required");
    return "";
  }

  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    problems.push("DATABASE_URL must be a valid postgres connection URL");
    return raw;
  }

  if (parsed.protocol !== "postgres:" && parsed.protocol !== "postgresql:") {
    problems.push("DATABASE_URL must use the postgres or postgresql protocol");
  }

  if (
    isProduction &&
    decodeURIComponent(parsed.username) === EXAMPLE_DATABASE_CREDENTIAL &&
    decodeURIComponent(parsed.password) === EXAMPLE_DATABASE_CREDENTIAL
  ) {
    problems.push(
      "DATABASE_URL still uses the .env.example credentials; set production database credentials",
    );
  }

  return raw;
}

function readSessionPassword(
  env: NodeJS.ProcessEnv,
  isProduction: boolean,
  problems: string[],
): string {
  const raw = env.SESSION_PASSWORD ?? "";
  if (!raw) {
    problems.push("SESSION_PASSWORD is required");
    return "";
  }
  if (raw.length < 32) {
    problems.push("SESSION_PASSWORD must be at least 32 characters");
  }
  if (
    isProduction &&
    raw.toLowerCase().includes(EXAMPLE_SESSION_PASSWORD_FRAGMENT)
  ) {
    problems.push(
      "SESSION_PASSWORD still contains the .env.example placeholder text",
    );
  }
  return raw;
}

function readProxyTrust(
  env: NodeJS.ProcessEnv,
  problems: string[],
): { trustProxyHeaders: boolean; trustedProxyHops: number } {
  const raw = (env.TRUST_PROXY_HEADERS ?? "").trim().toLowerCase();
  const trustProxyHeaders = raw === "true";
  if (raw && raw !== "true" && raw !== "false") {
    problems.push("TRUST_PROXY_HEADERS must be true or false");
  }

  const hopsRaw = (env.TRUSTED_PROXY_HOPS ?? "").trim();
  let trustedProxyHops = 1;
  if (hopsRaw) {
    if (!/^[0-9]+$/.test(hopsRaw) || Number(hopsRaw) < 1 || Number(hopsRaw) > 5) {
      problems.push("TRUSTED_PROXY_HOPS must be an integer between 1 and 5");
    } else {
      trustedProxyHops = Number(hopsRaw);
    }
  }

  return { trustProxyHeaders, trustedProxyHops };
}

function readAppOrigin(
  env: NodeJS.ProcessEnv,
  isProduction: boolean,
  problems: string[],
): string | null {
  const raw = (env.APP_ORIGIN ?? "").trim();
  if (!raw) {
    if (isProduction) {
      problems.push(
        "APP_ORIGIN is required in production so session mutations can be checked against a known origin",
      );
    }
    return null;
  }
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    problems.push("APP_ORIGIN must be an absolute origin such as https://studio.example.com");
    return null;
  }
  if (parsed.pathname !== "/" || parsed.search || parsed.hash) {
    problems.push("APP_ORIGIN must not include a path, query, or fragment");
  }
  if (parsed.username || parsed.password) {
    problems.push("APP_ORIGIN must not include credentials");
  }
  if (isProduction && parsed.protocol !== "https:") {
    problems.push("APP_ORIGIN must use https in production");
  }
  return parsed.origin;
}

function readAdminSettings(
  env: NodeJS.ProcessEnv,
  isProduction: boolean,
  problems: string[],
): { adminEmail: string | null; adminPasswordHash: string | null } {
  const adminEmail = env.ADMIN_EMAIL?.trim() ?? "";
  const adminPasswordHash = env.ADMIN_PASSWORD_HASH?.trim() ?? "";

  if (!isProduction) {
    return {
      adminEmail: adminEmail || null,
      adminPasswordHash: adminPasswordHash || null,
    };
  }

  if (!adminEmail) {
    problems.push("ADMIN_EMAIL is required");
  } else {
    if (!/^[^\s@]+@[^\s@]+$/.test(adminEmail)) {
      problems.push("ADMIN_EMAIL must be an email address");
    }
    if (adminEmail.toLowerCase().endsWith(EXAMPLE_EMAIL_DOMAIN)) {
      problems.push("ADMIN_EMAIL still uses the .env.example domain");
    }
  }

  if (!adminPasswordHash) {
    problems.push(
      "ADMIN_PASSWORD_HASH is required; generate one with pnpm gen:admin-password-hash",
    );
  } else {
    const decoded = Buffer.from(adminPasswordHash, "base64url").toString(
      "utf8",
    );
    if (!decoded.startsWith("$2")) {
      problems.push(
        "ADMIN_PASSWORD_HASH must be a base64url encoded bcrypt hash",
      );
    }
  }

  if (env.DEV_AUTH_BYPASS?.trim() === "true") {
    problems.push(
      "DEV_AUTH_BYPASS must not be enabled in production; the local bypass is development-only",
    );
  }

  return {
    adminEmail: adminEmail || null,
    adminPasswordHash: adminPasswordHash || null,
  };
}

function resolveIsProduction(env: NodeJS.ProcessEnv): boolean {
  if (env.NODE_ENV !== "production") return false;
  // next build also sets NODE_ENV=production, but it is not a serving process.
  return env.NEXT_PHASE !== "phase-production-build";
}

export function readServerEnv(env: NodeJS.ProcessEnv = process.env): ServerEnv {
  const isProduction = resolveIsProduction(env);
  const problems: string[] = [];

  const databaseUrl = readDatabaseUrl(env, isProduction, problems);
  const sessionPassword = readSessionPassword(env, isProduction, problems);
  const { adminEmail, adminPasswordHash } = readAdminSettings(
    env,
    isProduction,
    problems,
  );
  const appOrigin = readAppOrigin(env, isProduction, problems);
  const { trustProxyHeaders, trustedProxyHops } = readProxyTrust(env, problems);

  const db = {
    poolMax: readBoundedInt(env, SERVER_DB_LIMITS.poolMax, problems),
    acquireTimeoutMs: readBoundedInt(
      env,
      SERVER_DB_LIMITS.acquireTimeoutMs,
      problems,
    ),
    idleTimeoutMs: readBoundedInt(
      env,
      SERVER_DB_LIMITS.idleTimeoutMs,
      problems,
    ),
    statementTimeoutMs: readBoundedInt(
      env,
      SERVER_DB_LIMITS.statementTimeoutMs,
      problems,
    ),
    lockTimeoutMs: readBoundedInt(
      env,
      SERVER_DB_LIMITS.lockTimeoutMs,
      problems,
    ),
    transactionTimeoutMs: readBoundedInt(
      env,
      SERVER_DB_LIMITS.transactionTimeoutMs,
      problems,
    ),
    listenerConnectTimeoutMs: readBoundedInt(
      env,
      SERVER_DB_LIMITS.listenerConnectTimeoutMs,
      problems,
    ),
  } satisfies ServerDbBudget;

  // An interactive transaction that cannot wait for a connection always fails.
  if (db.transactionTimeoutMs < db.acquireTimeoutMs) {
    problems.push(
      "DB_TRANSACTION_TIMEOUT_MS must be at least DB_ACQUIRE_TIMEOUT_MS",
    );
  }

  if (problems.length > 0) throw new ServerEnvError(problems);

  return {
    isProduction,
    databaseUrl,
    sessionPassword,
    adminEmail,
    adminPasswordHash,
    appOrigin,
    trustProxyHeaders,
    trustedProxyHops,
    db,
  };
}

let cachedServerEnv: ServerEnv | null = null;

export function getServerEnv(): ServerEnv {
  cachedServerEnv ??= readServerEnv();
  return cachedServerEnv;
}

export function resetServerEnvCache(): void {
  cachedServerEnv = null;
}
