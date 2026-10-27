// @vitest-environment node
import { beforeEach, expect, it, vi } from "vitest";
vi.hoisted(() => vi.resetModules());
const mocks = vi.hoisted(() => ({ find: vi.fn(), update: vi.fn(), remove: vi.fn(), queue: vi.fn(), usage: vi.fn(), covers: vi.fn() }));
vi.mock("@/server/db/prisma", () => ({ prisma: {
  mediaAsset: { findMany: mocks.find },
  $transaction: vi.fn(async callback => callback({ $executeRaw: vi.fn(), $queryRaw: vi.fn(),
    assetProject: { findMany: mocks.covers }, mediaAsset: { update: mocks.update }, mediaCleanupTask: {} })),
} }));
vi.mock("@/server/media-assets/leemage-media-storage", () => ({ deleteHistoryStorageFile: mocks.remove }));
vi.mock("@/server/media-assets/media-cleanup-repository", () => ({ isCleanupClient: () => true, queueStorageCleanup: mocks.queue }));
vi.mock("@/server/media-assets/media-asset-repository", () => ({ mediaAssetRepository: { getAssetUsage: mocks.usage } }));
import { deleteHistoryFiles } from "./delete-history-files";
const asset = { id: "asset", status: "completed", storageProvider: "leemage", storageObjectId: "file", storageUrl: "https://store/a", legacyUrl: null };
beforeEach(() => {
  vi.clearAllMocks(); mocks.covers.mockResolvedValue([]);
  mocks.usage.mockResolvedValue({ graphIds: [], operationIds: [], generationRequestIds: [] });
  mocks.find.mockResolvedValue([asset]); mocks.update.mockResolvedValue({}); mocks.queue.mockResolvedValue({ id: "cleanup" });
});
it("marks the file deleting and durably queues physical deletion", async () => {
  await deleteHistoryFiles("owner", [{ id: "row", assetId: "asset", url: asset.storageUrl }]);
  expect(mocks.find).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ ownerEmail: "owner" }) }));
  expect(mocks.update).toHaveBeenCalledExactlyOnceWith({ where: { id: "asset" }, data: { status: "deleting" } });
  expect(mocks.queue).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ assetId: "asset", reason: "history_delete", storageObjectId: "file" }));
  expect(mocks.remove).not.toHaveBeenCalled();
});
it("rejects a queue registration failure without deleting the remote file", async () => {
  mocks.queue.mockRejectedValueOnce(new Error("QUEUE_UNAVAILABLE"));
  await expect(deleteHistoryFiles("owner", [{ id: "row", assetId: "asset" }])).rejects.toThrow("QUEUE_UNAVAILABLE");
  expect(mocks.remove).not.toHaveBeenCalled();
});
it("skips tombstones and queues legacy URL cleanup without an asset", async () => {
  mocks.find.mockResolvedValue([{ ...asset, status: "failed", storageUrl: null }]);
  await deleteHistoryFiles("owner", [{ id: "r", assetId: "asset" }, { id: "legacy", url: "https://store/old" }]);
  expect(mocks.queue).toHaveBeenCalledExactlyOnceWith(undefined, expect.objectContaining({ storageProvider: "legacy_url", storageUrl: "https://store/old" }));
  expect(mocks.remove).not.toHaveBeenCalled(); expect(mocks.update).not.toHaveBeenCalled();
});
it("rejects actual reuse before recording deletion intent", async () => {
  mocks.usage.mockResolvedValue({ graphIds: ["space"], operationIds: [], generationRequestIds: [] });
  await expect(deleteHistoryFiles("owner", [{ id: "row", assetId: "asset" }])).rejects.toThrow("MEDIA_ASSET_IN_USE");
  expect(mocks.remove).not.toHaveBeenCalled(); expect(mocks.update).not.toHaveBeenCalled();
});
it("checks a newly assigned project cover under the deletion transaction", async () => {
  mocks.covers.mockResolvedValue([{ id: "project" }]);
  await expect(deleteHistoryFiles("owner", [{ id: "row", assetId: "asset" }])).rejects.toMatchObject({ projectCoverIds: ["project"] });
  expect(mocks.update).not.toHaveBeenCalled(); expect(mocks.remove).not.toHaveBeenCalled();
});
