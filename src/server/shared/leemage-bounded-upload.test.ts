// @vitest-environment node

import { describe, expect, it, vi } from "vitest";

const mockRequestRemote = vi.hoisted(() => vi.fn());
const cleanupMocks = vi.hoisted(() => ({
  cleanupUploadRetryAt: vi.fn(() => new Date("2026-09-16T00:15:00.000Z")),
  createStorageCleanupIntent: vi.fn().mockResolvedValue({ id: "cleanup" }),
  queueStorageCleanup: vi.fn().mockResolvedValue({ id: "cleanup" }),
}));

vi.mock("@/server/http/safe-remote", () => ({
  requestRemote: mockRequestRemote,
}));
vi.mock("@/server/media-assets/media-cleanup-repository", () => cleanupMocks);

import { uploadLeemageFile } from "./leemage-bounded-upload";

describe("Leemage bounded upload", () => {
  it("uses the low-level presign/PUT/confirm flow with a byte and time bounded PUT", async () => {
    mockRequestRemote.mockResolvedValue({
      status: 200,
      headers: {},
      body: Buffer.alloc(0),
    });
    const presign = vi.fn().mockResolvedValue({
      presignedUrl: "https://upload.example/signed",
      objectName: "project/file.png",
      fileId: "file-1",
    });
    const confirm = vi.fn().mockResolvedValue({
      file: { id: "file-1", url: "https://cdn.example/file.png" },
    });
    const client = { files: { presign, confirm } };
    const file = {
      name: "file.png",
      type: "image/png",
      size: 3,
      arrayBuffer: async () => Uint8Array.from([1, 2, 3]).buffer,
    };

    await expect(
      uploadLeemageFile(client, "project", file, {
        variants: [{ sizeLabel: "source", format: "webp" }],
      }),
    ).resolves.toEqual({ id: "file-1", url: "https://cdn.example/file.png" });

    expect(mockRequestRemote).toHaveBeenCalledWith(
      "https://upload.example/signed",
      expect.objectContaining({
        method: "PUT",
        timeoutMs: 120_000,
        maxRedirects: 0,
        maxBytes: 1024 * 1024,
        headers: {
          "Content-Type": "image/png",
          "Content-Length": "3",
        },
      }),
    );
    expect(confirm).toHaveBeenCalledWith("project", expect.objectContaining({
      fileId: "file-1",
      objectName: "project/file.png",
      fileSize: 3,
      variants: [{ sizeLabel: "source", format: "webp" }],
    }));
  });

  it("does not confirm when the bounded upload fails", async () => {
    mockRequestRemote.mockRejectedValueOnce(new Error("timeout"));
    const presign = vi.fn().mockResolvedValue({
      presignedUrl: "https://upload.example/signed",
      objectName: "project/file.png",
      fileId: "file-1",
    });
    const confirm = vi.fn();
    const client = { files: { presign, confirm } };
    const file = {
      name: "file.png",
      type: "image/png",
      size: 1,
      arrayBuffer: async () => Uint8Array.from([1]).buffer,
    };

    await expect(uploadLeemageFile(client, "project", file)).rejects.toThrow("timeout");
    expect(confirm).not.toHaveBeenCalled();
  });

  it("registers the object before PUT and queues it when confirmation fails", async () => {
    const events: string[] = [];
    cleanupMocks.createStorageCleanupIntent.mockImplementation(async () => {
      events.push("register");
      return { id: "cleanup" };
    });
    mockRequestRemote.mockImplementation(async () => {
      events.push("put");
      return { status: 200, headers: {}, body: Buffer.alloc(0) };
    });
    const presign = vi.fn().mockResolvedValue({
      presignedUrl: "https://upload.example/signed",
      objectName: "project/file.png",
      fileId: "file-2",
      objectUrl: "https://storage.example/file-2",
      expiresAt: "2026-09-16T00:10:00.000Z",
    });
    const confirm = vi.fn().mockRejectedValue(new Error("confirm failed"));
    const client = { files: { presign, confirm, delete: vi.fn() } };
    const file = {
      name: "file.png",
      type: "image/png",
      size: 1,
      arrayBuffer: async () => Uint8Array.from([1]).buffer,
    };

    await expect(
      uploadLeemageFile(client, "project", file, {
        cleanup: { requestId: "request-2", reason: "generation_output" },
      }),
    ).rejects.toThrow("confirm failed");

    expect(events).toEqual(["register", "put"]);
    expect(cleanupMocks.queueStorageCleanup).toHaveBeenCalledWith(
      undefined,
      expect.objectContaining({
        requestId: "request-2",
        storageObjectId: "file-2",
        reason: "generation_output",
        retryAt: expect.any(Date),
      }),
    );
    expect(client.files.delete).not.toHaveBeenCalled();
  });
});
