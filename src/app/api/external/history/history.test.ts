// @vitest-environment node
import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  key: vi.fn(), touch: vi.fn(), list: vi.fn(), status: vi.fn(), unique: vi.fn(), find: vi.fn(), remove: vi.fn(), files: vi.fn(), inputs: vi.fn(),
}));
vi.mock("@/server/db/prisma", () => ({ prisma: {
  apiKey: { findUnique: mocks.key, updateMany: mocks.touch },
  imageGeneration: { findUnique: mocks.unique, findFirst: mocks.find, deleteMany: mocks.remove },
  audioGeneration: { findUnique: mocks.unique, findFirst: mocks.find, deleteMany: mocks.remove },
  videoGeneration: { findUnique: mocks.unique, findFirst: mocks.find, deleteMany: mocks.remove },
  generationInputAsset: { findMany: mocks.inputs },
  mediaOperation: { findFirst: mocks.find, deleteMany: mocks.remove },
} }));
vi.mock("@/server/rate-limit/enforce", () => ({ enforceRateLimit: vi.fn(async () => null) }));
vi.mock("@/server/history/handlers/get-history", () => ({ getHistory: mocks.list }));
vi.mock("@/server/history/handlers/get-history-status", () => ({ getHistoryStatus: mocks.status }));
vi.mock("@/server/history/delete-history-files", () => ({ deleteHistoryFiles: mocks.files }));
import { GET as list } from "./route";
import { GET as status } from "./status/route";
import { GET, DELETE } from "./[historyId]/route";
import { InvalidHistoryCursor } from "@/server/history/lib/history-cursor";
const context = { params: Promise.resolve({ historyId: "request" }) };
const request = (method = "GET", query = "type=image") => new Request("http://localhost/api/external/history/request?" + query, { method, headers: { "X-API-Key": "key" } });
beforeEach(() => {
  vi.clearAllMocks();
  mocks.key.mockResolvedValue({ id: "key", ownerEmail: "owner", status: "active", permissions: ["platform:write"] });
  mocks.inputs.mockResolvedValue([]);
  mocks.touch.mockResolvedValue({ count: 1 });
  mocks.files.mockResolvedValue(undefined);
  mocks.unique.mockResolvedValue(null);
  mocks.find.mockResolvedValue(null);
});
it("passes the authenticated owner to list and status and rejects invalid cursor scope", async () => {
  mocks.list.mockResolvedValue({ items: [], nextCursor: null, total: 0, limit: 24, offset: 0 });
  mocks.status.mockResolvedValue({ hasActive: false, activeCount: 0, latestUpdatedAt: null });
  expect((await list(request())).status).toBe(200);
  expect(mocks.list).toHaveBeenCalledWith(expect.any(URLSearchParams), "owner");
  expect((await status(request())).status).toBe(200);
  expect(mocks.status).toHaveBeenCalledWith(expect.any(URLSearchParams), "owner");
  mocks.list.mockRejectedValueOnce(new InvalidHistoryCursor("INVALID_HISTORY_CURSOR"));
  expect((await list(request())).status).toBe(400);
});
it("reads stored settings and warnings with an owner predicate and without execution secrets", async () => {
  mocks.unique.mockResolvedValue({
    requestId: "request", status: "completed", modelKey: "model", prompt: "prompt",
    createdAt: new Date(), updatedAt: new Date(), progress: 100, errorMessage: "storage warning",
    requestParams: { requestSettings: { seed: 0, apiKey: "secret", nested: { password: "hidden", steps: 2 } }, executionModel: { providerConfig: { token: "hidden" } } },
    images: [{ url: "https://example.com/output.png", width: 512, height: 512, asset: null }],
  });
  const response = await GET(request(), context);
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({ origin: "generation", warningMessage: "storage warning", errorMessage: null, requestParameters: { seed: 0, nested: { steps: 2 } } });
  expect(mocks.unique).toHaveBeenCalledWith(expect.objectContaining({ where: { requestId: "request", ownerEmail: "owner" } }));
  expect(mocks.inputs).toHaveBeenCalledWith(expect.objectContaining({ where: { requestId: "request", generationType: "image", ownerEmail: "owner", asset: { ownerEmail: "owner" } } }));
});
it("returns 404 for another owner's detail without querying its input assets", async () => {
  expect((await GET(request(), context)).status).toBe(404);
  expect(mocks.inputs).not.toHaveBeenCalled();
});
it.each(["pending", "processing", "uploading"])("protects active %s records before storage deletion", async (status) => {
  mocks.find.mockResolvedValue({ id: "record", status, images: [] });
  expect((await DELETE(request("DELETE"), context)).status).toBe(409);
  expect(mocks.files).not.toHaveBeenCalled();
  expect(mocks.remove).not.toHaveBeenCalled();
});
it("requires write permission before deleting and preserves records on storage failure", async () => {
  mocks.key.mockResolvedValueOnce({ id: "key", ownerEmail: "owner", status: "active", permissions: ["platform:read"] });
  expect((await DELETE(request("DELETE"), context)).status).toBe(403);
  expect(mocks.find).not.toHaveBeenCalled();
  mocks.find.mockResolvedValue({ id: "record", status: "completed", images: [{ id: "asset", url: "https://example.com/output" }] });
  mocks.files.mockRejectedValueOnce(new Error("storage failed"));
  expect((await DELETE(request("DELETE"), context)).status).toBe(502);
  expect(mocks.remove).not.toHaveBeenCalled();
  mocks.remove.mockResolvedValue({ count: 1 });
  expect((await DELETE(request("DELETE"), context)).status).toBe(204);
  expect(mocks.remove).toHaveBeenCalledWith({ where: { id: "record", ownerEmail: "owner", status: { notIn: ["pending", "processing", "uploading"] } } });
});
it("projects completed edit input/output metadata", async () => {
  mocks.find.mockResolvedValue({
    id: "request", status: "completed", createdAt: new Date(), updatedAt: new Date(), errorMessage: null,
    parameters: { scale: 2, token: "secret" },
    inputs: [{ asset: { type: "image", storageUrl: "https://example.com/input", legacyUrl: null } }],
    outputs: [{ id: "output", status: "completed", storageUrl: "https://example.com/output", legacyUrl: null, width: 100, height: 100, durationMs: null, imageVariants: null }],
  });
  const response = await GET(request("GET", "type=image&origin=edit"), context);
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({ origin: "edit", requestParameters: { scale: 2 }, inputImages: ["https://example.com/input"], assets: [{ url: "https://example.com/output" }] });
  expect(mocks.find).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "request", ownerEmail: "owner", outputs: { some: { type: "image" } } } }));
});
it("rejects invalid type or origin before history lookup", async () => {
  expect((await GET(request("GET", "type=llm"), context)).status).toBe(400);
  expect((await DELETE(request("DELETE", "type=image&origin=unknown"), context)).status).toBe(400);
  expect(mocks.unique).not.toHaveBeenCalled();
  expect(mocks.find).not.toHaveBeenCalled();
});
