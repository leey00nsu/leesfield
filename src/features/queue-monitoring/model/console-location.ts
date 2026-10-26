"use client";
import { useSyncExternalStore } from "react";
import { consoleFailedQuerySchema, consoleQuerySchema } from "@/shared/api/job-queue-console-contract";
export const consoleTabs=["current","history","service","failed","statistics"] as const;
export type ConsoleTab=typeof consoleTabs[number];
const fields=["kind","status","q","model","resource","origin","worker","from","to"] as const;
const subscribe=(notify:()=>void)=>{window.addEventListener("popstate",notify);return()=>window.removeEventListener("popstate",notify);};
const snapshot=()=>window.location.search;
export function useConsoleLocation(){
  const search=useSyncExternalStore(subscribe,snapshot,()=>"");
  const params=new URLSearchParams(search),requested=params.get("qm_tab");
  const legacyHistory=params.get("qm_view")==="history"&&(!requested||requested==="service");
  const tab:ConsoleTab=legacyHistory?"history":consoleTabs.includes(requested as ConsoleTab)?requested as ConsoleTab:"current";
  const raw=Object.fromEntries(fields.flatMap(key=>params.get("qm_"+key)?[[key,params.get("qm_"+key)!]]:[]));
  const view=tab==="history"?"history":"current";
  const parsed=consoleQuerySchema.safeParse({...raw,view}),filters=parsed.success?parsed.data:consoleQuerySchema.parse({view});
  const job=params.get("qm_job"),selected=job&&/^[a-f0-9-]{36}$/i.test(job)?job:null;
  const entry=params.get("qm_entry"),selectedEntry=entry&&/^[a-f0-9-]{36}$/i.test(entry)?entry:null;
  const failed=consoleFailedQuerySchema.safeParse({...raw,view:"current",state:params.get("qm_state")??undefined,classification:params.get("qm_classification")??undefined,code:params.get("qm_code")??undefined});
  const failedFilters=failed.success?failed.data:consoleFailedQuerySchema.parse({});
  const change=(values:Record<string,string|undefined|null>)=>{
    const url=new URL(window.location.href);
    if(values.tab){url.searchParams.delete("qm_view");url.searchParams.delete("qm_job");url.searchParams.delete("qm_entry");if(values.tab!=="history"){url.searchParams.delete("qm_from");url.searchParams.delete("qm_to");}}
    if(Object.hasOwn(values,"job")&&!Object.hasOwn(values,"entry"))url.searchParams.delete("qm_entry");
    for(const [key,value]of Object.entries(values)){if(value)url.searchParams.set("qm_"+key,value);else url.searchParams.delete("qm_"+key);}
    window.history.replaceState(null,"",url);window.dispatchEvent(new PopStateEvent("popstate"));
  };
  return{tab,filters,failedFilters,selected,selectedEntry,invalid:!parsed.success||!failed.success,change};
}
