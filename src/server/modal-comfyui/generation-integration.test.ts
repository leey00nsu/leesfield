// @vitest-environment node
import {afterEach,describe,it,expect,vi} from "vitest";
const mocks=vi.hoisted(()=>({catalog:vi.fn(),image:vi.fn(),video:vi.fn(),hf:vi.fn(),imageStore:vi.fn(),videoStore:vi.fn()}));
vi.mock("@/server/model-catalog/catalog-service",()=>({getModelCatalog:mocks.catalog}));
vi.mock("@/server/image-generation/adapters/modal-comfyui-adapter",()=>({modalComfyImageAdapter:{generate:mocks.image}}));
vi.mock("@/server/video-generation/adapters/modal-comfyui-adapter",()=>({modalComfyVideoAdapter:{generate:mocks.video}}));
vi.mock("@/server/video-generation/adapters/hf-space-adapter",()=>({hfSpaceVideoAdapter:{generate:mocks.hf}}));
vi.mock("@/server/image-generation/storage/storage-selector",()=>({resolveImageStorageProvider:()=>({provider:"leemage"})}));
vi.mock("@/server/video-generation/storage/storage-selector",()=>({resolveVideoStorageProvider:()=>({provider:"leemage"})}));
vi.mock("@/server/image-generation/storage/adapters/leemage-storage-adapter",()=>({leemageStorageAdapter:{uploadImages:mocks.imageStore}}));
vi.mock("@/server/video-generation/storage/adapters/leemage-storage-adapter",()=>({leemageVideoStorageAdapter:{uploadVideos:mocks.videoStore}}));
import {resolveImageGenerationResult} from "@/server/image-generation/image-generation";
import {resolveVideoGenerationResult} from "@/server/video-generation/video-generation";
afterEach(()=>vi.resetAllMocks());
describe("Modal generation and storage integration",()=>{
 it("routes image with request ID and actual output dimensions to durable storage",async()=>{
  mocks.catalog.mockResolvedValue([{type:"image",key:"modal",provider:"modal_comfyui"}]);
  mocks.image.mockResolvedValue({images:["data:one","data:two"],meta:{width:512,height:768}});
  mocks.imageStore.mockResolvedValue({status:"completed",artifacts:[{storageObjectId:"1"},{storageObjectId:"2"}]});
  const payload={model:"modal",prompt:"x",width:1024,height:1024,imageCount:1,steps:8};
  expect((await resolveImageGenerationResult(payload,"req")).status).toBe("completed");
  expect(mocks.image).toHaveBeenCalledWith(payload,{requestId:"req"});
  expect(mocks.imageStore).toHaveBeenCalledWith(expect.objectContaining({width:512,height:768,imageCount:2}),"req",["data:one","data:two"]);
 });
 it("routes video from catalog and preserves actual duration metadata",async()=>{
  mocks.catalog.mockResolvedValue([{type:"video",key:"modal",provider:"modal_comfyui"}]);
  const meta={width:1344,height:768,duration_sec:124/24};
  mocks.video.mockResolvedValue({videos:["data:video"],meta});
  mocks.videoStore.mockResolvedValue({status:"completed",artifacts:[{storageObjectId:"v"}]});
  const payload={model:"modal",prompt:"x",durationSec:3,steps:8,guidanceScale:1,aspectRatio:"16:9",resolution:720,fps:24};
  expect((await resolveVideoGenerationResult(payload,"req")).status).toBe("completed");
  expect(mocks.videoStore).toHaveBeenCalledWith(payload,"req",["data:video"],meta);
  expect(mocks.hf).not.toHaveBeenCalled();
  mocks.videoStore.mockResolvedValue({status:"completed",result:{videos:[]},errorMessage:"upload failed"});
  expect((await resolveVideoGenerationResult(payload,"req")).status).toBe("failed");
 });
 it("does not call adapters for unknown video models",async()=>{
  mocks.catalog.mockResolvedValue([]);
  const result=await resolveVideoGenerationResult({model:"missing",prompt:"x",durationSec:3,steps:8,guidanceScale:1,aspectRatio:"16:9",resolution:720,fps:24},"req");
  expect(result.status).toBe("failed");expect(mocks.hf).not.toHaveBeenCalled();
 });
});
