// @vitest-environment node

import { randomUUID } from "node:crypto";

import { afterAll, describe, expect, it } from "vitest";

import { prisma } from "@/server/db/prisma";
import { postgresIntegrationEnabled } from "@/test-utils/postgres-integration";

import {
  consumeRateLimit,
  rateLimitKey,
  setRateLimitStoreForTests,
  sweepRateLimitBuckets,
  type RateLimitPolicy,
} from "./limiter";

const integration = describe.skipIf(!postgresIntegrationEnabled);
const suffix = randomUUID();

function policy(name: string, capacity: number, refillPerSecond: number): RateLimitPolicy {
  return { name: "it-" + name + "-" + suffix, capacity, refillPerSecond };
}

integration("shared rate limit buckets", () => {
  const created: string[] = [];

  // The shared setup installs an allow-all store; this suite exercises the
  // real PostgreSQL bucket.
  setRateLimitStoreForTests(null);

  function trackedKey(p: RateLimitPolicy, subject: string): string {
    const key = rateLimitKey(p.name, subject);
    created.push(key);
    return key;
  }

  afterAll(async () => {
    if (created.length > 0) {
      await prisma.rateLimitBucket.deleteMany({ where: { key: { in: created } } });
    }
  });

  it("enforces one shared budget across concurrent callers", async () => {
    const at = new Date();
    const p = policy("burst", 5, 1);
    const key = trackedKey(p, "burst-subject");

    const outcomes = await Promise.all(
      Array.from({ length: 20 }, () => consumeRateLimit(p, "burst-subject", at)),
    );
    const allowed = outcomes.filter((outcome) => outcome.allowed).length;

    expect(allowed).toBe(5);
    const row = await prisma.rateLimitBucket.findUnique({ where: { key } });
    expect(row?.tokens ?? 0).toBeGreaterThanOrEqual(-1);
    expect(row?.tokens ?? 0).toBeLessThan(0);
  });

  it("refills over time and reports a retry hint when exhausted", async () => {
    const at = new Date();
    const p = policy("refill", 2, 1);
    trackedKey(p, "refill-subject");

    const first = await consumeRateLimit(p, "refill-subject", at);
    const second = await consumeRateLimit(p, "refill-subject", at);
    const blocked = await consumeRateLimit(p, "refill-subject", at);

    expect(first.allowed).toBe(true);
    expect(second.allowed).toBe(true);
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSeconds).toBeGreaterThanOrEqual(1);

    const later = await consumeRateLimit(
      p,
      "refill-subject",
      new Date(at.getTime() + 10_000),
    );
    expect(later.allowed).toBe(true);
  });

  it("does not accumulate denial debt under a sustained rejected burst", async () => {
    const at = new Date();
    const p = policy("bounded-debt", 1, 1);
    trackedKey(p, "bounded-debt-subject");
    expect(
      (await consumeRateLimit(p, "bounded-debt-subject", at))
        .allowed,
    ).toBe(true);

    // Keep the injected instant within the live TTL. An old epoch allowed an
    // unrelated real-time background sweep to delete this supposedly live row.
    await sweepRateLimitBuckets();
    const blocked = await Promise.all(
      Array.from({ length: 20 }, () =>
        consumeRateLimit(p, "bounded-debt-subject", at),
      ),
    );
    expect(blocked.every((outcome) => !outcome.allowed)).toBe(true);
    expect(Math.max(...blocked.map((outcome) => outcome.retryAfterSeconds))).toBe(1);

    const recovered = await consumeRateLimit(
      p,
      "bounded-debt-subject",
      new Date(at.getTime() + 1_000),
    );
    expect(recovered.allowed).toBe(true);
  });

  it("keeps policies isolated for the same subject", async () => {
    const at = new Date();
    const left = policy("isolated-left", 1, 1);
    const right = policy("isolated-right", 1, 1);
    trackedKey(left, "shared-subject");
    trackedKey(right, "shared-subject");

    expect((await consumeRateLimit(left, "shared-subject", at)).allowed).toBe(true);
    expect((await consumeRateLimit(left, "shared-subject", at)).allowed).toBe(false);
    expect((await consumeRateLimit(right, "shared-subject", at)).allowed).toBe(true);
  });

  it("removes expired buckets", async () => {
    const expiredKey = rateLimitKey("it-expired-" + suffix, "subject");
    created.push(expiredKey);
    await prisma.rateLimitBucket.create({
      data: {
        key: expiredKey,
        tokens: 0,
        updatedAt: new Date(Date.now() - 60_000),
        expiresAt: new Date(Date.now() - 1000),
      },
    });

    await sweepRateLimitBuckets();

    await expect(
      prisma.rateLimitBucket.findUnique({ where: { key: expiredKey } }),
    ).resolves.toBeNull();
  });
});
