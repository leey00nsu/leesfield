// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ session: vi.fn(), start: vi.fn(), get: vi.fn(), cancel: vi.fn(), available: vi.fn(), worker: vi.fn() }));
vi.mock("@/server/auth/session", () => ({ getSession: mocks.session }));
vi.mock("@/server/media-operations/media-operation-worker", () => ({ startMediaOperationWorker: mocks.worker }));
vi.mock("@/server/media-operations/ffmpeg-video-processor", () => ({ hasFfmpegVideoProcessor: mocks.available }));
vi.mock("./direct-edit-service", () => ({ startDirectEdit: mocks.start, getDirectEdit: mocks.get, cancelDirectEdit: mocks.cancel,
  DirectEditError: class extends Error {} }));
import { directEditHttp } from "./direct-edit-http";

describe("session-only direct editing HTTP boundary", () => {
  const ids = { graphId: "space", nodeId: "source", operationId: "operation" };
  beforeEach(() => { vi.clearAllMocks(); mocks.session.mockResolvedValue({ isLoggedIn: true, adminEmail: "owner@example.com" }); mocks.available.mockResolvedValue(true); });
  it("rejects unauthenticated access and cross-origin mutations before touching an operation", async () => {
    mocks.session.mockResolvedValueOnce({ isLoggedIn: false });
    expect((await directEditHttp(new Request("https://app.example/api/edit"), ids)).status).toBe(401);
    const foreign = new Request("https://app.example/api/edit", { method: "DELETE", headers: { origin: "https://foreign.example", cookie: "leesfield_session=test", host: "app.example" } });
    expect((await directEditHttp(foreign, ids)).status).toBe(403);
    expect(mocks.cancel).not.toHaveBeenCalled();
  });
  it("uses the authenticated owner and no-store for reads", async () => {
    mocks.get.mockResolvedValue({ id: "operation", status: "processing" });
    const response = await directEditHttp(new Request("https://app.example/api/edit"), ids);
    expect(mocks.get).toHaveBeenCalledWith("owner@example.com", "space", "source", "operation");
    expect(response.headers.get("cache-control")).toBe("no-store");
  });
  it("bounds JSON and refuses unavailable processing without starting a job", async () => {
    const request = () => new Request("https://app.example/api/edit", { method: "POST", headers: { origin: "https://app.example", "content-type": "application/json" }, body: "{}" });
    mocks.available.mockResolvedValue(false);
    expect((await directEditHttp(request(), ids)).status).toBe(503);
    expect(mocks.start).not.toHaveBeenCalled();
  });
});
