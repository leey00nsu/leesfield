import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ session: vi.fn(), get: vi.fn(), update: vi.fn() }));
vi.mock("@/server/auth/session", () => ({ getSession: mocks.session }));
vi.mock("@/server/generation-graph/space-preferences-repository", () => ({
  spacePreferencesRepository: { get: mocks.get, update: mocks.update },
  SpacePreferenceError: class extends Error {},
}));
import { GET, PATCH } from "./route";
describe("Space preferences API", () => {
  beforeEach(() => { vi.resetAllMocks(); mocks.session.mockResolvedValue({ isLoggedIn: true, adminEmail: "owner@example.com" }); });
  it("requires authentication for both reads and writes", async () => {
    mocks.session.mockResolvedValue({ isLoggedIn: false });
    expect((await GET()).status).toBe(401);
    expect((await PATCH(new Request("http://localhost/api/spaces/preferences", { method: "PATCH" }))).status).toBe(401);
    expect(mocks.get).not.toHaveBeenCalled(); expect(mocks.update).not.toHaveBeenCalled();
  });
  it("uses only the session owner and never caches preferences", async () => {
    mocks.get.mockResolvedValue({ revision: 4 });
    const response = await GET();
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(mocks.get).toHaveBeenCalledWith("owner@example.com");
    await PATCH(new Request("http://localhost/api/spaces/preferences", { method: "PATCH", body: JSON.stringify({ action: "track", modelKey: "model", expectedRevision: 4 }) }));
    expect(mocks.update).toHaveBeenCalledWith("owner@example.com", { action: "track", modelKey: "model", expectedRevision: 4 });
  });
});
