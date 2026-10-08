// @vitest-environment node
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/server/db/prisma";
import { postgresIntegrationEnabled } from "@/test-utils/postgres-integration";
import { hashApiKey } from "@/server/api-key/lib/api-key-service";
import { GET as list } from "@/app/api/external/history/route";
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
  it("protects active records and observes permission changes and revocation", async () => {
    expect((await DELETE(request("type=image", "DELETE"), context(ids[3]))).status).toBe(409);
    expect(await prisma.imageGeneration.count({ where: { requestId: ids[3] } })).toBe(1);
    await prisma.apiKey.update({ where: { id: keyId }, data: { permissions: ["platform:read"] } });
    expect((await DELETE(request("type=image", "DELETE"), context(ids[1]))).status).toBe(403);
    await prisma.apiKey.update({ where: { id: keyId }, data: { permissions: [], status: "revoked" } });
    expect((await list(request("type=image"))).status).toBe(403);
  });
});
