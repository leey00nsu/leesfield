import { modalExecutionLimitsSchema } from "@/shared/model-catalog/modal-comfyui-contract";
import { z } from "zod";
import { fileTypeFromBuffer } from "file-type";
import { resolveInputImageBuffer } from "@/server/shared/input-image-resolver";

export class ModalApiError extends Error {
 constructor(public code:string,public retryable=false) {super(code);}
}
export function modalConnection() {
 const value=process.env.MODAL_COMFY_URL, key=process.env.MODAL_COMFY_API_KEY;
 if(!value || !key) throw new ModalApiError("MODAL_NOT_CONFIGURED");
 let url:URL;
 try {url=new URL(value);} catch {throw new ModalApiError("MODAL_CONNECTION_INVALID");}
 if(url.protocol!=="https:" || !/^[a-z0-9-]+\.modal\.run$/.test(url.hostname) ||
  url.port || url.username || url.password || url.search || url.hash || url.pathname!=="/")
  throw new ModalApiError("MODAL_CONNECTION_INVALID");
 return {origin:url.origin,key};
}
export async function readModalBytes(response:Response,maxBytes:number) {
 if(Number(response.headers.get("content-length"))>maxBytes) throw new ModalApiError("MODAL_RESPONSE_TOO_LARGE");
 if(!response.body) throw new ModalApiError("MODAL_EMPTY_RESPONSE");
 const reader=response.body.getReader(), chunks:Uint8Array[]=[];
 let size=0;
 try {
  while(true) {
   const {done,value}=await reader.read(); if(done) break;
   size+=value.byteLength;
   if(size>maxBytes) throw new ModalApiError("MODAL_RESPONSE_TOO_LARGE");
   chunks.push(value);
  }
 } finally {await reader.cancel().catch(()=>{});reader.releaseLock();}
 if(!size) throw new ModalApiError("MODAL_EMPTY_RESPONSE");
 return Buffer.concat(chunks);
}
export function createModalClient(timeoutMs=30_000, options: Partial<z.infer<typeof modalExecutionLimitsSchema>> = {}) {
 const limits=modalExecutionLimitsSchema.parse(options);
 const connection=modalConnection();
 const deadline=Date.now()+timeoutMs;
 const remaining=()=>Math.max(1,deadline-Date.now());
 async function request(path:string,init:RequestInit={},limit=2*1024*1024) {
  if(!/^\/(health|api\/(workflows|jobs|uploads))(\/[-a-zA-Z0-9_]+)*$/.test(path)) throw new ModalApiError("MODAL_PATH_INVALID");
  const requestLimit=path.startsWith("/api/uploads/") && init.method==="POST"?limits.upload_timeout_ms:limits.request_timeout_ms;
  const timer=AbortSignal.timeout(init.method==="DELETE"?30_000:Math.min(remaining(),requestLimit));
  try {
   const response=await fetch(connection.origin+path,{
    ...init, headers:{...init.headers,Authorization:"Bearer "+connection.key},
    redirect:"error",signal:timer,
   });
   if(!response.ok) {
    await response.body?.cancel();
    throw new ModalApiError("MODAL_HTTP_"+response.status,response.status===429 || response.status>=500);
   }
   return {bytes:await readModalBytes(response,limit),mime:response.headers.get("content-type")?.split(";")[0].toLowerCase()};
  } catch(error) {
   if(error instanceof ModalApiError) throw error;
   throw new ModalApiError(timer.aborted?"MODAL_TIMEOUT":"MODAL_NETWORK",true);
  }
 }
 async function json(path:string,init:RequestInit={}) {
  const result=await request(path,init);
  try {return JSON.parse(result.bytes.toString()) as unknown;} catch {throw new ModalApiError("MODAL_RESPONSE_INVALID");}
 }
 return {
  origin:connection.origin,json,
  async upload(source:string,media:"image"|"video"|"audio"="image") {
   const input=await resolveInputImageBuffer(source,{invalidErrorCode:"MODAL_IMAGE_INVALID",timeoutMs:Math.min(remaining(),limits.request_timeout_ms),maxBytes:limits.max_input_bytes});
   const file=await fileTypeFromBuffer(input.buffer);
   if(!file || !file.mime.startsWith(media+"/") || file.mime!==input.mime) throw new ModalApiError("MODAL_IMAGE_INVALID");
   const form=new FormData();
   form.append("file",new Blob([new Uint8Array(input.buffer)],{type:file.mime}),"input."+file.ext);
   const result=z.object({name:z.string().regex(/^[a-zA-Z0-9_.-]+$/).max(160),media_type:z.literal(media)}).parse(await json("/api/uploads/"+media,{method:"POST",body:form}));
   if(result.name==="." || result.name==="..") throw new ModalApiError("MODAL_UPLOAD_INVALID");
   return result.name;
  },
  async download(jobId:string,index:number|string,media:"image"|"video",limit:number) {
   const {bytes,mime}=await request("/api/jobs/"+jobId+"/assets/"+index,{},limit);
   const file=await fileTypeFromBuffer(bytes);
   if(!file || file.mime!==mime || !mime?.startsWith(media+"/")) throw new ModalApiError("MODAL_OUTPUT_MEDIA");
   return {url:"data:"+mime+";base64,"+bytes.toString("base64"),bytes:bytes.length};
  },
 };
}
export type ModalClient=ReturnType<typeof createModalClient>;
