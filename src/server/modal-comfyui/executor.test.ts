// @vitest-environment node
import { describe,it,expect,vi } from "vitest";
import { executeModalWorkflow } from "./executor";
import { ModalApiError, type ModalClient } from "./client";
import type { ModalJobRepository, ModalJobRecord, ModalSubmission } from "./job-repository";
import { buildModalModelDraft } from "./importer";
import workflows from "./fixtures/workflows.json";

function repository() {
 let row:ModalJobRecord|null=null;
 return {
  acquire:vi.fn(async(requestId:string,fingerprint:string)=>{
   if(row && row.fingerprint!==fingerprint) throw new ModalApiError("MODAL_REQUEST_CONFLICT");
   row??={requestId,fingerprint,submission:null,jobId:null,createdAt:new Date()};
   return {...row,lease:"lease"};
  }),
  save:vi.fn(async(_id:string,_lease:string,patch:{jobId?:string;submission?:ModalSubmission})=>{Object.assign(row!,patch);}),
  release:vi.fn(async()=>{}),
 } satisfies ModalJobRepository;
}
function client(status="completed",media="images") {
 return {
  origin:"https://test.modal.run",
  json:vi.fn(async(path:string,init?:RequestInit):Promise<unknown>=>{
   if(init?.method==="DELETE") return {id:"job",status:"cancelled"};
   if(path.endsWith("/assets")) return {job_id:"job",assets:[{output_key:media},{output_key:media}],pagination:{has_more:false}};
   return {id:"job",status};
  }),
  upload:vi.fn(async()=>"uploaded.png"),
  download:vi.fn(async(_id:string,index:number)=>({url:"data:"+index,bytes:10})),
 } satisfies ModalClient;
}
const config=(id="krea2-t2i")=>buildModalModelDraft(workflows.find(w=>w.id===id)).providerConfig;
describe("Modal managed execution",()=>{
 it("retries an upload timeout before submitting exactly one GPU job",async()=>{
  const c=client(),r=repository();
  c.upload.mockRejectedValueOnce(new ModalApiError("MODAL_TIMEOUT",true));
  await executeModalWorkflow(config("krea2-identity-edit"),{prompt:"edit",dynamicParams:{image:"data:image/png;base64,test"}},"request",r,{client:c,sleep:async()=>{}});
  expect(c.upload).toHaveBeenCalledTimes(2);
  expect(c.json.mock.calls.filter(([,init])=>init?.method==="POST")).toHaveLength(1);
 });
 for(const id of ["krea2-t2i","minimax-h3-pdd-fl2va"]) it("submits and collects ordered "+id,async()=>{
  const c=client("completed",id==="krea2-t2i"?"images":"video"),r=repository();
  const result=await executeModalWorkflow(config(id),{prompt:"mountain"},"request",r,{client:c});
  expect(result.urls).toEqual(["data:0","data:1"]);
  expect(c.json.mock.calls[0][1]?.headers).toMatchObject({"Idempotency-Key":"leesfield-request"});
  const submitted=JSON.parse(c.json.mock.calls[0][1]!.body as string);
  expect(submitted.inputs.prompt).toBe("mountain");expect(submitted.advanced).toBeDefined();
  await executeModalWorkflow(config(id),{prompt:"mountain"},"request",r,{client:c});
  expect(c.json.mock.calls.filter(([,init])=>init?.method==="POST")).toHaveLength(1);
 });
 it("collects completed SaveVideo output under images and reuses the existing GPU job",async()=>{
  const c=client("completed","images"),r=repository();
  c.download.mockRejectedValueOnce(new ModalApiError("MODAL_OUTPUT_MEDIA"));
  await expect(executeModalWorkflow(config("minimax-h3-pdd-fl2va"),{prompt:"video"},"video-request",r,{client:c})).rejects.toThrow("MODAL_OUTPUT_MEDIA");
  c.json.mockClear();
  const result=await executeModalWorkflow(config("minimax-h3-pdd-fl2va"),{prompt:"video"},"video-request",r,{client:c});
  expect(result.urls).toEqual(["data:0","data:1"]);
  expect(c.download).toHaveBeenLastCalledWith("job",1,"video",expect.any(Number));
  expect(c.json.mock.calls.every(([,init])=>!init?.method || init.method==="GET")).toBe(true);
  expect(c.upload).not.toHaveBeenCalled();
 });
 it("durably retains uploaded filenames and reuses exact uncertain submission",async()=>{
  const c=client(),r=repository();let post=0;
  const normal=c.json.getMockImplementation()!;
  c.json.mockImplementation(async(path,init)=>{
   if(init?.method==="POST" && post++===0) throw new ModalApiError("MODAL_NETWORK",true);
   return normal(path,init);
  });
  const payload={prompt:"edit",dynamicParams:{image:"data:image/png;base64,test",advanced__cfg:1.2}};
  await executeModalWorkflow(config("krea2-identity-edit"),payload,"request",r,{client:c,sleep:async()=>{}});
  expect(c.upload).toHaveBeenCalledTimes(1);
  const posts=c.json.mock.calls.filter(([,init])=>init?.method==="POST");
  expect(posts[0][1]?.body).toBe(posts[1][1]?.body);
  expect(JSON.parse(posts[0][1]!.body as string)).toMatchObject({inputs:{image:"uploaded.png"},advanced:{cfg:1.2}});
  await expect(executeModalWorkflow(config("krea2-identity-edit"),{...payload,prompt:"changed"},"request",r,{client:c})).rejects.toThrow("CONFLICT");
 });
 it.each(["failed","cancelled"])("propagates %s without exposing remote text",async status=>{
  const c=client(status),r=repository();
  await expect(executeModalWorkflow(config(),{prompt:"x"},"request",r,{client:c})).rejects.toThrow("MODAL_JOB_"+status.toUpperCase());
  expect(r.release).toHaveBeenCalled();
 });
 it("times out pending jobs and cancels; cancellation failure stays explicit",async()=>{
  let time=0;const c=client("pending"),r=repository();
  await expect(executeModalWorkflow({...config(),timeout_ms:1000},{prompt:"x"},"request",r,{client:c,now:()=>time,sleep:async(ms)=>{time+=ms;}})).rejects.toThrow("MODAL_TIMEOUT");
  expect(c.json.mock.calls.some(([,init])=>init?.method==="DELETE")).toBe(true);
  time=0;const normal=c.json.getMockImplementation()!;
  c.json.mockImplementation(async(p,i)=>{if(i?.method==="DELETE")throw new Error("secret");return normal(p,i);});
  await expect(executeModalWorkflow({...config(),timeout_ms:1000},{prompt:"x"},"request",r,{client:c,now:()=>time,sleep:async(ms)=>{time+=ms;}})).rejects.toThrow("CANCEL_UNCONFIRMED");
 });
 it("rejects empty, mismatched and incomplete output lists",async()=>{
  for(const assets of [[],[{output_key:"audio"}]]) {
   const c=client();const normal=c.json.getMockImplementation()!;
   c.json.mockImplementation(async(p,i)=>p.endsWith("/assets")?{job_id:"job",assets,pagination:{has_more:false}}:normal(p,i));
   let time=0;
   await expect(executeModalWorkflow(config(),{prompt:"x"},"r",repository(),{client:c,now:()=>time,sleep:async ms=>{time+=ms;}})).rejects.toThrow();
   expect(c.download).not.toHaveBeenCalled();
  }
 });
 it("waits for delayed assets and temporary download 404 without resubmitting",async()=>{
  const c=client(),normal=c.json.getMockImplementation()!;let lists=0,time=0;
  c.json.mockImplementation(async(p,i)=>p.endsWith("/assets") && lists++===0
   ? {job_id:"job",assets:[],pagination:{has_more:false}} : normal(p,i));
  c.download.mockRejectedValueOnce(new ModalApiError("MODAL_HTTP_404"));
  const result=await executeModalWorkflow(config(),{prompt:"x"},"r",repository(),{client:c,now:()=>time,sleep:async ms=>{time+=ms;}});
  expect(result.urls).toEqual(["data:0","data:1"]);
  expect(time).toBe(4000);
  expect(c.json.mock.calls.filter(([,i])=>i?.method==="POST")).toHaveLength(1);
  expect(c.json.mock.calls.some(([,i])=>i?.method==="DELETE")).toBe(false);
 });
 it("bounds permanently empty results and distinguishes malformed responses",async()=>{
  for(const malformed of [false,true]) {
   const c=client(),normal=c.json.getMockImplementation()!;let time=0;
   c.json.mockImplementation(async(p,i)=>p.endsWith("/assets")
    ? {job_id:"job",assets:malformed?"wrong":[],pagination:{has_more:false}} : normal(p,i));
   await expect(executeModalWorkflow(config(),{prompt:"x"},"r",repository(),{client:c,now:()=>time,sleep:async ms=>{time+=ms;}}))
    .rejects.toThrow(malformed?"MODAL_ASSETS_RESPONSE_INVALID":"MODAL_OUTPUT_SYNC_TIMEOUT");
   expect(time).toBe(malformed?0:60_000);
   expect(c.json.mock.calls.some(([,i])=>i?.method==="DELETE")).toBe(false);
  }
 });
 it("reuses durable submission after process loss before remote ID is saved",async()=>{
  const r=repository(),c=client();
  const original=r.save.getMockImplementation()!;
  let fail=true;
  r.save.mockImplementation(async(id,lease,patch)=>{if(patch.jobId && fail){fail=false;throw new Error("db down");}await original(id,lease,patch);});
  await expect(executeModalWorkflow(config(),{prompt:"x"},"r",r,{client:c})).rejects.toThrow("db down");
  await executeModalWorkflow(config(),{prompt:"x"},"r",r,{client:c});
  const posts=c.json.mock.calls.filter(([,i])=>i?.method==="POST");
  expect(posts).toHaveLength(2);expect(posts[0][1]?.body).toBe(posts[1][1]?.body);
 });
});
