import { createHmac } from "node:crypto";

import { Prisma } from "@prisma/client";

import { getServerEnv } from "@/server/runtime/env";

/**
 * Token bucket admission shared through PostgreSQL.
 *
 * Every process and instance consumes the same row, so a limit cannot be
 * multiplied by adding workers. Buckets are stored per hashed key, never with
 * raw addresses or accounts, and expire on their own.
 */

export type RateLimitPolicy = {
  name: string;
  capacity: number;
  refillPerSecond: number;
};

export type RateLimitOutcome = {
  allowed: boolean;
  retryAfterSeconds: number;
  remaining: number;
};

export interface RateLimitStore {
  /** Consumes one token and returns the balance after the consume. */
  consume(key: string, policy: RateLimitPolicy, now: Date): Promise<number>;
  sweep(now: Date, limit: number): Promise<number>;
}

type RawQueryClient = {
  $queryRaw<T = unknown>(query: Prisma.Sql): Promise<T>;
  $executeRaw(query: Prisma.Sql): Promise<number>;
};

const BUCKET_TTL_MS = 24 * 60 * 60 * 1000;
const SWEEP_CHANCE = 0.01;
const SWEEP_BATCH = 200;

export function createPrismaRateLimitStore(
  client: RawQueryClient,
): RateLimitStore {
  return {
    async consume(key, policy, now) {
      const expiresAt = new Date(now.getTime() + BUCKET_TTL_MS);
      const rows = await client.$queryRaw<Array<{ tokens: number }>>(
        Prisma.sql`
        INSERT INTO "RateLimitBucket" ("key", "tokens", "updatedAt", "expiresAt")
        VALUES (${key}, ${policy.capacity - 1}::double precision, ${now}, ${expiresAt})
        ON CONFLICT ("key") DO UPDATE SET
          "tokens" = LEAST(
            ${policy.capacity}::double precision,
            CASE
              WHEN "RateLimitBucket"."tokens" < 0 THEN
                1 + GREATEST(-1, "RateLimitBucket"."tokens")
              ELSE "RateLimitBucket"."tokens"
            END
              + EXTRACT(EPOCH FROM (${now} - "RateLimitBucket"."updatedAt"))
                * ${policy.refillPerSecond}::double precision
          ) - 1,
          "updatedAt" = ${now},
          "expiresAt" = ${expiresAt}
        RETURNING "tokens"
      `,
      );
      return rows[0]?.tokens ?? 0;
    },
    async sweep(now, limit) {
      const deleted = await client.$executeRaw(Prisma.sql`
        DELETE FROM "RateLimitBucket"
        WHERE "key" IN (
          SELECT "key" FROM "RateLimitBucket"
          WHERE "expiresAt" < ${now}
          ORDER BY "expiresAt"
          LIMIT ${limit}
        )
      `);
      return Number(deleted);
    },
  };
}

/** Default for tests and local tooling; a serving process never uses it. */
export const allowAllRateLimitStore: RateLimitStore = {
  async consume() {
    return 0;
  },
  async sweep() {
    return 0;
  },
};

let store: RateLimitStore | null = null;

export function setRateLimitStoreForTests(next: RateLimitStore | null): void {
  store = next;
}

async function getStore(): Promise<RateLimitStore> {
  if (store) return store;
  // Imported lazily so unit tests and tooling do not need a database.
  const { prisma } = await import("@/server/db/prisma");
  const created = createPrismaRateLimitStore(
    prisma as unknown as RawQueryClient,
  );
  store = created;
  return created;
}

/** Hashed so buckets never hold a raw address, account, or key. */
export function rateLimitKey(scope: string, subject: string): string {
  const pepper = getServerEnv().sessionPassword;
  return createHmac("sha256", pepper)
    .update(scope + "|" + subject)
    .digest("hex");
}

export async function consumeRateLimit(
  policy: RateLimitPolicy,
  subject: string,
  now: Date = new Date(),
): Promise<RateLimitOutcome> {
  const active = await getStore();
  const tokens = await active.consume(
    rateLimitKey(policy.name, subject),
    policy,
    now,
  );

  if (Math.random() < SWEEP_CHANCE) {
    void active.sweep(now, SWEEP_BATCH).catch(() => undefined);
  }

  const allowed = tokens >= 0;
  return {
    allowed,
    retryAfterSeconds: allowed
      ? 0
      : Math.max(1, Math.ceil(-tokens / policy.refillPerSecond)),
    remaining: Math.max(0, Math.floor(tokens)),
  };
}

export async function sweepRateLimitBuckets(
  now: Date = new Date(),
  limit = SWEEP_BATCH,
): Promise<number> {
  const active = await getStore();
  return await active.sweep(now, limit);
}
