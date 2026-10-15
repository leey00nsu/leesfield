import { beforeEach, describe, expect, it, vi } from "vitest";

const getSession = vi.hoisted(() => vi.fn());
const list = vi.hoisted(() => vi.fn());
const models = vi.hoisted(() => vi.fn());
vi.mock("@/server/media-assets/asset-library-search", () => ({ findAssetModelOptions: models }));

vi.mock("@/server/auth/session", () => ({ getSession }));
vi.mock("@/server/media-assets/media-asset-service", () => ({
  mediaAssetService: { list },
}));

import { GET } from "./route";
import { GET as GETModels } from "./models/route";

describe("GET /api/media-assets", () => {
  it("passes metadata/date/model filters to the authenticated owner", async () => {
    getSession.mockResolvedValue({ isLoggedIn: true, adminEmail: "owner@example.com" });
    list.mockResolvedValue({ items: [], nextCursor: null });
    const params = { classification: "none", managementStatus: "active", dateFrom: "2026-10-12T15:00:00.000Z", dateTo: "2026-10-13T15:00:00.000Z", model: "past-model" };
    expect((await GET(new Request("http://localhost/api/media-assets?" + new URLSearchParams(params)))).status).toBe(200);
    expect(list).toHaveBeenLastCalledWith("owner@example.com", params);
  });
  it("protects model options and returns only the owner query result", async () => {
    getSession.mockResolvedValue({ isLoggedIn: false });
    expect((await GETModels()).status).toBe(401);
    expect(models).not.toHaveBeenCalled();
    getSession.mockResolvedValue({ isLoggedIn: true, adminEmail: "owner@example.com" });
    models.mockResolvedValue(["past-model"]);
    const result = await GETModels();
    expect(await result.json()).toEqual({ models: ["past-model"] });
    expect(models).toHaveBeenCalledWith("owner@example.com");
  });
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  it("requires an authenticated owner", async () => {
    getSession.mockResolvedValue({ isLoggedIn: false });
    const response = await GET(new Request("http://localhost/api/media-assets?type=image"));
    expect(response.status).toBe(401);
    expect(list).not.toHaveBeenCalled();
  });

  it("passes the media cursor query through the owner scope", async () => {
    getSession.mockResolvedValue({ isLoggedIn: true, adminEmail: "owner@example.com" });
    list.mockResolvedValue({ items: [], nextCursor: null });
    const response = await GET(new Request(
      "http://localhost/api/media-assets?type=audio&cursor=asset_1&limit=12",
    ));
    expect(response.status).toBe(200);
    expect(list).toHaveBeenCalledWith("owner@example.com", {
      type: "audio",
      cursor: "asset_1",
      limit: "12",
    });
  });
});
