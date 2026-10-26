// @vitest-environment node
import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ auth: vi.fn(), key: vi.fn(), keys: vi.fn(), overview: vi.fn(), detail: vi.fn() }));
vi.mock("@/server/auth/api-key-guard", () => ({ requireApiKey: mocks.auth }));
vi.mock("@/server/db/prisma", () => ({ prisma: { apiKey: { findFirst: mocks.key, findMany: mocks.keys } } }));
vi.mock("@/server/rate-limit/enforce", () => ({ enforceRateLimit: vi.fn(async () => null) }));
vi.mock("@/server/monitoring/overview", () => ({ getMonitoringOverview: mocks.overview }));
vi.mock("@/server/monitoring/request-detail", () => ({ getMonitoringRequestDetail: mocks.detail }));
import { GET } from "./overview/route";
import { GET as detail } from "./requests/detail/route";
import { GET as keys } from "./api-keys/route";
const request = (query = "") => new Request("http://localhost/api/external/monitoring/overview?" + query);
beforeEach(() => {
  vi.clearAllMocks();
  mocks.auth.mockResolvedValue({ ownerEmail: "owner", apiKeyId: "key", permissions: ["platform:read"] });
  mocks.overview.mockResolvedValue({ activeCount: 0, totalCount: 1, failedCount: 0, errorRate: 0, avgLatencyMs: 0, p95LatencyMs: 0,
    usageByType: { image: 1, video: 0, audio: 0, assistant: 0, other: 0 } });
});
it("forces owner in service query, clamps reads, and rejects global escalation before querying", async () => {
  expect((await GET(request("ownerEmail=other&limit=9999&offset=9999&from=2000-01-01&to=2026-10-07&query=" + "a".repeat(300)))).status).toBe(200);
  const query = mocks.overview.mock.calls[0][0];
  expect(query.ownerEmail).toBe("owner");
  expect(query.includeAssistant).toBe(true);
  expect(query.limit).toBe(200);
  expect(query.offset).toBe(1000);
  expect(query.query).toHaveLength(200);
  expect(query.to.getTime() - query.from.getTime()).toBeLessThanOrEqual(31 * 86400000);
  mocks.overview.mockClear();
  expect((await GET(request("scope=all"))).status).toBe(403);
  expect((await GET(request("scope=other"))).status).toBe(400);
  expect(mocks.overview).not.toHaveBeenCalled();
});
it("admin still defaults to owner and only explicit all removes owner", async () => {
  mocks.auth.mockResolvedValue({ ownerEmail: "owner", apiKeyId: "key", permissions: ["platform:admin"] });
  await GET(request());
  expect(mocks.overview.mock.calls[0][0]).toHaveProperty("ownerEmail", "owner");
  await GET(request("scope=all"));
  expect(mocks.overview.mock.calls[1][0]).not.toHaveProperty("ownerEmail");
});
it("global monitoring is a separate capability from model administration", async () => {
  mocks.auth.mockResolvedValue({ ownerEmail: "owner", apiKeyId: "key", permissions: ["access:custom", "monitoring:read", "models:manage"] });
  expect((await GET(request("scope=all"))).status).toBe(403);
  expect(mocks.overview).not.toHaveBeenCalled();
  mocks.auth.mockResolvedValue({ ownerEmail: "owner", apiKeyId: "key", permissions: ["access:custom", "monitoring:read", "monitoring:read-all"] });
  expect((await GET(request("scope=all"))).status).toBe(200);
  expect(mocks.overview.mock.calls[0][0]).not.toHaveProperty("ownerEmail");
});
it("requires an owned key filter and never leaks another owner's detail", async () => {
  mocks.key.mockResolvedValue(null);
  expect((await GET(request("apiKeyId=other-key"))).status).toBe(404);
  expect(mocks.key).toHaveBeenCalledWith({ where: { id: "other-key", ownerEmail: "owner" }, select: { id: true } });
  expect(mocks.overview).not.toHaveBeenCalled();
  mocks.detail.mockResolvedValue(null);
  expect((await detail(request("type=image&requestId=other-request"))).status).toBe(404);
  expect(mocks.detail).toHaveBeenCalledWith("image", "other-request", "owner");
});
it("returns only bounded masked filter metadata", async () => {
  mocks.keys.mockResolvedValue([{ id: "key", label: "Read", maskedKey: "lf_live_...read", status: "active", keyHash: "never", ownerEmail: "owner" }]);
  const response = await keys(request("limit=10&offset=5"));
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ items: [{ id: "key", label: "Read", maskedKey: "lf_live_...read", status: "active" }], limit: 10, offset: 5 });
  expect(mocks.keys).toHaveBeenCalledWith(expect.objectContaining({ where: { ownerEmail: "owner" }, take: 10, skip: 5, select: { id: true, label: true, maskedKey: true, status: true } }));
});
