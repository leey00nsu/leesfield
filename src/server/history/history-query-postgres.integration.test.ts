// @vitest-environment node

import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@/server/db/prisma";
import { postgresIntegrationEnabled } from "@/test-utils/postgres-integration";

const integration = describe.skipIf(!postgresIntegrationEnabled);

type ExplainRow = { "QUERY PLAN": Array<{ Plan?: ExplainPlan }> };
type IndexRow = { indexname: string };
type ExplainPlan = {
  "Node Type"?: string;
  "Index Name"?: string;
  Plans?: ExplainPlan[];
};

function flattenPlan(plan: ExplainPlan | undefined): ExplainPlan[] {
  if (!plan) return [];
  return [plan, ...(plan.Plans ?? []).flatMap(flattenPlan)];
}

integration("history and monitoring query plans", () => {
  const ownerEmail = `it-history-plan-${randomUUID()}@example.com`;
  const requestIds: string[] = [];

  afterAll(async () => {
    if (requestIds.length > 0) {
      await prisma.imageGeneration.deleteMany({
        where: { requestId: { in: requestIds } },
      });
    }
  });

  it("uses the owner/date and date/id indexes for representative pages", async () => {
    const anchor = Date.now();
    const ownerRows = Array.from({ length: 64 }, (_, index) => {
      const requestId = `it-history-plan-${randomUUID()}-${index}`;
      requestIds.push(requestId);
      return {
        requestId,
        ownerEmail,
        prompt: "history plan fixture",
        modelKey: "history-plan-model",
        status: "completed" as const,
        progress: 100,
        createdAt: new Date(anchor - index * 1_000),
        updatedAt: new Date(anchor - index * 1_000),
      };
    });
    const unrelatedRows = Array.from({ length: 512 }, (_, index) => {
      const requestId = `it-history-plan-noise-${randomUUID()}-${index}`;
      requestIds.push(requestId);
      return {
        requestId,
        ownerEmail: `it-history-plan-noise-${index}@example.com`,
        prompt: "history plan unrelated fixture",
        modelKey: "history-plan-model",
        status: "completed" as const,
        progress: 100,
        createdAt: new Date(anchor - (index % 64) * 1_000),
        updatedAt: new Date(anchor - (index % 64) * 1_000),
      };
    });
    await prisma.imageGeneration.createMany({ data: [...ownerRows, ...unrelatedRows] });
    await prisma.$executeRaw`ANALYZE "ImageGeneration"`;

    const plans = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SET LOCAL enable_seqscan = off`;
      await tx.$executeRaw`SET LOCAL enable_bitmapscan = off`;
      const history = await tx.$queryRaw<ExplainRow[]>`
        EXPLAIN (FORMAT JSON)
        SELECT "requestId", "status", "prompt", "modelKey", "createdAt", "updatedAt"
        FROM "ImageGeneration"
        WHERE "ownerEmail" = ${ownerEmail}
        ORDER BY "createdAt" DESC, "requestId" DESC
        LIMIT 25
      `;
      const monitoring = await tx.$queryRaw<ExplainRow[]>`
        EXPLAIN (FORMAT JSON)
        SELECT "requestId", "status", "modelKey", "createdAt", "updatedAt", "apiKeyId"
        FROM "ImageGeneration"
        WHERE "createdAt" >= ${new Date(Date.now() - 120_000)}
          AND "createdAt" <= ${new Date()}
        ORDER BY "createdAt" DESC, "requestId" DESC
        LIMIT 25 OFFSET 10
      `;
      return { history, monitoring };
    });
    const searchPlan = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SET LOCAL enable_seqscan = off`;
      return tx.$queryRaw<ExplainRow[]>`
        EXPLAIN (FORMAT JSON)
        SELECT "requestId"
        FROM "ImageGeneration"
        WHERE "prompt" ILIKE ${"%history plan fixture%"}
        LIMIT 25
      `;
    });
    const searchIndexes = await prisma.$queryRaw<IndexRow[]>`
      SELECT indexname::text AS indexname
      FROM pg_indexes
      WHERE schemaname = 'public'
        AND indexname IN (
          'ImageGeneration_prompt_trgm_idx',
          'ImageGeneration_modelKey_trgm_idx',
          'VideoGeneration_prompt_trgm_idx',
          'VideoGeneration_modelKey_trgm_idx',
          'AudioGeneration_prompt_trgm_idx',
          'AudioGeneration_modelKey_trgm_idx'
        )
    `;

    const historyNodes = flattenPlan(plans.history[0]?.["QUERY PLAN"]?.[0]?.Plan);
    const monitoringNodes = flattenPlan(plans.monitoring[0]?.["QUERY PLAN"]?.[0]?.Plan);
    expect(historyNodes.some((node) => node["Index Name"] === "ImageGeneration_ownerEmail_createdAt_requestId_idx")).toBe(true);
    expect(monitoringNodes.some((node) => node["Index Name"] === "ImageGeneration_createdAt_requestId_idx")).toBe(true);
    // Generic `pnpm test` may point at a developer DB where the separate
    // release index step has not run. A partial set is always deployment
    // drift; the production integration runner creates all six and therefore
    // still proves the trigram plan below.
    expect([0, 6]).toContain(searchIndexes.length);
    if (searchIndexes.length === 6) {
      expect(flattenPlan(searchPlan[0]?.["QUERY PLAN"]?.[0]?.Plan).some(
        (node) => node["Index Name"] === "ImageGeneration_prompt_trgm_idx",
      )).toBe(true);
    }
  });
});
