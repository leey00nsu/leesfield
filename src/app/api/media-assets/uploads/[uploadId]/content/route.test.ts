import { beforeEach, describe, expect, it, vi } from "vitest";

const mockGetSession = vi.hoisted(() => vi.fn());
const service = vi.hoisted(() => ({ relayUpload: vi.fn() }));

vi.mock("@/server/auth/session", () => ({ getSession: mockGetSession }));
vi.mock("@/server/media-assets/media-asset-service", () => ({ mediaAssetService: service }));

import { PUT } from "./route";

describe("PUT /api/media-assets/uploads/[uploadId]/content", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    mockGetSession.mockResolvedValue({ isLoggedIn: true, adminEmail: "owner@example.com" });
  });

  it("requires an authenticated owner", async () => {
    mockGetSession.mockResolvedValue({ isLoggedIn: false });
    const response = await PUT(
      new Request("http://localhost/api/media-assets/uploads/upload_1/content", { method: "PUT" }),
      { params: Promise.resolve({ uploadId: "upload_1" }) },
    );
    expect(response.status).toBe(401);
    expect(service.relayUpload).not.toHaveBeenCalled();
  });

  it("streams the body through the owner-scoped relay service", async () => {
    const body = new Uint8Array([1, 2, 3]);
    const response = await PUT(
      new Request("http://localhost/api/media-assets/uploads/upload_1/content?target=https%3A%2F%2Faccount.r2.cloudflarestorage.com%2Fobject%3FX-Amz-Signature%3Dsigned", {
        method: "PUT",
        headers: { "Content-Type": "image/png", "Content-Length": "3" },
        body,
      }),
      { params: Promise.resolve({ uploadId: "upload_1" }) },
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ uploaded: true });
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(service.relayUpload).toHaveBeenCalledWith(
      "owner@example.com",
      "upload_1",
      "https://account.r2.cloudflarestorage.com/object?X-Amz-Signature=signed",
      expect.any(ReadableStream),
      "image/png",
      "3",
    );
  });
});
