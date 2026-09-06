import { beforeEach, describe, expect, it, vi } from "vitest";

const mockGetSession = vi.hoisted(() => vi.fn());
const service = vi.hoisted(() => ({ confirmUpload: vi.fn() }));

vi.mock("@/server/auth/session", () => ({ getSession: mockGetSession }));
vi.mock("@/server/media-assets/media-asset-service", () => ({ mediaAssetService: service }));

import {
  MediaUploadNotFoundError,
  MediaVerificationError,
} from "@/server/media-assets/media-asset-errors";
import { POST } from "./route";

const context = { params: Promise.resolve({ uploadId: "upload_1" }) };

describe("POST /api/media-assets/uploads/:uploadId/confirm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    mockGetSession.mockResolvedValue({ isLoggedIn: true, adminEmail: "owner@example.com" });
  });

  it("confirms only through the authenticated owner scope", async () => {
    service.confirmUpload.mockResolvedValue({ id: "asset_1", status: "completed" });
    const response = await POST(
      new Request("http://localhost/api/media-assets/uploads/upload_1/confirm", {
        method: "POST",
        body: "{}",
      }),
      context,
    );
    expect(response.status).toBe(200);
    expect(service.confirmUpload).toHaveBeenCalledWith(
      "owner@example.com",
      "upload_1",
      {},
    );
  });

  it("uses the same 404 for absent and cross-owner upload ids", async () => {
    service.confirmUpload.mockRejectedValue(new MediaUploadNotFoundError());
    const response = await POST(
      new Request("http://localhost/api/media-assets/uploads/foreign/confirm", {
        method: "POST",
        body: "{}",
      }),
      { params: Promise.resolve({ uploadId: "foreign" }) },
    );
    expect(response.status).toBe(404);
    expect((await response.json()).message).toBe("MEDIA_UPLOAD_NOT_FOUND");
  });

  it("maps server-side MIME verification failures to 422", async () => {
    service.confirmUpload.mockRejectedValue(new MediaVerificationError("MEDIA_MIME_MISMATCH"));
    const response = await POST(
      new Request("http://localhost/api/media-assets/uploads/upload_1/confirm", {
        method: "POST",
        body: "{}",
      }),
      context,
    );
    expect(response.status).toBe(422);
    expect((await response.json()).message).toBe("MEDIA_MIME_MISMATCH");
  });
});
