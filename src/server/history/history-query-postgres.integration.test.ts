import {getHistory} from "./handlers/get-history";
import {getHistoryStatus} from "./handlers/get-history-status";
import {getAssistantHistoryItem} from "./assistant-history";
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
  it("includes owned assistant text history with model/status/search and stable mixed cursor boundaries",async()=>{
    const graph=await prisma.generationGraph.create({data:{ownerEmail,title:"Assistant history test"}}),node=await prisma.generationGraphNode.create({data:{id:randomUUID(),graphId:graph.id,kind:"generate.assistant",config:{},configVersion:1,x:0,y:0}});
    const at=new Date(Date.now()-60_000),model="assistant-history-"+randomUUID(),assistantIds:string[]=[],inputId=randomUUID();
    try {
      for(const status of ["completed","failed","pending"]) {const row=await prisma.assistantExecution.create({data:{ownerEmail,graphId:graph.id,graphNodeId:node.id,modelKey:model,status:status as "completed"|"failed"|"pending",createdAt:at,inputSnapshot:{instruction:"Find campaign summary",text:"Reference copy",secret:"PRIVATE_SENTINEL"},outputText:status==="completed"?"A finished text result":null}});assistantIds.push(row.id);}
      const foreign=await prisma.assistantExecution.create({data:{ownerEmail:"other-"+ownerEmail,graphId:graph.id,graphNodeId:node.id,modelKey:model,status:"completed",createdAt:at,inputSnapshot:{instruction:"Find campaign summary"},outputText:"FOREIGN_OUTPUT"}});assistantIds.push(foreign.id);
      const image=await prisma.imageGeneration.create({data:{ownerEmail,requestId:randomUUID(),modelKey:model,prompt:"Find campaign summary",status:"completed",progress:100,createdAt:at}});requestIds.push(image.requestId);
      const params=(extra:Record<string,string>={})=>new URLSearchParams({type:"assistant",model,includeTotal:"true",...extra});
      const only=await getHistory(params(),ownerEmail,{includeAssistant:true});expect(only.total).toBe(3);expect(only.items.every(item=>item.type==="assistant")).toBe(true);
      expect(JSON.stringify(only)).not.toContain("PRIVATE_SENTINEL");expect(JSON.stringify(only)).not.toContain("FOREIGN_OUTPUT");
      expect((await getHistory(params({status:"failed"}),ownerEmail,{includeAssistant:true})).items).toHaveLength(1);
      expect((await getHistory(params({prompt:"campaign"}),ownerEmail,{includeAssistant:true})).items).toHaveLength(3);
      expect((await getHistory(params({prompt:"missing"}),ownerEmail,{includeAssistant:true})).items).toHaveLength(0);
      expect((await getHistory(params({hidden:"true"}),ownerEmail,{includeAssistant:true})).items).toHaveLength(0);
      expect((await getHistory(params({status:"uploading"}),ownerEmail,{includeAssistant:true})).items).toHaveLength(0);
      const expected=[...assistantIds.slice(0,3),image.requestId].sort();let cursor:string|undefined;const actual:string[]=[];
      do{const page=await getHistory(params({type:"all",limit:"2",...(cursor?{cursor}:{})}),ownerEmail,{includeAssistant:true});actual.push(...page.items.map(item=>item.id));cursor=page.nextCursor??undefined;}while(cursor);
      expect(actual.sort()).toEqual(expected);expect(new Set(actual).size).toBe(4);
      expect((await getHistory(params({type:"all"}),ownerEmail)).items.map(item=>item.id)).toEqual([image.requestId]);
      await prisma.mediaAsset.create({data:{id:inputId,ownerEmail,type:"image",origin:"upload",storageProvider:"test",storageObjectId:randomUUID(),mimeType:"image/png"}});
      await prisma.assistantExecutionInputAsset.create({data:{executionId:assistantIds[0],ownerEmail,assetId:inputId,portId:"image",sortOrder:0}});
      await prisma.assistantExecution.update({where:{id:assistantIds[0]},data:{inputSnapshot:{instruction:"Find campaign summary",text:"Reference copy",outputMode:"list",secret:"PRIVATE_SENTINEL"}}});
      const detail=await getAssistantHistoryItem(ownerEmail,assistantIds[0]);expect(detail).toMatchObject({outputText:"A finished text result",assistantSettings:{outputMode:"list"},sourceAssetIds:[inputId]});expect(JSON.stringify(detail)).not.toContain("PRIVATE_SENTINEL");
      expect((await getAssistantHistoryItem(ownerEmail,assistantIds[1]))?.assistantSettings?.outputMode).toBeNull();expect(await getAssistantHistoryItem(ownerEmail,foreign.id)).toBeNull();
      expect((await getHistoryStatus(params(),ownerEmail,{includeAssistant:true})).activeCount).toBe(1);
    } finally {await prisma.assistantExecution.deleteMany({where:{id:{in:assistantIds}}});await prisma.mediaAsset.deleteMany({where:{id:inputId,ownerEmail}});await prisma.generationGraph.delete({where:{id:graph.id}});}
  });

});
