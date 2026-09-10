import { createHash } from "node:crypto";
import { z } from "zod";
import { modalConfigSchema, modalInputContract, modalExecutionLimits } from "@/shared/model-catalog/modal-comfyui-contract";
import { gradioInputValues } from "@/shared/model-catalog/gradio-contract";
import { createModalClient, ModalApiError, type ModalClient } from "./client";
import type { ModalJobRepository, ModalSubmission } from "./job-repository";

const jobSchema=z.object({id:z.string().regex(/^[a-zA-Z0-9_-]+$/).max(128),status:z.enum(["pending","in_progress","completed","failed","cancelled"]),error:z.string().optional()});
const assetsSchema=z.object({
 job_id:z.string(),
 assets:z.array(z.object({output_key:z.enum(["images","video","audio"]),id:z.string().regex(/^[a-zA-Z0-9_-]+$/).optional(),asset_id:z.string().regex(/^[a-zA-Z0-9_-]+$/).optional(),media_type:z.enum(["image","video","audio"]).optional(),role:z.enum(["result","preview"]).optional()})),
 pagination:z.object({has_more:z.literal(false)}),
});
function responseContract<T>(schema:z.ZodType<T>, value:unknown, stage:string):T {
 const parsed=schema.safeParse(value);
 if(!parsed.success) {
  console.error("[modal-comfyui] response validation", {stage,issues:parsed.error.issues.map(i=>({path:i.path,code:i.code}))});
  throw new ModalApiError("MODAL_"+stage+"_RESPONSE_INVALID");
 }
 return parsed.data;
}
function stable(value:unknown):unknown {
 if(Array.isArray(value)) return value.map(stable);
 if(value && typeof value==="object") return Object.fromEntries(Object.entries(value).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>[k,stable(v)]));
 return value;
}
export async function executeModalWorkflow(
 configInput:unknown,payload:{prompt?:string;dynamicParams?:Record<string,unknown>},requestId:string,
 repository:ModalJobRepository,
 dependencies:{client?:ModalClient;sleep?:(ms:number)=>Promise<void>;now?:()=>number}={},
) {
 const previous=await repository.find?.(requestId);
 const frozen=(previous?.submission as ModalSubmission|null)?.execution;
 const config=modalConfigSchema.parse(frozen?.config??configInput);
 const contract=modalInputContract(config.workflow);
 const values=frozen?.values??gradioInputValues(contract,payload);
 const limits=modalExecutionLimits(config);
 const client=dependencies.client??createModalClient(config.timeout_ms,limits);
 const now=dependencies.now??Date.now;
 const sleep=dependencies.sleep??(ms=>new Promise(resolve=>setTimeout(resolve,ms)));
 if(frozen && frozen.origin!==client.origin)throw new ModalApiError("MODAL_REQUEST_ORIGIN_CHANGED");
 // Request IDs are allocated and authorized by the server. An existing remote
 // job is collected with its persisted contract; it is never submitted again.
 const fingerprint=previous?.jobId ? previous.fingerprint : createHash("sha256").update(JSON.stringify(stable({origin:client.origin,workflow:config.workflow,values}))).digest("hex");
 const record=await repository.acquire(requestId,fingerprint,config.timeout_ms+120_000);
 const deadline=now()+config.timeout_ms;
 let jobId=record.jobId;
 let submitAttempted=false;
 let completed=false;
 let submission=record.submission as ModalSubmission|null;
 const remaining=()=>{if(now()>=deadline) throw new ModalApiError("MODAL_TIMEOUT");};
 async function retry<T>(fn:()=>Promise<T>):Promise<T> {
  for(let attempt=0;;attempt++) {
   remaining();
   try {return await fn();} catch(error) {
    if(!(error instanceof ModalApiError) || !error.retryable || attempt>=2) throw error;
    await sleep(Math.min(2000*(attempt+1),Math.max(1,deadline-now())));
   }
  }
 }
 const submit=()=>client.json("/api/workflows/"+config.workflow_id+"/jobs",{
  method:"POST",headers:{"Content-Type":"application/json","Idempotency-Key":"leesfield-"+requestId},body:JSON.stringify({inputs:submission?.inputs,advanced:submission?.advanced,...(config.workflow.version?{workflow_version:config.workflow.version,result_timeout_ms:limits.result_timeout_ms}:{})}),
 });
 try {
  if(!jobId) {
   if(!submission) {
    const mapped={...values};
    const fileCount=contract.inputs.filter(f=>["file","files"].includes(f.kind)).reduce((n,f)=>n+(Array.isArray(mapped[f.name])?(mapped[f.name] as unknown[]).length:mapped[f.name]==null?0:1),0);
    if(fileCount>limits.max_input_files)throw new ModalApiError("MODAL_INPUT_COUNT_LIMIT");
    for(const field of contract.inputs) if(["file","files"].includes(field.kind) && mapped[field.name]!==undefined && mapped[field.name]!==null) {
     remaining();
     const sources=field.kind==="files"?mapped[field.name] as string[]:[mapped[field.name] as string];
     const declaredDefaults=Array.isArray(field.default)?field.default:[field.default];
     const uploaded=[];
     for(const source of sources){
      // A server-declared file default already names an input on its Volume.
      // Arbitrary caller-supplied filenames are still not accepted as uploads.
      if(declaredDefaults.includes(source)&&/^[a-zA-Z0-9_-][a-zA-Z0-9_.-]{0,159}$/.test(source))uploaded.push(source);
      else uploaded.push(await retry(()=>client.upload(source,field.media??"image")));
     }
     mapped[field.name]=field.kind==="files"?uploaded:uploaded[0];
    }
    submission={inputs:{},advanced:{},execution:{config,values,origin:client.origin}};
    for(const [name,value] of Object.entries(mapped)) {
     if(name.startsWith("advanced__")) submission.advanced[name.slice(10)]=value;
     else submission.inputs[name]=value;
    }
    await repository.save(requestId,record.lease,{submission});
   }
   submitAttempted=true;
   const job=responseContract(jobSchema,await retry(submit),"SUBMIT");jobId=job.id;
   await repository.save(requestId,record.lease,{jobId});
  }
  while(true) {
   remaining();
   const job=responseContract(jobSchema,await retry(()=>client.json("/api/jobs/"+jobId)),"STATUS");
   if(job.id!==jobId) throw new ModalApiError("MODAL_JOB_MISMATCH");
   if(job.status==="completed") {completed=true;break;}
   if(job.status==="failed" || job.status==="cancelled") {
    completed=true; // terminal remote jobs do not need cancellation
    throw new ModalApiError(job.error==="OUTPUT_SYNC_TIMEOUT"?"MODAL_OUTPUT_SYNC_TIMEOUT":"MODAL_JOB_"+job.status.toUpperCase());
   }
   await sleep(Math.min(2500,Math.max(1,deadline-now())));
  }
  // Completed jobs may precede the proxy's history/Volume visibility. Never
  // resubmit generation when only the result is still being synchronized.
  const resultDeadline=Math.min(deadline,now()+limits.result_timeout_ms);
  const waitForResult=async()=>{
   if(now()>=resultDeadline) throw new ModalApiError("MODAL_OUTPUT_SYNC_TIMEOUT");
   await sleep(Math.min(2000,resultDeadline-now()));
  };
  let assets:z.infer<typeof assetsSchema>;
  for(;;) {
   remaining();
   assets=responseContract(assetsSchema,await retry(()=>client.json("/api/jobs/"+jobId+"/assets")),"ASSETS");
   if(assets.job_id!==jobId) throw new ModalApiError("MODAL_JOB_MISMATCH");
   if(assets.assets.length) break;
   await waitForResult();
  }
  if(assets.job_id!==jobId) throw new ModalApiError("MODAL_JOB_MISMATCH");
  if(assets.assets.length>limits.max_assets)throw new ModalApiError("MODAL_OUTPUT_COUNT_LIMIT");
  const urls:string[]=[];
  let bytes=0;
  for(const [index,asset] of assets.assets.entries()) {
   remaining();
   if(asset.role==="preview")continue;
   if(asset.media_type && asset.media_type!==config.workflow.category)throw new ModalApiError("MODAL_OUTPUT_MEDIA");
   // ComfyUI SaveVideo can publish MP4 files in its "images" UI collection.
   // This key is not a MIME type; download validates the actual bytes and header.
   const compatibleKey = asset.output_key === "images" ||
    (config.workflow.category === "video" && asset.output_key === "video");
   if (!compatibleKey) throw new ModalApiError("MODAL_OUTPUT_MEDIA");
   let result:Awaited<ReturnType<ModalClient["download"]>>;
   for(;;) {
    try {
     result=await retry(()=>client.download(jobId!,asset.asset_id??index,config.workflow.category,limits.max_output_bytes-bytes));
     break;
    } catch(error) {
     if(!(error instanceof ModalApiError)) throw new ModalApiError("MODAL_DOWNLOAD_FAILED");
     if(error.code!=="MODAL_HTTP_404") throw error;
     await waitForResult();
    }
   }
   urls.push(result.url);bytes+=result.bytes;
  }
  if(!urls.length)throw new ModalApiError("MODAL_OUTPUT_EMPTY");
  return {urls,jobId};
 } catch(error) {
  // Reconcile an uncertain POST with the exact durable payload/key before cancellation.
  if(!jobId && submitAttempted && submission) {
   try {jobId=jobSchema.parse(await submit()).id;await repository.save(requestId,record.lease,{jobId});} catch {}
  }
  if(jobId && !completed && !(error instanceof ModalApiError && ["MODAL_JOB_FAILED","MODAL_JOB_CANCELLED"].includes(error.code))) {
   try {await client.json("/api/jobs/"+jobId,{method:"DELETE"});} catch {throw new ModalApiError("MODAL_FAILED_CANCEL_UNCONFIRMED");}
  }
  throw error;
 } finally {await repository.release(requestId,record.lease);}
}
