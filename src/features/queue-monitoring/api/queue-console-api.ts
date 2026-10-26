export class QueueConsoleHttpError extends Error {
  constructor(readonly status: number, readonly code: string, readonly retryAfter: number | null = null) { super(code); }
}
export function consoleParams(params: Record<string, unknown>) {
  const result=new URLSearchParams();
  for(const [key,value] of Object.entries(params).sort(([a],[b])=>a.localeCompare(b))) if(value!==undefined&&value!==null&&value!=="")result.set(key,String(value));
  return result.toString();
}
export async function fetchQueueConsole<T>(path:string,params:Record<string,unknown>={},signal?:AbortSignal):Promise<T>{
  const query=consoleParams(params);
  const response=await fetch(`/api/internal/job-queue/${path}${query?"?"+query:""}`,{cache:"no-store",signal});
  if(!response.ok){
    const body=await response.json().catch(()=>null),retry=Number(response.headers.get("Retry-After"));
    throw new QueueConsoleHttpError(response.status,typeof body?.message==="string"?body.message:"QUEUE_ADMIN_UNAVAILABLE",Number.isFinite(retry)&&retry>0?retry:null);
  }
  return response.json();
}
export type ConsoleOperation="redrive"|"reconcile"|"abandon";
export type ConsoleOperationBody={requestId:string;expectedVersion:number;reason:string;evidenceRef?:string};
export type ConsoleOperationResult={requestId:string;outcome:"accepted"|"succeeded"|"failed"|"rejected";result?:{code?:string;mode?:string;status?:string}};
export async function sendConsoleOperation(id:string,action:ConsoleOperation,body:ConsoleOperationBody):Promise<ConsoleOperationResult>{
  const response=await fetch(`/api/internal/job-queue/dead-letters/${id}/${action}`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});
  const value=await response.json().catch(()=>null);
  if(!response.ok){const retry=Number(response.headers.get("Retry-After"));throw new QueueConsoleHttpError(response.status,value?.message??value?.result?.code??"QUEUE_ADMIN_UNAVAILABLE",Number.isFinite(retry)&&retry>0?retry:null);}
  if(!value||value.requestId!==body.requestId||!["accepted","succeeded","failed","rejected"].includes(value.outcome))throw new QueueConsoleHttpError(503,"QUEUE_RESPONSE_UNKNOWN");
  return value;
}
