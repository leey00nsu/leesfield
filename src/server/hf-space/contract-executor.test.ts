// @vitest-environment node

import {describe,it,expect,vi} from "vitest";
import {buildGradioRequest,executeGradioContract,predictWithDeadline} from "./contract-executor";
import type {GradioContract} from "@/shared/model-catalog/gradio-contract";
vi.mock("@gradio/client",()=>({handle_file:vi.fn(async v=>({uploaded:v}))}));
const contract:GradioContract={version:1,apiName:"/output_video",inputs:[
{name:"in_0",label:"Prompt",kind:"string",schema:{type:"string"},canonical:"prompt",nullable:false,required:true},
{name:"in_1",label:"Frame",kind:"file",schema:{},confirmed:true,nullable:true,required:true},
{name:"in_7",label:"Upsample",kind:"boolean",schema:{type:"boolean"},confirmed:true,nullable:false,required:false,default:false}],
output:{media:"video",path:[1],multiple:false},diagnostics:[],reviewed:true};
describe("Gradio contract executor",()=>{
 it("preuploads typed references while preserving order and null slots, and stops on upload failures", async () => {
  const bytes=Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l9sAAAAASUVORK5CYII=","base64");
  const blob=new Blob([bytes],{type:"image/png"});
  const upload=vi.fn(async (_root:string, files:File[])=>{
   expect(files[0].name).toBe("reference.png");
   expect(files[0].type).toBe("image/png");
   expect(Buffer.from(await files[0].arrayBuffer())).toEqual(bytes);
   return {files:["/uploaded/reference.png"]};
  });
  const predict=vi.fn(async()=>({data:["ok"]}));
  const client={predict,upload_files:upload};
  const values={refs:[{image:blob,caption:null},null]};
  await predictWithDeadline(client,"/generate",values,1000,"https://test.hf.space");
  expect(predict).toHaveBeenCalledWith("/generate",{refs:[{image:expect.objectContaining({path:"/uploaded/reference.png",orig_name:"reference.png",mime_type:"image/png"}),caption:null},null]});
  expect(values.refs[0]?.image).toBe(blob);
  predict.mockClear();
  for(const result of [{error:"rejected"},{files:[]},{files:[""]}]) {
   await expect(predictWithDeadline({predict,upload_files:async()=>result},"/generate",values,1000,"https://test.hf.space")).rejects.toThrow("FILE_UPLOAD_FAILED");
   expect(predict).not.toHaveBeenCalled();
  }
  await expect(predictWithDeadline(client,"/generate",{image:new Blob(["invalid"],{type:"image/png"})},1000,"https://test.hf.space")).rejects.toThrow("FILE_MEDIA");
  expect(predict).not.toHaveBeenCalled();
 });
 it("does not submit a late upload after the prediction deadline expires", async () => {
  let finish!:()=>void;
  const pending=new Promise<{files:string[]}>(resolve=>{finish=()=>resolve({files:["/uploaded/reference.png"]});});
  const predict=vi.fn(async()=>({data:[]}));
  const bytes=Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l9sAAAAASUVORK5CYII=","base64");
  await expect(predictWithDeadline({predict,upload_files:async()=>pending},"/generate",{image:new Blob([bytes],{type:"image/png"})},10,"https://test.hf.space")).rejects.toThrow("HF_SPACE_REQUEST_TIMEOUT");
  finish();
  await new Promise(resolve=>setTimeout(resolve,0));
  expect(predict).not.toHaveBeenCalled();
 });
it("명시한 이름과 null/default를 그대로 전송하고 두 번째 출력을 선택한다",async()=>{
const predict=vi.fn(async()=>({data:["done",{url:"https://test.hf.space/gradio_api/file=result.mp4"}]}));
const result=await executeGradioContract({predict},{providerConfig:{gradio_contract:contract}},{prompt:"hello",dynamicParams:{in_1:null}},{timeoutMs:1000,spaceUrl:"https://test.hf.space"},"video");
expect(predict).toHaveBeenCalledWith("/output_video",{in_0:"hello",in_1:null,in_7:false});expect(result).toHaveLength(1);
});
it("검토 플래그 없이 실행하고 알 수 없는 설정은 거절한다",async()=>{
await expect(buildGradioRequest({...contract,reviewed:false},{prompt:"hello",dynamicParams:{in_1:null}})).resolves.toEqual({in_0:"hello",in_1:null,in_7:false});
await expect(buildGradioRequest(contract,{dynamicParams:{unknown:1}})).rejects.toThrow("UNKNOWN_PARAMETER");
});
it("파일 필드별로 gallery 구조를 직렬화한다",async()=>{
const c={...contract,mappingConfirmed:true,inputs:[{name:"images",label:"Images",kind:"gallery" as const,schema:{},confirmed:true,nullable:false,required:true}]};
const result=await buildGradioRequest(c,{dynamicParams:{images:["data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l9sAAAAASUVORK5CYII="]}});
expect(result.images).toMatchObject([{caption:null,image:{uploaded:expect.any(Blob)}}]);
});
it("허위 MIME bytes와 완료되지 않은 queue 결과를 거부한다",async()=>{
 const c={...contract,inputs:[{name:"image",label:"Image",kind:"file" as const,media:"image" as const,schema:{},nullable:false,required:true}]};
 await expect(buildGradioRequest(c,{dynamicParams:{image:"data:image/png;base64,YQ=="}})).rejects.toThrow("HF_CONTRACT_FILE_MEDIA");
 const submit=()=>({async *[Symbol.asyncIterator](){yield {type:"data",data:["partial.png"]};}});
 await expect(predictWithDeadline({predict:vi.fn(),submit},"/generate",{},1000)).rejects.toThrow("HF_SPACE_RESPONSE_INVALID");
});
it("cancel이 동기 예외를 던져도 deadline 오류와 predict fallback을 유지한다",async()=>{
 let finish!:()=>void;const pending=new Promise<void>(resolve=>{finish=resolve;});
 const cancel=vi.fn(()=>{finish();throw new Error("remote cancel failure");});
 const submit=()=>({async *[Symbol.asyncIterator](){await pending;},cancel});
 await expect(predictWithDeadline({predict:vi.fn(),submit},"/generate",{},5)).rejects.toThrow("HF_SPACE_REQUEST_TIMEOUT");
 await Promise.resolve();expect(cancel).toHaveBeenCalledTimes(1);
 const predict=vi.fn(async()=>({data:["result"]}));
 expect(await predictWithDeadline({predict},"/generate",{},100)).toEqual({data:["result"]});
});
it("미디어 종류와 파일 개수 보호를 유지한다",async()=>{
const c={...contract,inputs:[{name:"images",label:"Images",kind:"gallery" as const,media:"image" as const,schema:{type:"array",minItems:1,maxItems:2,items:{type:"object",title:"ImageData",properties:{path:{type:"string"}}}},nullable:false,required:true}]};
await expect(buildGradioRequest(c,{dynamicParams:{images:["data:audio/wav;base64,YQ=="]}})).rejects.toThrow("FILE_MEDIA");
await expect(buildGradioRequest(c,{dynamicParams:{images:[]}})).rejects.toThrow("SCHEMA");
await expect(buildGradioRequest(c,{dynamicParams:{images:Array(3).fill("data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l9sAAAAASUVORK5CYII=")}})).rejects.toThrow("FILE_COUNT_LIMIT");
await expect(buildGradioRequest(c,{dynamicParams:{images:["https://127.0.0.1/private"]}})).rejects.toThrow("FILE_URL");
});
it("submit의 전체 이벤트를 구독하고 data 다음 complete에서 결과를 반환한다",async()=>{
const submit=vi.fn((_api:string,_values:Record<string,unknown>,_eventData?:unknown,_triggerId?:number|null,allEvents?:boolean)=>({
  async *[Symbol.asyncIterator]() {
    yield {type:"data",data:["done",{url:"https://test.hf.space/gradio_api/file=result.mp4"}]};
    if(allEvents) yield {type:"status",stage:"complete"};
  },
}));
const result=await executeGradioContract(
  {predict:vi.fn(),submit},
  {providerConfig:{gradio_contract:contract}},
  {prompt:"hello",dynamicParams:{in_1:null}},
  {timeoutMs:1000,spaceUrl:"https://test.hf.space"},
  "video",
);
expect(result).toHaveLength(1);
expect(submit).toHaveBeenCalledWith("/output_video",expect.any(Object),undefined,null,true);
});
it("complete가 data보다 먼저 도착해도 최종 결과를 반환한다",async()=>{
const submit=vi.fn(()=>({
  async *[Symbol.asyncIterator]() {
    yield {type:"status",stage:"complete"};
    yield {type:"data",data:["done",{url:"https://test.hf.space/gradio_api/file=result.mp4"}]};
  },
}));
const result=await executeGradioContract(
  {predict:vi.fn(),submit},
  {providerConfig:{gradio_contract:contract}},
  {prompt:"hello",dynamicParams:{in_1:null}},
  {timeoutMs:1000,spaceUrl:"https://test.hf.space"},
  "video",
);
expect(result).toHaveLength(1);
});
it("시간 초과 시 submit된 Gradio 작업을 best-effort 취소한다",async()=>{
let release!:()=>void;
const finished=new Promise<void>(resolve=>{release=resolve;});
const cancel=vi.fn(async()=>{release();});
const submit=vi.fn(()=>({
  async *[Symbol.asyncIterator]() {
    await finished;
    return;
  },
  cancel,
}));
const predict=vi.fn();
await expect(executeGradioContract(
  {predict,submit},
  {providerConfig:{gradio_contract:contract}},
  {prompt:"slow",dynamicParams:{in_1:null}},
  {timeoutMs:10,spaceUrl:"https://test.hf.space"},
  "video",
)).rejects.toThrow("HF_SPACE_REQUEST_TIMEOUT");
expect(submit).toHaveBeenCalledWith("/output_video",expect.any(Object),undefined,null,true);
expect(cancel).toHaveBeenCalledTimes(1);
expect(predict).not.toHaveBeenCalled();
});
});
