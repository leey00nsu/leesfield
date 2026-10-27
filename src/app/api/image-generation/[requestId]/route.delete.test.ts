// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ session: vi.fn(), get: vi.fn(), remove: vi.fn() }));
vi.mock("@/server/auth/session", () => ({ getSession: mocks.session }));
vi.mock("@/server/history/history-record", () => ({ getOwnedHistoryRecord: mocks.get, deleteOwnedHistoryRecord: mocks.remove }));
import { DELETE } from "./route";
describe("legacy image History DELETE compatibility", () => {
  const context = { params: Promise.resolve({ requestId: "request-1" }) };
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.session.mockResolvedValue({ isLoggedIn: true, adminEmail: "owner@example.com" });
    mocks.get.mockResolvedValue({ record: { id: "db-1", status: "completed" }, ownerEmail: "owner@example.com" });
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });
  it("requires login and passes the owner and generation selector to the shared deletion boundary", async () => {
    mocks.session.mockResolvedValueOnce({ isLoggedIn: false });
    expect((await DELETE(new Request("http://localhost", { method: "DELETE" }), context)).status).toBe(401);
    expect(mocks.get).not.toHaveBeenCalled();
    mocks.remove.mockResolvedValue(204);
    const response = await DELETE(new Request("http://localhost", { method: "DELETE" }), context);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ message: "DELETED" });
    expect(mocks.get).toHaveBeenCalledWith("owner@example.com", "request-1", { type: "image", origin: "generation" });
  });
  it.each(["pending", "processing", "uploading"])("preserves active %s rejection without storage work", async (status) => {
    mocks.get.mockResolvedValue({ record: { status } });
    const response = await DELETE(new Request("http://localhost", { method: "DELETE" }), context);
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ message: "IN_PROGRESS" });
    expect(mocks.remove).not.toHaveBeenCalled();
  });
  it.each([[404,404,"NOT_FOUND"],[409,409,"HISTORY_IN_USE_OR_ACTIVE"],[502,500,"STORAGE_DELETE_FAILED"]])("returns shared deletion status %s safely", async (status, expected, message) => {
    mocks.remove.mockResolvedValue(status);
    const response = await DELETE(new Request("http://localhost", { method: "DELETE" }), context);
    expect(response.status).toBe(expected);
    expect(await response.json()).toEqual({ message });
  });
});
