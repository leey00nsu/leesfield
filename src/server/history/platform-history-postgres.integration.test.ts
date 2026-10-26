// @vitest-environment node
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/server/db/prisma";
import { postgresIntegrationEnabled } from "@/test-utils/postgres-integration";
import { hashApiKey } from "@/server/api-key/lib/api-key-service";
import { GET as list } from "@/app/api/external/history/route";
import { GET as status } from "@/app/api/external/history/status/route";
import { GET, DELETE } from "@/app/api/external/history/[historyId]/route";
const integration = describe.skipIf(!postgresIntegrationEnabled);
integration("platform history DB boundaries", () => {
  const owner = "platform-history-" + randomUUID() + "@example.com";
  const other = "other-" + owner;
  const token = "lf_live_" + randomUUID();
  const legacyToken = "lf_live_" + randomUUID();
  const ids = [randomUUID(), randomUUID(), randomUUID(), randomUUID()];
  let keyId = "";
  const request = (query: string, method = "GET", credential = token) => new Request("http://localhost/api/external/history?" + query, { method, headers: { "X-API-Key": credential } });
  const context = (historyId: string) => ({ params: Promise.resolve({ historyId }) });
  beforeAll(async () => {
    const key = await prisma.apiKey.create({ data: { ownerEmail: owner, label: "read", keyHash: hashApiKey(token), maskedKey: "lf_live_...test", permissions: ["platform:write"] } });
    keyId = key.id;
    await prisma.apiKey.create({ data: { ownerEmail: owner, label: "legacy", keyHash: hashApiKey(legacyToken), maskedKey: "lf_live_...legacy" } });
    await prisma.imageGeneration.createMany({ data: ids.map((requestId, index) => ({
      requestId, ownerEmail: index === 2 ? other : owner, apiKeyId: null, prompt: "platform-history",
      status: index === 3 ? "uploading" as const : "completed" as const, progress: 100,
      createdAt: new Date(Date.now() - index * 1000), requestParams: { requestSettings: { seed: 0, token: "never-expose" } },
    })) });
  });
  afterAll(async () => {
    await prisma.imageGeneration.deleteMany({ where: { ownerEmail: { in: [owner, other] } } });
    await prisma.apiKey.deleteMany({ where: { ownerEmail: owner } });
  });
  it("preserves default legacy permissions and scopes cursor/detail to owner", async () => {
    const legacy = await prisma.apiKey.findUnique({ where: { keyHash: hashApiKey(legacyToken) } });
    expect(legacy?.permissions).toEqual([]);
    expect((await list(request("type=image", "GET", legacyToken))).status).toBe(403);
    const first = await (await list(request("type=image&limit=1&includeTotal=false"))).json();
    expect(first.items.map((item: { id: string }) => item.id)).toEqual([ids[0]]);
    expect(first.total).toBeNull();
    expect(first.nextCursor).toBeTruthy();
    const next = await (await list(request("type=image&limit=1&cursor=" + first.nextCursor))).json();
    expect(next.items.map((item: { id: string }) => item.id)).toEqual([ids[1]]);
    expect((await list(request("type=audio&cursor=" + first.nextCursor))).status).toBe(400);
    expect((await GET(request("type=image"), context(ids[2]))).status).toBe(404);
    const own = await GET(request("type=image"), context(ids[0]));
    expect(own.status).toBe(200);
    expect(await own.json()).toMatchObject({ id: ids[0], origin: "generation", requestParameters: { seed: 0 } });
  });
  it("includes owned assistant history, text details and active state in the external contract", async () => {
    const graph = await prisma.generationGraph.create({ data: { ownerEmail: owner, title: "Assistant history" } });
    const node = await prisma.generationGraphNode.create({ data: { id: randomUUID(), graphId: graph.id, kind: "generate.assistant", config: {}, configVersion: 1, x: 0, y: 0 } });
    const model = randomUUID(), imageId = randomUUID(), createdAt = new Date(Date.now() - 60_000);
    try {
      const base = { graphId: graph.id, graphNodeId: node.id, modelKey: model, createdAt,
        inputSnapshot: { instruction: "instruction".repeat(2_500), text: "input needle", credentials: { token: "never-expose" } } };
      const completed = await prisma.assistantExecution.create({ data: { ...base, ownerEmail: owner, status: "completed", outputText: "output".repeat(4_000) } });
      const active = await prisma.assistantExecution.create({ data: { ...base, ownerEmail: owner, status: "processing", outputText: "unfinished-output" } });
      const foreign = await prisma.assistantExecution.create({ data: { ...base, ownerEmail: other, status: "completed", outputText: "foreign-output" } });
      await prisma.imageGeneration.create({ data: { requestId: imageId, ownerEmail: owner, modelKey: model, prompt: "image", status: "completed", progress: 100, createdAt } });
      const query = "model=" + model;
      const full = await (await list(request(query))).json();
      expect(full.total).toBe(3);
      expect(full.items.map((item: { id: string }) => item.id).sort()).toEqual([imageId, active.id, completed.id].sort());
      const assistant = full.items.find((item: { id: string }) => item.id === completed.id);
      expect(assistant).toMatchObject({ type: "assistant", inputText: "input needle", resultUrl: null, thumbnailUrl: null });
      expect(assistant.prompt).toHaveLength(4_000);
      expect(assistant.outputText).toHaveLength(4_000);
      expect(full.items.find((item: { id: string }) => item.id === active.id).outputText).toBeNull();
      expect(JSON.stringify(full)).not.toContain("never-expose");
      const pageIds: string[] = [];
      let cursor: string | null = null;
      do {
        const page = await (await list(request(query + "&limit=1&includeTotal=false" + (cursor ? "&cursor=" + cursor : "")))).json();
        pageIds.push(...page.items.map((item: { id: string }) => item.id));
        expect(page.total).toBeNull(); cursor = page.nextCursor;
      } while (cursor);
      expect(pageIds).toEqual(full.items.map((item: { id: string }) => item.id));
      expect(await (await status(request(query + "&type=assistant"))).json()).toMatchObject({ hasActive: true, activeCount: 1 });
      expect(await (await status(request(query))).json()).toMatchObject({ activeCount: 1 });
      expect((await (await list(request(query + "&type=assistant&hidden=true"))).json()).total).toBe(0);
      expect((await (await list(request(query + "&type=assistant&prompt=needle"))).json()).total).toBe(2);
      const detail = await (await GET(request("type=assistant"), context(completed.id))).json();
      expect(detail.prompt).toHaveLength(20_000);
      expect(detail.outputText).toHaveLength(20_000);
      expect(detail).toMatchObject({ type: "assistant", inputText: "input needle", assets: [], requestParameters: null });
      expect(JSON.stringify(detail)).not.toContain("never-expose");
      expect((await GET(request("type=assistant"), context(foreign.id))).status).toBe(404);
      expect((await GET(request("type=assistant&origin=edit"), context(completed.id))).status).toBe(400);
      expect((await DELETE(request("type=assistant", "DELETE"), context(completed.id))).status).toBe(400);
    } finally {
      await prisma.imageGeneration.deleteMany({ where: { requestId: imageId } });
      await prisma.generationGraph.delete({ where: { id: graph.id } });
    }
  });
  it("protects active records and observes permission changes and revocation", async () => {
    expect((await DELETE(request("type=image", "DELETE"), context(ids[3]))).status).toBe(409);
    expect(await prisma.imageGeneration.count({ where: { requestId: ids[3] } })).toBe(1);
    await prisma.apiKey.update({ where: { id: keyId }, data: { permissions: ["platform:read"] } });
    expect((await DELETE(request("type=image", "DELETE"), context(ids[1]))).status).toBe(403);
    await prisma.apiKey.update({ where: { id: keyId }, data: { permissions: [], status: "revoked" } });
    expect((await list(request("type=image"))).status).toBe(403);
  });
});
