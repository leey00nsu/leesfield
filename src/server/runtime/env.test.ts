import { describe, expect, it } from "vitest";

import { readServerEnv, ServerEnvError } from "./env";

const REAL_DATABASE_URL =
  "postgresql://lees_app:strong-password@db.internal:5432/leesfield?schema=public";
const REAL_SESSION_PASSWORD = "a".repeat(48);
const REAL_ADMIN_HASH = Buffer.from(
  "$2b$12$abcdefghijklmnopqrstuvwxyz012345678901234567890123456789",
  "utf8",
).toString("base64url");

function productionEnv(
  overrides: Record<string, string> = {},
): NodeJS.ProcessEnv {
  return {
    NODE_ENV: "production",
    DATABASE_URL: REAL_DATABASE_URL,
    SESSION_PASSWORD: REAL_SESSION_PASSWORD,
    ADMIN_EMAIL: "owner@leesfield.dev",
    ADMIN_PASSWORD_HASH: REAL_ADMIN_HASH,
    APP_ORIGIN: "https://studio.leesfield.dev",
    ...overrides,
  };
}

function problemsOf(env: NodeJS.ProcessEnv): string[] {
  try {
    readServerEnv(env);
  } catch (error) {
    if (error instanceof ServerEnvError) return error.problems;
    throw error;
  }
  throw new Error("expected a ServerEnvError");
}

describe("readServerEnv", () => {
  it("applies documented defaults outside production", () => {
    const env = readServerEnv({
      NODE_ENV: "development",
      DATABASE_URL: "postgresql://localhost:5432/leesfield",
      SESSION_PASSWORD: "b".repeat(32),
    });

    expect(env.isProduction).toBe(false);
    expect(env.db).toEqual({
      poolMax: 10,
      acquireTimeoutMs: 2000,
      idleTimeoutMs: 30000,
      statementTimeoutMs: 10000,
      lockTimeoutMs: 2000,
      transactionTimeoutMs: 5000,
      listenerConnectTimeoutMs: 2000,
    });
  });

  it("accepts a valid production environment", () => {
    const env = readServerEnv(productionEnv());
    expect(env.isProduction).toBe(true);
    expect(env.adminEmail).toBe("owner@leesfield.dev");
  });

  it("does not treat the production build phase as a serving process", () => {
    const env = readServerEnv(
      productionEnv({ NEXT_PHASE: "phase-production-build" }),
    );
    expect(env.isProduction).toBe(false);
  });

  it("requires DATABASE_URL and a long session password", () => {
    const problems = problemsOf({ NODE_ENV: "development" });
    expect(problems).toContain("DATABASE_URL is required");
    expect(problems).toContain("SESSION_PASSWORD is required");

    expect(
      problemsOf({
        NODE_ENV: "development",
        DATABASE_URL: "postgresql://localhost:5432/leesfield",
        SESSION_PASSWORD: "short",
      }),
    ).toContain("SESSION_PASSWORD must be at least 32 characters");
  });

  it("rejects published example values in production", () => {
    const problems = problemsOf(
      productionEnv({
        SESSION_PASSWORD: "change-me-change-me-change-me-change-me",
        ADMIN_EMAIL: "admin@example.com",
        ADMIN_PASSWORD_HASH: "",
        DATABASE_URL:
          "postgresql://leesfield:leesfield@localhost:5432/leesfield?schema=public",
        DEV_AUTH_BYPASS: "true",
      }),
    );

    expect(problems).toEqual(
      expect.arrayContaining([
        "SESSION_PASSWORD still contains the .env.example placeholder text",
        "ADMIN_EMAIL still uses the .env.example domain",
        "DATABASE_URL still uses the .env.example credentials; set production database credentials",
        "DEV_AUTH_BYPASS must not be enabled in production; the local bypass is development-only",
      ]),
    );
    expect(
      problems.some((problem) => problem.includes("ADMIN_PASSWORD_HASH")),
    ).toBe(true);
  });

  it("validates proxy trust settings", () => {
    const trusted = readServerEnv(
      productionEnv({ TRUST_PROXY_HEADERS: "true", TRUSTED_PROXY_HOPS: "2" }),
    );
    expect(trusted.trustProxyHeaders).toBe(true);
    expect(trusted.trustedProxyHops).toBe(2);

    const defaults = readServerEnv({
      NODE_ENV: "development",
      DATABASE_URL: "postgresql://localhost:5432/x",
      SESSION_PASSWORD: "d".repeat(40),
    });
    expect(defaults.trustProxyHeaders).toBe(false);
    expect(defaults.trustedProxyHops).toBe(1);

    expect(problemsOf(productionEnv({ TRUST_PROXY_HEADERS: "yes" }))).toContain(
      "TRUST_PROXY_HEADERS must be true or false",
    );
    expect(problemsOf(productionEnv({ TRUSTED_PROXY_HOPS: "9" }))).toContain(
      "TRUSTED_PROXY_HOPS must be an integer between 1 and 5",
    );
  });

  it("validates the configured application origin", () => {
    expect(readServerEnv(productionEnv()).appOrigin).toBe(
      "https://studio.leesfield.dev",
    );

    expect(problemsOf(productionEnv({ APP_ORIGIN: "" }))).toContain(
      "APP_ORIGIN is required in production so session mutations can be checked against a known origin",
    );
    expect(
      problemsOf(productionEnv({ APP_ORIGIN: "http://studio.leesfield.dev" })),
    ).toContain("APP_ORIGIN must use https in production");
    expect(
      problemsOf(productionEnv({ APP_ORIGIN: "https://studio.leesfield.dev/app" })),
    ).toContain("APP_ORIGIN must not include a path, query, or fragment");
    expect(readServerEnv({ NODE_ENV: "development", DATABASE_URL: "postgresql://localhost:5432/x", SESSION_PASSWORD: "c".repeat(40) }).appOrigin).toBeNull();
  });

  it("rejects out-of-range and non-numeric budgets", () => {
    const outOfRange = problemsOf(
      productionEnv({ DB_POOL_MAX: "500", DB_ACQUIRE_TIMEOUT_MS: "1" }),
    );
    expect(outOfRange).toContain("DB_POOL_MAX must be between 1 and 50");
    expect(outOfRange).toContain(
      "DB_ACQUIRE_TIMEOUT_MS must be between 100 and 60000",
    );

    expect(
      problemsOf(productionEnv({ DB_STATEMENT_TIMEOUT_MS: "10s" })),
    ).toContain("DB_STATEMENT_TIMEOUT_MS must be an integer between 1000 and 300000");
  });

  it("keeps an interactive transaction at least as long as its connection wait", () => {
    expect(
      problemsOf(
        productionEnv({
          DB_ACQUIRE_TIMEOUT_MS: "5000",
          DB_TRANSACTION_TIMEOUT_MS: "2000",
        }),
      ),
    ).toContain(
      "DB_TRANSACTION_TIMEOUT_MS must be at least DB_ACQUIRE_TIMEOUT_MS",
    );
  });

  it("never reports secret values in the failure message", () => {
    const secret = "change-me-secret-value-that-must-not-leak";
    const env = productionEnv({ SESSION_PASSWORD: secret });
    let message = "";
    try {
      readServerEnv(env);
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }
    expect(message).not.toContain(secret);
    expect(message).toContain("SESSION_PASSWORD");
  });
});
