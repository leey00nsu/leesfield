import { beforeEach, describe, expect, it, vi } from "vitest";

const mockGetSession = vi.hoisted(() => vi.fn());
const service = vi.hoisted(() => ({ get: vi.fn() }));

vi.mock("@/server/auth/session", () => ({ getSession: mockGetSession }));
vi.mock("@/server/media-assets/media-asset-service", () => ({ mediaAssetService: service }));

import { GET } from "./route";

const context = { params: Promise.resolve({ assetId: "asset_1" }) };
const asset = {
  id: "asset_1",
  version: 1,
  type: "image" as const,
  status: "completed" as const,
  origin: "upload" as const,
  mimeType: "image/png",
  bytes: "4",
  width: 1,
  height: 1,
  durationMs: null,
  sourceOperationId: null,
  url: "https://assets.example/source.png",
  createdAt: "2026-09-04T00:00:00.000Z",
  updatedAt: "2026-09-04T00:00:00.000Z",
};

describe("/api/media-assets/:assetId/content", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    mockGetSession.mockResolvedValue({ isLoggedIn: true, adminEmail: "owner@example.com" });
    service.get.mockResolvedValue(asset);
  });

  it("streams owner-scoped media through a same-origin no-store response", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(
      new Uint8Array([1, 2, 3, 4]),
      { status: 200, headers: { "Content-Type": "image/png", "Content-Length": "4" } },
    ));

    const response = await GET(new Request("http://localhost/api/media-assets/asset_1/content"), context);

    expect(service.get).toHaveBeenCalledWith("owner@example.com", "asset_1");
    expect(fetchMock).toHaveBeenCalledWith(asset.url, expect.objectContaining({
      cache: "no-store",
      redirect: "follow",
    }));
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("image/png");
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
    await expect(response.arrayBuffer()).resolves.toEqual(new Uint8Array([1, 2, 3, 4]).buffer);
  });

  it("does not resolve or fetch media for an unauthenticated request", async () => {
    mockGetSession.mockResolvedValue({ isLoggedIn: false, adminEmail: null });
    const fetchMock = vi.spyOn(globalThis, "fetch");

    const response = await GET(new Request("http://localhost/api/media-assets/asset_1/content"), context);

    expect(response.status).toBe(401);
    expect(service.get).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns an explicit gateway failure when storage content cannot be read", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 404 }));

    const response = await GET(new Request("http://localhost/api/media-assets/asset_1/content"), context);

    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toEqual({ message: "MEDIA_ASSET_CONTENT_FETCH_FAILED" });
  });
});
