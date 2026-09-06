import { beforeEach, describe, expect, it, vi } from "vitest";

const mockGetSession = vi.hoisted(() => vi.fn());
const service = vi.hoisted(() => ({ createUpload: vi.fn() }));

vi.mock("@/server/auth/session", () => ({ getSession: mockGetSession }));
vi.mock("@/server/media-assets/media-asset-service", () => ({ mediaAssetService: service }));

import { MediaFileTooLargeError, MediaStorageUnavailableError } from "@/server/media-assets/media-asset-errors";
import { POST } from "./route";

describe("POST /api/media-assets/uploads", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    mockGetSession.mockResolvedValue({ isLoggedIn: true, adminEmail: "owner@example.com" });
  });

  it("requires an authenticated owner", async () => {
    mockGetSession.mockResolvedValue({ isLoggedIn: false });
    const response = await POST(new Request("http://localhost/api/media-assets/uploads"));
    expect(response.status).toBe(401);
    expect(service.createUpload).not.toHaveBeenCalled();
  });

  it("creates a no-store direct upload session in the owner scope", async () => {
    service.createUpload.mockResolvedValue({ id: "upload_1", status: "pending" });
    const body = {
      intendedType: "image",
      fileName: "image.png",
      declaredMimeType: "image/png",
      declaredBytes: 33,
    };
    const response = await POST(
      new Request("http://localhost/api/media-assets/uploads", {
        method: "POST",
        body: JSON.stringify(body),
      }),
    );
    expect(response.status).toBe(201);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(service.createUpload).toHaveBeenCalledWith("owner@example.com", body);
  });

  it("maps file limits without leaking an internal storage error", async () => {
    service.createUpload.mockRejectedValue(new MediaFileTooLargeError(100));
    const response = await POST(
      new Request("http://localhost/api/media-assets/uploads", {
        method: "POST",
        body: JSON.stringify({}),
      }),
    );
    expect(response.status).toBe(413);
    await expect(response.json()).resolves.toEqual({
      message: "MEDIA_FILE_TOO_LARGE",
      maxBytes: 100,
    });
  });

  it.each([
    [{ stage: "presign", reason: "permission", upstreamStatus: 403 }, "presign", "permission", 403],
    [undefined, "unknown", "unknown", null],
  ] as const)("prints readable safe storage diagnostics without changing the public response", async (diagnostic, stage, reason, upstreamStatus) => {
    service.createUpload.mockRejectedValue(new MediaStorageUnavailableError(diagnostic));
    const response = await POST(new Request("http://localhost/api/media-assets/uploads", {
      method: "POST", body: JSON.stringify({ fileName: "private-name.png" }),
    }));
    expect(console.error).toHaveBeenCalledWith(`[media-assets] create upload failed ${JSON.stringify({
      code: "MEDIA_STORAGE_UNAVAILABLE", stage, reason, upstreamStatus,
    })}`);
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({ message: "MEDIA_STORAGE_UNAVAILABLE" });
  });
});
