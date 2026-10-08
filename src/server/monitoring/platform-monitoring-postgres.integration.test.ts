// @vitest-environment node
import { randomUUID } from "node:crypto";
import { beforeAll, afterAll, describe, expect, it } from "vitest";
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
  });
  afterAll(async () => {
    const where = { ownerEmail: { in: [owner, other] } };
    await prisma.imageGeneration.deleteMany({ where });
    await prisma.videoGeneration.deleteMany({ where });
    await prisma.audioGeneration.deleteMany({ where });
    await prisma.apiKey.deleteMany({ where });
  });
  it("scopes overview/statistics/requests/top/detail/keys at DB and SQL boundaries", async () => {
    expect(await (await overview(request())).json()).toMatchObject({ totalCount: 3, avgLatencyMs: 2500, usageByType: { image: 1, video: 1, audio: 1 } });
    const daily = await (await stats(request())).json();
    expect(daily.items.reduce((count: number, row: { total: number }) => count + row.total, 0)).toBe(3);
    expect(daily.items.every((row: { avgLatencyMs: number }) => row.avgLatencyMs === 2500)).toBe(true);
    const page = await (await requests(request("includeTotal=false"))).json();
    expect(page.total).toBeNull();
    expect(page.items.map((row: { id: string }) => row.id).sort()).toEqual([...ownIds].sort());
    const leaders = await (await top(request())).json();
    expect(leaders.models).toMatchObject([{ key: model, total: 3, avgLatencyMs: 2500 }]);
    expect(leaders.apiKeys).toMatchObject([{ key: "UI", total: 3, avgLatencyMs: 2500 }]);
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
    expect(await (await overview(request("scope=all", adminToken))).json()).toMatchObject({ totalCount: 6, avgLatencyMs: 4250 });
    expect((await detail(request("scope=all&type=image&requestId=" + otherIds[0], adminToken))).status).toBe(200);
  });
});
