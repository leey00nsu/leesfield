// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
const db = vi.hoisted(() => ({ findUnique: vi.fn(), updateMany: vi.fn() }));
vi.mock("@/server/db/prisma", () => ({ prisma: { apiKey: db } }));
import { withExternalApi } from "./route-handler";

const request = () => new Request("http://localhost/api/test", {
  headers: { "X-API-Key": "lf_live_test" },
});

it.each([
  ["POST", "/api/external/generations", "generations:create"],
  ["GET", "/api/external/generations/job", "generations:read"],
  ["GET", "/api/external/models", "models:read"],
  ["GET", "/api/external/models/model/schema", "models:read"],
  ["GET", "/api/external/history", "history:read"],
  ["DELETE", "/api/external/history/job", "history:delete"],
  ["POST", "/api/external/prompt-presets", "presets:create"],
  ["GET", "/api/external/prompt-presets/preset", "presets:read"],
  ["PATCH", "/api/external/prompt-presets/preset", "presets:update"],
  ["POST", "/api/external/prompt-presets/preset/restore", "presets:update"],
  ["DELETE", "/api/external/prompt-presets/preset", "presets:delete"],
  ["GET", "/api/external/monitoring/overview", "monitoring:read"],
  ["GET", "/api/external/admin/models", "models:manage"],
  ["POST", "/api/external/admin/models/import", "models:manage"],
] as const)("requires the action permission before %s %s", async (method, path, permission) => {
  db.updateMany.mockResolvedValue({ count: 1 });
  const handler = vi.fn(async () => Response.json({ ok: true }));
  const req = () => new Request("http://localhost" + path, { method, headers: { "X-API-Key": "lf_live_test" } });
  db.findUnique.mockResolvedValue({ ...record, permissions: ["access:custom"] });
  expect((await withExternalApi(req(), handler)).status).toBe(403);
  expect(handler).not.toHaveBeenCalled();
  db.findUnique.mockResolvedValue({ ...record, permissions: ["access:custom", permission] });
  expect((await withExternalApi(req(), handler)).status).toBe(200);
  expect(handler).toHaveBeenCalledOnce();
});
const record = { id: "key", ownerEmail: "owner@example.com", status: "active", permissions: [] };
describe("platform API permission boundary", () => {
  beforeEach(() => { vi.clearAllMocks(); db.updateMany.mockResolvedValue({ count: 1 }); });
  it("keeps legacy generation calls usable but rejects platform access before its handler", async () => {
    db.findUnique.mockResolvedValue(record);
    const handler = vi.fn(async () => Response.json({ ok: true }));
    expect((await withExternalApi(request(), handler)).status).toBe(200);
    handler.mockClear();
    const denied = await withExternalApi(request(), handler, "platform:read");
    expect(denied.status).toBe(403);
    expect(await denied.json()).toMatchObject({ message: "PLATFORM_PERMISSION_REQUIRED" });
    expect(handler).not.toHaveBeenCalled();
  });
  it.each([
    ["platform:read", "platform:read", 200],
    ["platform:read", "platform:write", 403],
    ["platform:write", "platform:read", 200],
    ["platform:write", "platform:admin", 403],
    ["platform:admin", "platform:write", 200],
  ] as const)("enforces %s for %s", async (granted, required, status) => {
    db.findUnique.mockResolvedValue({ ...record, permissions: [granted] });
    expect((await withExternalApi(request(), async () => Response.json({ ok: true }), required)).status).toBe(status);
  });
  it("rereads permission changes and revocation on each request", async () => {
    db.findUnique.mockResolvedValueOnce({ ...record, permissions: ["platform:admin"] })
      .mockResolvedValueOnce(record)
      .mockResolvedValueOnce({ ...record, status: "revoked", permissions: ["platform:admin"] });
    const handler = vi.fn(async () => Response.json({ ok: true }));
    expect((await withExternalApi(request(), handler, "platform:admin")).status).toBe(200);
    expect((await withExternalApi(request(), handler, "platform:admin")).status).toBe(403);
    expect((await withExternalApi(request(), handler, "platform:admin")).status).toBe(403);
    expect(handler).toHaveBeenCalledOnce();
  });
  it.each([{ permissions: ["platform:admin", "unknown"] }, { permissions: { admin: true } }, { permissions: "platform:admin" }])("fails closed for corrupt stored permissions %j", async ({ permissions }) => {
    db.findUnique.mockResolvedValue({ ...record, permissions });
    const handler = vi.fn(async () => Response.json({ ok: true }));
    expect((await withExternalApi(request(), handler, "platform:read")).status).toBe(403);
    expect(handler).not.toHaveBeenCalled();
  });
});
