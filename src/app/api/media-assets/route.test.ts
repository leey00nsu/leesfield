import { beforeEach, describe, expect, it, vi } from "vitest";

const getSession = vi.hoisted(() => vi.fn());
const list = vi.hoisted(() => vi.fn());

vi.mock("@/server/auth/session", () => ({ getSession }));
vi.mock("@/server/media-assets/media-asset-service", () => ({
  mediaAssetService: { list },
}));

import { GET } from "./route";

describe("GET /api/media-assets", () => {
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
