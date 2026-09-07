import { afterEach, describe, expect, it, vi } from "vitest";

const originalEnv = {
  LEEMAGE_API_KEY: process.env.LEEMAGE_API_KEY,
  LEEMAGE_PROJECT_ID: process.env.LEEMAGE_PROJECT_ID,
  LEEMAGE_BASE_URL: process.env.LEEMAGE_BASE_URL,
};

function restoreEnv() {
  for (const [key, value] of Object.entries(originalEnv)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

describe("leemageMediaStorageAdapter", () => {
  afterEach(() => {
    restoreEnv();
    vi.resetModules();
    vi.clearAllMocks();
    vi.unmock("leemage-sdk");
  });

  it("shares concurrent fallback reads and releases completed or failed requests", async () => {
    let release!: (value: unknown) => void;
    const get = vi.fn().mockImplementation(() => new Promise(resolve => { release = resolve; }));
    vi.doMock("leemage-sdk", () => ({ LeemageClient: class { projects = { get }; } }));
    process.env.LEEMAGE_API_KEY = "key"; process.env.LEEMAGE_PROJECT_ID = "project";
    const { leemageMediaStorageAdapter: storage } = await import("./leemage-media-storage");
    const a = storage.resolveReadUrl("a", null);
    const b = storage.resolveReadUrl("b", null);
    expect(get).toHaveBeenCalledTimes(1);
    release({ files: [{ id: "a", url: "https://read/a", variants: [] }, { id: "b", url: null, variants: [{ url: "https://read/large", width: 1024, height: 1024 }, { url: "https://read/small", width: 256, height: 256 }] }] });
    await expect(a).resolves.toBe("https://read/a");
    await expect(b).resolves.toBe("https://read/large");
    get.mockRejectedValueOnce(new Error("offline"));
    await expect(storage.resolveReadUrl("a", null)).rejects.toThrow("offline");
    get.mockResolvedValueOnce({ files: [{ id: "a", url: "https://read/refreshed", variants: [] }] });
    await expect(storage.resolveReadUrl("a", null)).resolves.toBe("https://read/refreshed");
    expect(get).toHaveBeenCalledTimes(3);
  });

  it("fails before Graph media work when durable storage is unavailable", async () => {
    delete process.env.LEEMAGE_API_KEY;
    delete process.env.LEEMAGE_PROJECT_ID;
    const { leemageMediaStorageAdapter } = await import("./leemage-media-storage");
    expect(() => leemageMediaStorageAdapter.assertAvailable()).toThrow(
      "MEDIA_STORAGE_UNAVAILABLE",
    );
  });

  it("keeps the Leemage file id as identity across presign, confirm, read, and delete", async () => {
    const presign = vi.fn().mockResolvedValue({
      fileId: "file_1",
      objectName: "project/file_1.png",
      objectUrl: "https://storage.example/file_1",
      presignedUrl: "https://upload.example/file_1",
      expiresAt: "2026-09-03T10:15:00.000Z",
    });
    const confirm = vi.fn().mockResolvedValue({
      file: {
        id: "file_1",
        mimeType: "image/png",
        size: 33,
        url: null,
        variants: [{ url: "https://read.example/file_1" }],
      },
    });
    const remove = vi.fn().mockResolvedValue({ message: "ok" });
    const get = vi.fn().mockResolvedValue({
      files: [{ id: "file_1", url: "https://read.example/file_1", variants: [] }],
    });
    vi.doMock("leemage-sdk", () => ({
      LeemageClient: class {
        files = { presign, confirm, delete: remove };
        projects = { get };
      },
    }));
    process.env.LEEMAGE_API_KEY = "test-key";
    process.env.LEEMAGE_PROJECT_ID = "project_1";
    process.env.LEEMAGE_BASE_URL = "https://leemage.example";

    const { leemageMediaStorageAdapter } = await import("./leemage-media-storage");
    const original = { fileName: "스크린샷.png".normalize("NFD"), mimeType: "image/png", bytes: 33 };
    const signed = await leemageMediaStorageAdapter.presign(original);
    expect(signed).toMatchObject({ objectId: "file_1", fileName: expect.stringMatching(/^leesfield-[a-f0-9]{64}\.png$/) });
    expect(original.fileName).toBe("스크린샷.png".normalize("NFD"));
    // A separate module/client must be able to confirm from persisted session data.
    vi.resetModules();
    const reloaded = (await import("./leemage-media-storage")).leemageMediaStorageAdapter;
    await expect(
      reloaded.confirm({
        objectId: "file_1",
        objectName: "project/file_1.png",
        fileName: signed.fileName!,
        mimeType: "image/png",
        bytes: 33,
        objectUrl: "https://storage.example/file_1",
      }),
    ).resolves.toMatchObject({
      objectId: "file_1",
      mimeType: "image/png",
      bytes: 33,
      url: "https://storage.example/file_1",
    });
    await expect(
      leemageMediaStorageAdapter.resolveReadUrl("file_1", null),
    ).resolves.toBe("https://read.example/file_1");
    await leemageMediaStorageAdapter.delete("file_1");

    expect(presign).toHaveBeenCalledWith("project_1", expect.objectContaining({ fileSize: 33, fileName: signed.fileName }));
    expect(confirm).toHaveBeenCalledWith("project_1", expect.objectContaining({ fileId: "file_1", fileName: signed.fileName, variants: [{sizeLabel: "source", format: "webp"}] }));
    expect(remove).toHaveBeenCalledWith("project_1", "file_1");
  });
});
