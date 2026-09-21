import pg from "pg";
import { pathToFileURL } from "node:url";

const { Client } = pg;

const statements = [
  `CREATE INDEX CONCURRENTLY IF NOT EXISTS "ImageGeneration_prompt_trgm_idx"
    ON "ImageGeneration" USING GIN ("prompt" gin_trgm_ops)`,
  `CREATE INDEX CONCURRENTLY IF NOT EXISTS "ImageGeneration_modelKey_trgm_idx"
    ON "ImageGeneration" USING GIN ("modelKey" gin_trgm_ops)`,
  `CREATE INDEX CONCURRENTLY IF NOT EXISTS "VideoGeneration_prompt_trgm_idx"
    ON "VideoGeneration" USING GIN ("prompt" gin_trgm_ops)`,
  `CREATE INDEX CONCURRENTLY IF NOT EXISTS "VideoGeneration_modelKey_trgm_idx"
    ON "VideoGeneration" USING GIN ("modelKey" gin_trgm_ops)`,
  `CREATE INDEX CONCURRENTLY IF NOT EXISTS "AudioGeneration_prompt_trgm_idx"
    ON "AudioGeneration" USING GIN ("prompt" gin_trgm_ops)`,
  `CREATE INDEX CONCURRENTLY IF NOT EXISTS "AudioGeneration_modelKey_trgm_idx"
    ON "AudioGeneration" USING GIN ("modelKey" gin_trgm_ops)`,
];

export async function createHistorySearchIndexes(databaseUrl = process.env.DATABASE_URL) {
  if (!databaseUrl) throw new Error("DATABASE_URL is required");
  const client = new Client({
    connectionString: databaseUrl,
    connectionTimeoutMillis: 10_000,
    application_name: "leesfield-history-index-release",
  });
  await client.connect();
  try {
    await client.query("SET statement_timeout = '30min'");
    await client.query("SET lock_timeout = '10s'");
    for (const statement of statements) await client.query(statement);
  } finally {
    await client.end();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  createHistorySearchIndexes().catch((error) => {
    const code = error && typeof error === "object" && "code" in error
      ? String(error.code)
      : "HISTORY_INDEX_FAILED";
    console.error(`[history-index] ${code}`);
    process.exitCode = 1;
  });
}
