import { beforeEach, describe, expect, it, vi } from "vitest";

const mockGetSession = vi.hoisted(() => vi.fn());
const service = vi.hoisted(() => ({ get: vi.fn(), remove: vi.fn() }));

vi.mock("@/server/auth/session", () => ({ getSession: mockGetSession }));
vi.mock("@/server/media-assets/media-asset-service", () => ({ mediaAssetService: service }));

import { MediaAssetInUseError } from "@/server/media-assets/media-asset-errors";
import { DELETE, GET } from "./route";

const context = { params: Promise.resolve({ assetId: "asset_1" }) };

describe("/api/media-assets/:assetId", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    mockGetSession.mockResolvedValue({ isLoggedIn: true, adminEmail: "owner@example.com" });
  });

  it("reads an asset through its owner scope", async () => {
    service.get.mockResolvedValue({ id: "asset_1", status: "completed" });
    const response = await GET(new Request("http://localhost"), context);
    expect(response.status).toBe(200);
    expect(service.get).toHaveBeenCalledWith("owner@example.com", "asset_1");
  });

  it("returns affected Graph ids when delete is blocked", async () => {
    service.remove.mockRejectedValue(new MediaAssetInUseError(["graph_1", "graph_2"]));
    const response = await DELETE(new Request("http://localhost", { method: "DELETE" }), context);
    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      message: "MEDIA_ASSET_IN_USE",
      graphIds: ["graph_1", "graph_2"],
      operationIds: [],
    });
  });
});
