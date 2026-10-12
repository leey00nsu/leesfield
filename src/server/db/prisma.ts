import { serverLogger } from "@/server/observability/logger";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

import { getServerEnv } from "@/server/runtime/env";

type PrismaGlobal = typeof globalThis & {
  prisma?: PrismaClient;
  pgPool?: Pool;
};

const globalForPrisma = globalThis as PrismaGlobal;

const { databaseUrl, db } = getServerEnv();

// The connection carries its own wait budget so a stuck statement or lock
// cannot pin a pooled connection for the lifetime of the process.
const connectionOptions =
  "-c statement_timeout=" +
  db.statementTimeoutMs +
  " -c lock_timeout=" +
  db.lockTimeoutMs;

const pool =
  globalForPrisma.pgPool ??
  new Pool({
    connectionString: databaseUrl,
    max: db.poolMax,
    connectionTimeoutMillis: db.acquireTimeoutMs,
    idleTimeoutMillis: db.idleTimeoutMs,
    application_name: "leesfield",
    options: connectionOptions,
  });
const adapter = new PrismaPg(pool);

const client =
  globalForPrisma.prisma ??
  new PrismaClient({
    adapter,
    transactionOptions: {
      maxWait: db.acquireTimeoutMs,
      timeout: db.transactionTimeoutMs,
    },
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = client;
  globalForPrisma.pgPool = pool;
}

// Covers model and raw queries, including transaction-scoped queries. Arguments,
// SQL text and Prisma metadata can contain prompts and are deliberately omitted.
// This query-only extension changes no model or result types. Keep the public
// PrismaClient signature compatible with existing TransactionClient helpers.
export const prisma = client.$extends({
  name: "safe-error-observability",
  query: {
    async $allOperations({ model, operation, args, query }) {
      try {
        return await query(args);
      } catch (error) {
        serverLogger.error("database.query.failed", error, {
          operation: (model ?? "raw") + "." + operation,
          phase: "database.query",
        });
        throw error;
      }
    },
  },
}) as unknown as PrismaClient;

export function getDbPoolSnapshot() {
  return {
    total: pool.totalCount,
    idle: pool.idleCount,
    active: Math.max(0, pool.totalCount - pool.idleCount),
    waiting: pool.waitingCount,
  };
}
