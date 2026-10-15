import {beforeEach, expect, it, vi} from "vitest";
const mocks=vi.hoisted(()=>({find:vi.fn(),update:vi.fn(),remove:vi.fn(),queue:vi.fn(),complete:vi.fn(),usage:vi.fn(),restore:vi.fn(),covers:vi.fn()}));
vi.mock("@/server/db/prisma",()=>({prisma:{mediaAsset:{findMany:mocks.find},$transaction:vi.fn(async (callback: (tx: unknown)=>unknown)=>callback({$queryRaw:vi.fn(),assetProject:{findMany:mocks.covers},mediaAsset:{update:mocks.update},mediaCleanupTask:{}}))}}));
vi.mock("@/server/media-assets/leemage-media-storage",()=>({deleteHistoryStorageFile:mocks.remove}));
vi.mock("@/server/media-assets/media-cleanup-repository",()=>({isCleanupClient:()=>true,queueStorageCleanup:mocks.queue,completeStorageCleanup:mocks.complete}));
vi.mock("@/server/media-assets/media-asset-repository",()=>({mediaAssetRepository:{getAssetUsage:mocks.usage,restoreAsset:mocks.restore}}));
import {deleteHistoryFiles} from "./delete-history-files";
const asset={id:"asset",status:"completed",storageProvider:"leemage",storageObjectId:"file",storageUrl:"https://store/a",legacyUrl:null};
beforeEach(()=>{vi.resetAllMocks();mocks.covers.mockResolvedValue([]);mocks.usage.mockResolvedValue({graphIds:[],operationIds:[],generationRequestIds:[]});mocks.find.mockResolvedValue([asset]);mocks.update.mockResolvedValue({});mocks.queue.mockResolvedValue({id:"cleanup"});mocks.complete.mockResolvedValue({count:1});mocks.remove.mockResolvedValue(undefined);});
it("deletes the storage object and retains a missing identity for graph references",async()=>{await deleteHistoryFiles("owner",[{id:"row",assetId:"asset",url:asset.storageUrl}]);expect(mocks.find).toHaveBeenCalledWith(expect.objectContaining({where:expect.objectContaining({ownerEmail:"owner"})}));expect(mocks.remove).toHaveBeenCalledExactlyOnceWith("file",asset.storageUrl);expect(mocks.update).toHaveBeenLastCalledWith(expect.objectContaining({data:expect.objectContaining({status:"failed",storageUrl:null,legacyUrl:null})}));});
it("keeps the deletion intent retryable when remote deletion fails",async()=>{mocks.remove.mockRejectedValue(new Error("network"));await expect(deleteHistoryFiles("owner",[{id:"row",assetId:"asset"}])).rejects.toThrow("network");expect(mocks.update).toHaveBeenCalledWith({where:{id:"asset"},data:{status:"deleting"}});expect(mocks.complete).not.toHaveBeenCalled();});
it("skips tombstones on retry and resolves legacy URLs without an asset",async()=>{mocks.find.mockResolvedValue([{...asset,status:"failed",storageUrl:null}]);await deleteHistoryFiles("owner",[{id:"r",assetId:"asset"},{id:"legacy",url:"https://store/old"}]);expect(mocks.remove).toHaveBeenCalledExactlyOnceWith(null,"https://store/old");});

it("rejects an actual reuse before storage work and restores a late reference race",async()=>{
  mocks.usage.mockResolvedValue({graphIds:["space"],operationIds:[],generationRequestIds:[]});
  await expect(deleteHistoryFiles("owner",[{id:"row",assetId:"asset"}])).rejects.toThrow("MEDIA_ASSET_IN_USE");
  expect(mocks.remove).not.toHaveBeenCalled(); expect(mocks.update).not.toHaveBeenCalled();
  mocks.usage.mockResolvedValueOnce({graphIds:[],operationIds:[],generationRequestIds:[]}).mockResolvedValueOnce({graphIds:[],operationIds:[],generationRequestIds:["consumer"]});
  await expect(deleteHistoryFiles("owner",[{id:"row",assetId:"asset"}])).rejects.toThrow("MEDIA_ASSET_IN_USE");
  expect(mocks.restore).toHaveBeenCalledWith("owner","asset"); expect(mocks.remove).not.toHaveBeenCalled();
});
it("blocks a newly assigned project cover before recording deletion intent",async()=>{
  mocks.covers.mockResolvedValue([{id:"project"}]);
  await expect(deleteHistoryFiles("owner",[{id:"row",assetId:"asset"}])).rejects.toMatchObject({projectCoverIds:["project"]});
  expect(mocks.update).not.toHaveBeenCalled();
  expect(mocks.remove).not.toHaveBeenCalled();
});
