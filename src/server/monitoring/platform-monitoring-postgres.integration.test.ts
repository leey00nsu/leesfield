// @vitest-environment node
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { Client } from "pg";
import { beforeAll, afterAll, describe, expect, it, vi } from "vitest";
import { withLogContext } from "@/server/observability/logger";
import { prisma } from "@/server/db/prisma";
import { postgresIntegrationEnabled } from "@/test-utils/postgres-integration";
import { hashApiKey } from "@/server/api-key/lib/api-key-service";
import { GET as overview } from "@/app/api/external/monitoring/overview/route";
import { GET as stats } from "@/app/api/external/monitoring/stats/route";
import { GET as requests } from "@/app/api/external/monitoring/requests/route";
import { GET as top } from "@/app/api/external/monitoring/top/route";
import { GET as detail } from "@/app/api/external/monitoring/requests/detail/route";
import { GET as keys } from "@/app/api/external/monitoring/api-keys/route";
describe.skipIf(!postgresIntegrationEnabled)("platform monitoring owner SQL boundaries", () => {
  const owner = randomUUID() + "@platform-monitoring.test", other = "other-" + owner;
  const token = "lf_live_" + randomUUID(), adminToken = "lf_live_" + randomUUID();
  const model = randomUUID();
  const ownIds = [randomUUID(), randomUUID(), randomUUID()], otherIds = [randomUUID(), randomUUID(), randomUUID()];
  let otherKeyId = "";
  let ownerLatency = 0, globalLatency = 0;
  const request = (extra = "", credential = token) => new Request("http://localhost/api/external/monitoring?model=" + model + "&" + extra, { headers: { "X-API-Key": credential } });
  beforeAll(async () => {
    await prisma.apiKey.create({ data: { ownerEmail: owner, label: "read", keyHash: hashApiKey(token), maskedKey: "lf_live_...owner", permissions: ["platform:read"] } });
    await prisma.apiKey.create({ data: { ownerEmail: owner, label: "admin", keyHash: hashApiKey(adminToken), maskedKey: "lf_live_...admin", permissions: ["platform:admin"] } });
    const otherKey = await prisma.apiKey.create({ data: { ownerEmail: other, label: "other", keyHash: hashApiKey("lf_live_" + randomUUID()), maskedKey: "lf_live_...other" } });
    otherKeyId = otherKey.id;
    const createdAt = new Date(Date.now() - 3600000);
    for (const index of [0, 1, 2]) {
      const data = [{ requestId: ownIds[index], ownerEmail: owner, modelKey: model, prompt: "owner", status: "completed" as const, progress: 100, createdAt, updatedAt: new Date(createdAt.getTime() + 2500) },
        { requestId: otherIds[index], ownerEmail: other, modelKey: model, apiKeyId: otherKeyId, prompt: "other", status: "completed" as const, progress: 100, createdAt, updatedAt: new Date(createdAt.getTime() + 6000) }];
      // Each delegate accepts the common scalar generation fixture.
      if (index === 0) await prisma.imageGeneration.createMany({ data });
      else if (index === 1) await prisma.videoGeneration.createMany({ data });
      else await prisma.audioGeneration.createMany({ data });
    }
    const rows = await prisma.imageGeneration.findMany({where:{ownerEmail:{in:[owner,other]}},select:{ownerEmail:true,createdAt:true,finishedAt:true}});
    const durations = rows.map(row => ({owner:row.ownerEmail, duration:row.finishedAt!.getTime()-row.createdAt.getTime()}));
    // All three delegates were inserted within a few ms; assert SQL against the exact per-table stamps below.
    const videoRows=await prisma.videoGeneration.findMany({where:{ownerEmail:{in:[owner,other]}},select:{ownerEmail:true,createdAt:true,finishedAt:true}});
    const audioRows=await prisma.audioGeneration.findMany({where:{ownerEmail:{in:[owner,other]}},select:{ownerEmail:true,createdAt:true,finishedAt:true}});
    durations.push(...[...videoRows,...audioRows].map(row=>({owner:row.ownerEmail,duration:row.finishedAt!.getTime()-row.createdAt.getTime()})));
    ownerLatency=durations.filter(row=>row.owner===owner).reduce((sum,row)=>sum+row.duration,0)/3;
    globalLatency=durations.reduce((sum,row)=>sum+row.duration,0)/6;
  });
  afterAll(async () => {
    const where = { ownerEmail: { in: [owner, other] } };
    await prisma.imageGeneration.deleteMany({ where });
    await prisma.videoGeneration.deleteMany({ where });
    await prisma.audioGeneration.deleteMany({ where });
    await prisma.apiKey.deleteMany({ where });
  });
  it("scopes overview/statistics/requests/top/detail/keys at DB and SQL boundaries", async () => {
    expect(await (await overview(request())).json()).toMatchObject({ totalCount: 3, avgLatencyMs: ownerLatency, usageByType: { image: 1, video: 1, audio: 1 } });
    const daily = await (await stats(request())).json();
    expect(daily.items.reduce((count: number, row: { total: number }) => count + row.total, 0)).toBe(3);
    expect(daily.items.every((row: { avgLatencyMs: number }) => Math.abs(row.avgLatencyMs-ownerLatency)<0.01)).toBe(true);
    const page = await (await requests(request("includeTotal=false"))).json();
    expect(page.total).toBeNull();
    expect(page.items.map((row: { id: string }) => row.id).sort()).toEqual([...ownIds].sort());
    const leaders = await (await top(request())).json();
    expect(leaders.models).toMatchObject([{ key: model, total: 3, avgLatencyMs: ownerLatency }]);
    expect(leaders.apiKeys).toMatchObject([{ key: "UI", total: 3, avgLatencyMs: ownerLatency }]);
    expect((await detail(request("type=image&requestId=" + otherIds[0]))).status).toBe(404);
    const metadata = await (await keys(request())).json();
    expect(metadata.items).toHaveLength(2);
    expect(JSON.stringify(metadata)).not.toContain(otherKeyId);
    expect(JSON.stringify(metadata)).not.toContain("keyHash");
    expect((await overview(request("apiKeyId=" + otherKeyId))).status).toBe(404);
  });
  it("requires admin and explicit all for global metrics and details", async () => {
    expect((await overview(request("scope=all"))).status).toBe(403);
    expect(await (await overview(request("", adminToken))).json()).toMatchObject({ totalCount: 3 });
    expect(await (await overview(request("scope=all", adminToken))).json()).toMatchObject({ totalCount: 6, avgLatencyMs: globalLatency });
    expect((await detail(request("scope=all&type=image&requestId=" + otherIds[0], adminToken))).status).toBe(200);
  });
  it("stamps terminal transitions once across generation, operations and assistant paths", async () => {
    const graphId=randomUUID(), nodeId=randomUUID();
    await prisma.generationGraph.create({data:{id:graphId,ownerEmail:owner,title:"timing"}});
    await prisma.generationGraphNode.create({data:{id:nodeId,graphId,kind:"generate.assistant",x:0,y:0,configVersion:1,config:{}}});
    try {
      for (const status of ["completed","failed","cancelled"] as const) {
        // Compare creation and trigger completion in the same database clock domain.
        const [{createdAt}]=await prisma.$queryRaw<Array<{createdAt:Date}>>`SELECT clock_timestamp()::timestamp(3) AS "createdAt"`;
        const data={requestId:randomUUID(),ownerEmail:owner,modelKey:"timing-test",prompt:"timing",status:"pending" as const,progress:0,createdAt};
        for (const table of ["ImageGeneration","VideoGeneration","AudioGeneration"] as const) {
          const delegate=table==="ImageGeneration"?prisma.imageGeneration:table==="VideoGeneration"?prisma.videoGeneration:prisma.audioGeneration;
          const row=await (delegate.create as typeof prisma.imageGeneration.create)({data});
          expect(row.finishedAt).toBeNull();
          const terminal=await (delegate.update as typeof prisma.imageGeneration.update)({where:{id:row.id},data:{status}});
          expect(terminal.finishedAt).toBeInstanceOf(Date);
          expect(terminal.finishedAt!.getTime()).toBeGreaterThanOrEqual(row.createdAt.getTime());
          const edited=await (delegate.update as typeof prisma.imageGeneration.update)({where:{id:row.id},data:{hiddenAt:new Date(),finishedAt:new Date(0),updatedAt:new Date(Date.now()+60_000)}});
          expect(edited.finishedAt).toEqual(terminal.finishedAt);
          expect(edited.updatedAt).not.toEqual(terminal.finishedAt);
        }
        const operation=await prisma.mediaOperation.create({data:{ownerEmail:owner,type:"edit.image.resize",configVersion:1,parameters:{}}});
        const terminal=await prisma.mediaOperation.update({where:{id:operation.id},data:{status}});
        expect(terminal.finishedAt).toBeInstanceOf(Date);
        expect((await prisma.mediaOperation.update({where:{id:operation.id},data:{finishedAt:new Date(0)}})).finishedAt).toEqual(terminal.finishedAt);
        const assistant=await prisma.assistantExecution.create({data:{ownerEmail:owner,graphId,graphNodeId:nodeId,modelKey:"test",inputSnapshot:{}}});
        const ended=await prisma.assistantExecution.update({where:{id:assistant.id},data:{status}});
        expect(ended.finishedAt).toBeInstanceOf(Date);
        expect((await prisma.assistantExecution.update({where:{id:assistant.id},data:{finishedAt:new Date(0)}})).finishedAt).toEqual(ended.finishedAt);
      }
    } finally {
      await prisma.generationGraph.delete({where:{id:graphId}});
      await prisma.mediaOperation.deleteMany({where:{ownerEmail:owner}});
    }
  });
  it("preserves legacy terminal dates and nulls while renaming both execution columns", async () => {
    const client = new Client({ connectionString: process.env.DATABASE_URL });
    const schema = "timing_" + randomUUID().replaceAll("-", "");
    await client.connect();
    try {
      await client.query(`CREATE SCHEMA "${schema}"`);
      await client.query(`SET search_path TO "${schema}"`);
      for (const table of ["ImageGeneration", "VideoGeneration", "AudioGeneration"]) {
        await client.query(`CREATE TABLE "${table}" (status text)`);
      }
      const historicalTime = new Date("2025-01-02T03:04:05.678Z");
      for (const table of ["MediaOperation", "AssistantExecution"]) {
        await client.query(`CREATE TABLE "${table}" (id text PRIMARY KEY, status text, "completedAt" timestamp(3))`);
        for (const status of ["completed", "failed", "cancelled"]) {
          await client.query(`INSERT INTO "${table}" VALUES ($1, $2, $3), ($4, $2, NULL)`, [status, status, historicalTime, status + "-unknown"]);
        }
      }
      const migrations = [
        "20261015063000_execution_terminal_time",
        "20261015090000_unify_execution_finished_at",
      ];
      for (const migration of migrations) {
        await client.query(await readFile(`prisma/migrations/${migration}/migration.sql`, "utf8"));
      }
      for (const table of ["MediaOperation", "AssistantExecution"]) {
        // A subsequent terminal update must preserve both the known date and legacy NULL.
        await client.query(`UPDATE "${table}" SET "finishedAt" = now()`);
        const rows = await client.query(`SELECT id, "finishedAt" FROM "${table}"`);
        for (const row of rows.rows) {
          expect(row.finishedAt).toEqual(row.id.endsWith("-unknown") ? null : historicalTime);
        }
        const oldColumn = await client.query("SELECT 1 FROM information_schema.columns WHERE table_schema=$1 AND table_name=$2 AND column_name='completedAt'", [schema, table]);
        expect(oldColumn.rowCount).toBe(0);
        await client.query(`INSERT INTO "${table}" (id, status) VALUES ('new', 'pending')`);
        const ended = await client.query(`UPDATE "${table}" SET status='failed' WHERE id='new' RETURNING "finishedAt"`);
        expect(ended.rows[0].finishedAt).toBeInstanceOf(Date);
      }
    } finally {
      await client.query("ROLLBACK");
      await client.query('SET search_path TO public');
      await client.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      await client.end();
    }
  });
  it("records real raw and transaction query failures without SQL, parameters or owner data",async()=>{
    const sink=vi.spyOn(console,"error").mockImplementation(()=>undefined);
    try {
      await expect(withLogContext({requestId:"db-request"},async()=>await prisma.$queryRawUnsafe("SELECT FROM private_query_marker"))).rejects.toMatchObject({code:"P2010"});
      await expect(withLogContext({requestId:"db-transaction"},()=>prisma.$transaction(async tx=>{
        return tx.apiKey.create({data:{ownerEmail:owner,label:"private-label",keyHash:hashApiKey(token),maskedKey:"private-key"}});
      }))).rejects.toMatchObject({code:"P2002"});
      const lines=sink.mock.calls.map(([line])=>JSON.parse(String(line)));
      expect(lines).toEqual(expect.arrayContaining([
        expect.objectContaining({event:"database.query.failed",requestId:"db-request",operation:"raw.$queryRawUnsafe",error:expect.objectContaining({code:"P2010"})}),
        expect.objectContaining({event:"database.query.failed",requestId:"db-transaction",operation:"ApiKey.create",error:expect.objectContaining({code:"P2002"})}),
      ]));
      expect(JSON.stringify(lines)).not.toMatch(/private_query_marker|private-label|private-key/);
      expect(JSON.stringify(lines)).not.toContain(owner);
    } finally { sink.mockRestore(); }
  });
});
