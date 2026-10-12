import { MediaOutputError } from "@/server/media-assets/binary-media-output";
import { loggedOperation } from "@/server/observability/logger";
import { readFileSync } from "node:fs";
const videoOutput={buffer:readFileSync("public/sample-video.mp4"),contentType:"video/mp4"};
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
afterEach(()=>{vi.resetAllMocks();vi.restoreAllMocks();});
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
  const meta={width:640,height:360,duration_sec:1,outputs:[{width:640,height:360,duration_sec:1}]};
  mocks.video.mockResolvedValue({videos:[videoOutput],meta});
  mocks.videoStore.mockResolvedValue({status:"completed",artifacts:[{storageObjectId:"v"}]});
  const payload={model:"modal",prompt:"x",durationSec:3,steps:8,guidanceScale:1,aspectRatio:"16:9",resolution:720,fps:24};
  expect((await resolveVideoGenerationResult(payload,"req")).status).toBe("completed");
  expect(mocks.videoStore).toHaveBeenCalledWith(payload,"req",[videoOutput],meta);
  expect(mocks.hf).not.toHaveBeenCalled();
  mocks.videoStore.mockResolvedValue({status:"completed",result:{videos:[]},errorMessage:"upload failed"});
  expect((await resolveVideoGenerationResult(payload,"req")).status).toBe("failed");
 });
 it("does not call adapters for unknown video models",async()=>{
  mocks.catalog.mockResolvedValue([]);
  const result=await resolveVideoGenerationResult({model:"missing",prompt:"x",durationSec:3,steps:8,guidanceScale:1,aspectRatio:"16:9",resolution:720,fps:24},"req");
  expect(result.status).toBe("failed");expect(mocks.hf).not.toHaveBeenCalled();
 });
 it.each(["hf_space","modal_comfyui"])("logs %s provider failures through the common boundary with context",async(provider)=>{
  const sink=vi.spyOn(console,"error").mockImplementation(()=>undefined);
  mocks.catalog.mockResolvedValue([{type:"video",key:"provider-model",provider}]);
  const failure=new TypeError("fetch failed",{cause:Object.assign(new Error("network private-key"),{code:"ECONNRESET"})});
  (provider==="hf_space"?mocks.hf:mocks.video).mockRejectedValue(failure);
  const payload={model:"provider-model",prompt:"private-prompt",durationSec:3,steps:8,guidanceScale:1,aspectRatio:"16:9",resolution:720,fps:24};
  expect((await resolveVideoGenerationResult(payload,"request-logging")).status).toBe("failed");
  const line=String(sink.mock.calls[0]?.[0]);
  expect(JSON.parse(line)).toMatchObject({
    event:"generation.provider_failed",requestId:"request-logging",provider,modelKey:"provider-model",phase:"provider.generate",
    error:{type:"TypeError",message:"fetch failed",cause:{code:"ECONNRESET"}},
  });
  expect(line).not.toMatch(/private-key|private-prompt/);
  expect(mocks.videoStore).not.toHaveBeenCalled();
 });
 it("distinguishes a rejected storage upload from a provider failure",async()=>{
  const sink=vi.spyOn(console,"error").mockImplementation(()=>undefined);
  mocks.catalog.mockResolvedValue([{type:"video",key:"modal",provider:"modal_comfyui"}]);
  mocks.video.mockResolvedValue({videos:[videoOutput]});
  mocks.videoStore.mockRejectedValue(new Error("LEEMAGE_CONFIRM_INVALID"));
  const payload={model:"modal",prompt:"x",durationSec:3,steps:8,guidanceScale:1,aspectRatio:"16:9",resolution:720,fps:24};
  expect((await resolveVideoGenerationResult(payload,"request-storage")).status).toBe("failed");
  expect(JSON.parse(String(sink.mock.calls[0]?.[0]))).toMatchObject({
    event:"generation.storage_failed",requestId:"request-storage",provider:"leemage",phase:"storage.upload",
    error:{code:"LEEMAGE_CONFIRM_INVALID"},
  });
 });
});

it("reports metadata failures independently from the selected generation provider", async () => {
 const sink=vi.spyOn(console,"error").mockImplementation(()=>undefined);
 mocks.catalog.mockResolvedValue([{type:"video",key:"modal",provider:"modal_comfyui"}]);
 const original=new RangeError("Maximum call stack size exceeded");
 mocks.video.mockRejectedValue(new MediaOutputError("VIDEO_METADATA_FAILED","result.metadata",{cause:original}));
 const result=await resolveVideoGenerationResult({model:"modal",prompt:"x"} as Parameters<typeof resolveVideoGenerationResult>[0],"request-metadata");
 expect(result.errorMessage).toBe("영상 메타데이터 분석에 실패했습니다. (VIDEO_METADATA_FAILED)");
 expect(JSON.parse(String(sink.mock.calls[0]?.[0]))).toMatchObject({
  event:"generation.postprocessing_failed",phase:"result.metadata",errorCode:"VIDEO_METADATA_FAILED",
  error:{cause:{type:"RangeError",message:"Maximum call stack size exceeded"}},
 });
 expect(mocks.videoStore).not.toHaveBeenCalled();
});
it("keeps confirm-stage diagnostics and storage messages instead of generic Modal failures", async () => {
 const sink=vi.spyOn(console,"error").mockImplementation(()=>undefined);
 mocks.catalog.mockResolvedValue([{type:"video",key:"modal",provider:"modal_comfyui"}]);
 mocks.video.mockResolvedValue({videos:[videoOutput]});
 const original=new Error("LEEMAGE_CONFIRM_INVALID");
 mocks.videoStore.mockImplementation(async () => {
  try { await loggedOperation({provider:"leemage",phase:"storage.confirm"},async()=>{throw original;}); }
  catch(error) { return {status:"completed",errorMessage:"old fallback",failure:{error,phase:"storage.confirm"}}; }
 });
 const result=await resolveVideoGenerationResult({model:"modal",prompt:"x"} as Parameters<typeof resolveVideoGenerationResult>[0],"request-confirm");
 expect(result.errorMessage).toBe("영상 저장에 실패했습니다. (LEEMAGE_CONFIRM_INVALID)");
 const lines=sink.mock.calls.map(call=>JSON.parse(String(call[0])));
 expect(lines).toContainEqual(expect.objectContaining({event:"generation.storage_failed",phase:"storage.confirm",errorCode:"LEEMAGE_CONFIRM_INVALID",error:expect.objectContaining({cause:expect.objectContaining({code:"LEEMAGE_CONFIRM_INVALID"})})}));
});

it("preserves legacy inline fallback while keeping internal storage exceptions private", async () => {
 mocks.catalog.mockResolvedValue([{type:"video",key:"legacy",provider:"hf_space"}]);
 mocks.hf.mockResolvedValue({videos:[videoOutput]});
 const result={videos:[{url:"data:video/mp4;base64,inline",width:640,height:360,durationSec:1}]};
 mocks.videoStore.mockResolvedValue({status:"completed",result,errorMessage:"storage unavailable",failure:{error:new Error("private-storage-detail"),phase:"storage.confirm"}});
 const response=await resolveVideoGenerationResult({model:"legacy",prompt:"x"} as Parameters<typeof resolveVideoGenerationResult>[0],"request-fallback");
 expect(response).toMatchObject({status:"completed",result,errorMessage:"storage unavailable"});
 expect(response).not.toHaveProperty("failure");
 expect(JSON.stringify(response)).not.toContain("private-storage-detail");
});
