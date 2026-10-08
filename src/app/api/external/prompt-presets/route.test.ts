// @vitest-environment node
import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ auth: vi.fn(), list: vi.fn(), get: vi.fn(), create: vi.fn(), update: vi.fn(), remove: vi.fn(), restore: vi.fn() }));
vi.mock("@/server/auth/api-key-guard", () => ({ requireApiKey: mocks.auth }));
vi.mock("@/server/rate-limit/enforce", () => ({ enforceRateLimit: vi.fn(async () => null) }));
vi.mock("@/server/prompt-presets/prompt-preset-service", () => ({ promptPresetService: mocks }));
import { GET as list, POST as create } from "./route";
import { GET, PATCH, DELETE } from "./[key]/route";
import { POST as restore } from "./[key]/restore/route";
import { PromptPresetError } from "@/server/prompt-presets/prompt-preset-errors";
const request = (method = "GET", body?: unknown) => new Request("http://localhost/api/external/prompt-presets", { method, headers: { "Content-Type": "application/json" }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
const context = { params: Promise.resolve({ key: "custom" }) };
beforeEach(() => {
  vi.clearAllMocks();
  mocks.auth.mockResolvedValue({ ownerEmail: "owner", apiKeyId: "key", permissions: ["platform:write"] });
  mocks.list.mockResolvedValue([]);
  for (const fn of [mocks.get, mocks.create, mocks.update, mocks.restore]) fn.mockResolvedValue({ key: "custom", revision: 2 });
});
it("passes owner and revision through all six operations", async () => {
  expect((await list(request())).status).toBe(200);
  expect((await create(request("POST", { key: "custom" }))).status).toBe(201);
  expect((await GET(request(), context)).status).toBe(200);
  expect((await PATCH(request("PATCH", { expectedRevision: 2, isActive: false }), context)).status).toBe(200);
  expect((await DELETE(request("DELETE", { expectedRevision: 2 }), context)).status).toBe(200);
  expect((await restore(request("POST", { expectedRevision: 2 }), context)).status).toBe(200);
  expect(mocks.get).toHaveBeenCalledWith("owner", "custom");
  expect(mocks.update).toHaveBeenCalledWith("owner", "custom", { expectedRevision: 2, isActive: false });
  expect(mocks.remove).toHaveBeenCalledWith("owner", "custom", { expectedRevision: 2 });
  expect(mocks.restore).toHaveBeenCalledWith("owner", "custom", { expectedRevision: 2 });
});
it("rejects mutation for read keys before reading body or touching the service", async () => {
  mocks.auth.mockResolvedValue({ ownerEmail: "owner", apiKeyId: "key", permissions: ["platform:read"] });
  expect((await list(request())).status).toBe(200);
  expect((await create(request("POST", {}))).status).toBe(403);
  expect((await PATCH(request("PATCH", {}), context)).status).toBe(403);
  expect((await DELETE(request("DELETE", {}), context)).status).toBe(403);
  expect((await restore(request("POST", {}), context)).status).toBe(403);
  expect(mocks.create).not.toHaveBeenCalled();
  expect(mocks.update).not.toHaveBeenCalled();
});
it("maps owner misses, revision conflicts and bounded body failures", async () => {
  mocks.get.mockRejectedValueOnce(new PromptPresetError("PRESET_NOT_FOUND", 404));
  expect((await GET(request(), context)).status).toBe(404);
  mocks.update.mockRejectedValueOnce(new PromptPresetError("PRESET_CONFLICT", 409));
  expect((await PATCH(request("PATCH", { expectedRevision: 1 }), context)).status).toBe(409);
  const oversized = request("POST", { prompt: "x".repeat(96 * 1024) });
  expect((await create(oversized)).status).toBe(413);
  expect(mocks.create).not.toHaveBeenCalled();
});
