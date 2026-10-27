// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
const session = vi.hoisted(() => vi.fn());
vi.mock("@/server/auth/session", () => ({ getSession: session }));
import { handleAssetOrganizationRequest } from "./asset-organization-http";
import { AssetMetadataConflictError, AssetOrganizationNotFoundError, MediaAssetInputError } from "./media-asset-errors";

describe("asset organization HTTP boundary", () => {
  beforeEach(() => { vi.clearAllMocks(); session.mockResolvedValue({ isLoggedIn: true, adminEmail: "owner@example.com" }); vi.spyOn(console, "error").mockImplementation(() => undefined); });
  it("never invokes writes for unauthenticated or cross-origin mutations", async () => {
    const action = vi.fn();
    session.mockResolvedValueOnce({ isLoggedIn: false });
    expect((await handleAssetOrganizationRequest(new Request("http://localhost/api/media-assets/tags", { method: "POST", body: "{}" }), action)).status).toBe(401);
    expect((await handleAssetOrganizationRequest(new Request("http://localhost/api/media-assets/tags", { method: "POST", headers: { origin: "https://evil.example", cookie: "leesfield_session=test" }, body: "{}" }), action)).status).toBe(403);
    expect(action).not.toHaveBeenCalled();
  });
  it("rejects malformed JSON before writes and forwards only the logged-in owner", async () => {
    const action = vi.fn().mockResolvedValue({ tag: { id: "tag_1" } });
    expect((await handleAssetOrganizationRequest(new Request("http://localhost/api/media-assets/tags", { method: "POST", body: "bad-json" }), action)).status).toBe(400);
    expect(action).not.toHaveBeenCalled();
    const result = await handleAssetOrganizationRequest(new Request("http://localhost/api/media-assets/tags", { method: "POST", body: JSON.stringify({ name: "Hero" }) }), action, 201);
    expect(result.status).toBe(201);
    expect(result.headers.get("cache-control")).toBe("no-store");
    expect(action).toHaveBeenCalledWith("owner@example.com", { name: "Hero" });
  });
  it.each([
    [new AssetMetadataConflictError("ASSET_VERSION_CONFLICT"), 409],
    [new AssetOrganizationNotFoundError(), 404],
    [new MediaAssetInputError({ name: "invalid" }), 400],
    [new Error("private database secret"), 500],
  ])("maps expected failures without exposing internal details", async (error, status) => {
    const result = await handleAssetOrganizationRequest(new Request("http://localhost/api/media-assets/tags", { method: "POST", body: "{}" }), async () => { throw error; });
    expect(result.status).toBe(status);
    expect(await result.text()).not.toContain("private database secret");
  });
});
