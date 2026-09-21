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

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    adapter,
    transactionOptions: {
      maxWait: db.acquireTimeoutMs,
      timeout: db.transactionTimeoutMs,
    },
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
  globalForPrisma.pgPool = pool;
}

export function getDbPoolSnapshot() {
  return {
    total: pool.totalCount,
    idle: pool.idleCount,
    active: Math.max(0, pool.totalCount - pool.idleCount),
    waiting: pool.waitingCount,
  };
}
