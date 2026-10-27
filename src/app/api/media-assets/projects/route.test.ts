// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ session: vi.fn(), list: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn() }));
vi.mock("@/server/auth/session", () => ({ getSession: mocks.session }));
vi.mock("@/server/media-assets/asset-project-service", () => ({ assetProjectService: mocks }));
import { GET, POST } from "./route";
import { PATCH, DELETE } from "./[projectId]/route";
describe("owner-scoped project routes", () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.session.mockResolvedValue({ isLoggedIn: true, adminEmail: "project-owner@example.com" }); });
  it("returns only the session owner's projects without parsing a GET body", async () => {
    mocks.list.mockResolvedValue([{ id: "p" }]);
    const response = await GET(new Request("http://localhost/api/media-assets/projects"));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ projects: [{ id: "p" }] });
    expect(mocks.list).toHaveBeenCalledWith("project-owner@example.com");
  });
  it("requires login and rejects cross-origin mutations", async () => {
    mocks.session.mockResolvedValueOnce({ isLoggedIn: false });
    expect((await GET(new Request("http://localhost/api/media-assets/projects"))).status).toBe(401);
    expect((await POST(new Request("http://localhost/api/media-assets/projects", { method: "POST", headers: { origin: "https://evil.example", cookie: "leesfield_session=fixture" }, body: "{}" }))).status).toBe(403);
    expect(mocks.create).not.toHaveBeenCalled();
  });
  it("forwards create/settings payload and route IDs to the session owner", async () => {
    mocks.create.mockResolvedValue({ id: "p", name: "Project" });
    const body = { name: "Project", description: "Fixture", coverAssetId: "asset" };
    const response = await POST(new Request("http://localhost/api/media-assets/projects", { method: "POST", body: JSON.stringify(body) }));
    expect(response.status).toBe(201);
    expect(mocks.create).toHaveBeenCalledWith("project-owner@example.com", body);
    mocks.update.mockResolvedValue({ id: "p", version: 2 });
    expect((await PATCH(new Request("http://localhost/api/media-assets/projects/p", { method: "PATCH", body: JSON.stringify({ expectedVersion: 1, name: "Renamed" }) }), { params: Promise.resolve({ projectId: "p" }) })).status).toBe(200);
    expect(mocks.update).toHaveBeenCalledWith("project-owner@example.com", "p", { expectedVersion: 1, name: "Renamed" });
  });
  it("deletes project metadata using the expected version and returns no content", async () => {
    const response = await DELETE(new Request("http://localhost/api/media-assets/projects/p", { method: "DELETE", body: JSON.stringify({ expectedVersion: 2 }) }), { params: Promise.resolve({ projectId: "p" }) });
    expect(response.status).toBe(204);
    expect(mocks.delete).toHaveBeenCalledWith("project-owner@example.com", "p", { expectedVersion: 2 });
  });
});
