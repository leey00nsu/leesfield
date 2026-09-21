// @vitest-environment node

import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/runtime/env", () => ({
  getServerEnv: () => ({ sessionPassword: "pepper-value" }),
}));
vi.mock("@/server/db/prisma", () => ({
  prisma: { $queryRaw: vi.fn(), $executeRaw: vi.fn() },
}));

import {
  consumeRateLimit,
  rateLimitKey,
  setRateLimitStoreForTests,
  sweepRateLimitBuckets,
  type RateLimitPolicy,
  type RateLimitStore,
} from "./limiter";

const POLICY: RateLimitPolicy = {
  name: "test-policy",
  capacity: 3,
  refillPerSecond: 0.5,
};

function fakeStore(tokens: number): RateLimitStore & {
  consumed: Array<{ key: string; policy: RateLimitPolicy }>;
} {
  const consumed: Array<{ key: string; policy: RateLimitPolicy }> = [];
  return {
    consumed,
    async consume(key, policy) {
      consumed.push({ key, policy });
      return tokens;
    },
    async sweep() {
      return 7;
    },
  };
}

afterEach(() => {
  setRateLimitStoreForTests(null);
});

describe("consumeRateLimit", () => {
  it("allows a bucket with tokens left", async () => {
    const store = fakeStore(2);
    setRateLimitStoreForTests(store);

    const outcome = await consumeRateLimit(POLICY, "owner@example.com");
    expect(outcome).toEqual({
      allowed: true,
      retryAfterSeconds: 0,
      remaining: 2,
    });
    expect(store.consumed[0]?.policy).toBe(POLICY);
  });

  it("reports a retry delay derived from the refill rate", async () => {
    setRateLimitStoreForTests(fakeStore(-0.5));
    const outcome = await consumeRateLimit(POLICY, "owner@example.com");
    expect(outcome.allowed).toBe(false);
    // Negative balances encode only the remaining fraction of one token.
    expect(outcome.retryAfterSeconds).toBe(1);
    expect(outcome.remaining).toBe(0);
  });

  it("treats exactly zero tokens as allowed", async () => {
    setRateLimitStoreForTests(fakeStore(0));
    await expect(consumeRateLimit(POLICY, "owner")).resolves.toMatchObject({
      allowed: true,
    });
  });
});

describe("rateLimitKey", () => {
  it("hashes the subject and keeps scopes separate", () => {
    const first = rateLimitKey("login-ip", "203.0.113.9");
    const second = rateLimitKey("login-ip", "203.0.113.9");
    const other = rateLimitKey("login-account", "203.0.113.9");

    expect(first).toBe(second);
    expect(first).not.toBe(other);
    expect(first).not.toContain("203.0.113.9");
    expect(first).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("sweepRateLimitBuckets", () => {
  it("delegates expiry cleanup to the store", async () => {
    setRateLimitStoreForTests(fakeStore(0));
    await expect(sweepRateLimitBuckets()).resolves.toBe(7);
  });
});
