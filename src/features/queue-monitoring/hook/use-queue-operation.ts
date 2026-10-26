"use client";
import { useRef, useState } from "react";
import { z } from "zod";
import { QueueConsoleHttpError, sendConsoleOperation, type ConsoleOperation, type ConsoleOperationBody, type ConsoleOperationResult } from "../api/queue-console-api";
const savedSchema=z.object({action:z.enum(["redrive","reconcile","abandon"]),body:z.object({requestId:z.string().uuid(),expectedVersion:z.number().int().nonnegative(),
  reason:z.string().regex(/^[A-Z][A-Z0-9_]{2,119}$/),evidenceRef:z.string().regex(/^[a-zA-Z0-9_:.-]{1,400}$/).optional()}).strict()}).strict();
type Saved=z.infer<typeof savedSchema>;
const storageKey=(id:string)=>"leesfield.queue.pending-operation:"+id;
function readSaved(id:string):Saved|null{try{if(typeof window==="undefined")return null;return savedSchema.parse(JSON.parse(sessionStorage.getItem(storageKey(id))??"null"));}catch{return null;}}
function save(id:string,value:Saved|null){try{if(value)sessionStorage.setItem(storageKey(id),JSON.stringify(value));else sessionStorage.removeItem(storageKey(id));}catch{/* The in-memory command still protects retries when storage is unavailable. */}}
export function useQueueOperation(entryId:string,refresh:()=>Promise<unknown>){
  const [pending,setPending]=useState<Saved|null>(()=>readSaved(entryId));
  const pendingRef=useRef(pending),busyRef=useRef(false);
  const [busy,setBusy]=useState(false),[error,setError]=useState<unknown>(null),[result,setResult]=useState<ConsoleOperationResult|null>(null),[reviewRequired,setReviewRequired]=useState(false);
  async function run(action:ConsoleOperation,body:Omit<ConsoleOperationBody,"requestId">){
    if(busyRef.current||reviewRequired)return;
    const command=pendingRef.current??{action,body:{...body,requestId:crypto.randomUUID()}};
    if(command.action!==action)return;
    busyRef.current=true;pendingRef.current=command;
    save(entryId,command);setPending(command);setBusy(true);setError(null);setResult(null);
    try{
      const outcome=await sendConsoleOperation(entryId,action,command.body);setResult(outcome);save(entryId,null);setPending(null);pendingRef.current=null;
      await refresh();
    }catch(caught){
      setError(caught);
      if(caught instanceof QueueConsoleHttpError&&[400,401,403,409].includes(caught.status)){
        save(entryId,null);setPending(null);pendingRef.current=null;setReviewRequired(true);await refresh();
      }
    }finally{setBusy(false);busyRef.current=false;}
  }
  function beginReview(){if(!busyRef.current&&!pendingRef.current){setResult(null);setError(null);setReviewRequired(false);}}
  return{pending,busy,error,result,reviewRequired,run,beginReview};
}
