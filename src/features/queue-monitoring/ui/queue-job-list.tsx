"use client";
import { useState, type ChangeEvent, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { ListChecks } from "lucide-react";
import type { ConsoleJob, ConsoleQuery } from "@/shared/api/job-queue-console-contract";
import { queueJobKinds, queueJobStatuses, queueOrigins } from "@/shared/api/job-queue-console-contract";
import { AppFilterToolbar, AppSearchField, AppSortSelect } from "@/shared/ui/app-filter-toolbar";
import { AppInput } from "@/shared/ui/app-input";
import { AppDateTimePicker } from "@/shared/ui/app-calendar";
import { AppResourceEmpty } from "@/shared/ui/app-resource-list";
import { ConsoleJobStatus, ConsoleTime } from "./console-common";
import { QueueKindIcon, queueDisplayTitle } from "./queue-kind-icon";
import { QueueTable, queueRowButton } from "./queue-table";
import { ConsoleAttemptDuration, ConsoleDuration, cycleAdmission, waitingUntil, shortQueueId } from "./queue-times";

type Change=(values:Record<string,string|undefined|null>)=>void;
type ExtraFilters={content:ReactNode;count:number;chips:{label:string;onRemove:()=>void}[];reset:Record<string,string|null>};
export function QueueFilters({filters,change,actions,extra}:{filters:ConsoleQuery;change:Change;actions?:ReactNode;extra?:ExtraFilters}) {
  const t=useTranslations("queueMonitoring");
  const keys=["kind","status","model","resource","origin","worker","from","to"] as const;
  const filterCount=keys.filter(key=>Boolean(filters[key])).length+(extra?.count??0);
  const select=(key:"kind"|"status"|"origin",values:readonly string[],prefix:string)=><AppSortSelect value={filters[key]??"all"} ariaLabel={t("filters."+key)} className="w-full" options={[{value:"all",label:t("all")},...values.map(value=>({value,label:t(prefix+value)}))]} onValueChange={value=>change({[key]:value==="all"?null:value})}/>;
  return <AppFilterToolbar searchActive={Boolean(filters.q)} filterCount={filterCount}
    onResetFilters={()=>change({...Object.fromEntries(keys.map(key=>[key,null])),...extra?.reset})}
    search={<QueueTextField search value={filters.q} label={t("search")} placeholder={t("searchHint")} change={value=>change({q:value})}/>}
    filters={<div className="space-y-4">
      {([["kind",queueJobKinds,"kinds."],["status",[...queueJobStatuses,"blocked"],"statuses."],["origin",queueOrigins,"origins."]] as const).map(([key,values,prefix])=><label key={key} className="grid gap-2 text-xs">{t("filters."+key)}{select(key,values,prefix)}</label>)}
      {(["model","resource","worker"] as const).map(key=><label key={key} className="grid gap-2 text-xs">{t("filters."+key)}<QueueTextField value={filters[key]} label={t("filters."+key)} change={value=>change({[key]:value})} validate={key==="worker"?value=>/^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(value):undefined}/></label>)}
      {(["from","to"] as const).map(key=><label key={key} className="grid gap-2 text-xs">{t("filters."+key)}<AppDateTimePicker value={filters[key]?new Date(filters[key]):undefined} defaultTime={key==="to"?"23:59:59":"00:00:00"} aria-label={t("filters."+key)} onChange={date=>change({[key]:date.toISOString()})}/></label>)}

      {extra?.content}<p className="text-xs text-muted-foreground">{t("periodHint")}</p>
    </div>}
    filterChips={[...keys.flatMap(key=>{const value=filters[key];if(!value)return[];const prefix=key==="kind"?"kinds.":key==="status"?"statuses.":key==="origin"?"origins.":null;return[{label:t("filters."+key)+": "+(prefix?t(prefix+value):String(value)),onRemove:()=>change({[key]:null})}];}),...extra?.chips??[]]}>{actions}</AppFilterToolbar>;
}

export function QueueTextField({value,label,placeholder,change,search=false,validate}:{value?:string;label:string;placeholder?:string;change:(value:string|null)=>void;search?:boolean;validate?:(value:string)=>boolean}) {
  const t=useTranslations("queueMonitoring"),external=value??"";
  const [state,setState]=useState({external,draft:external});
  if(state.external!==external)setState({external,draft:state.draft.trim()===external?state.draft:external});
  const invalid=Boolean(state.draft.trim()&&validate&&!validate(state.draft.trim()));
  function update(draft:string){setState({external,draft});const normalized=draft.trim();if(!normalized||!validate||validate(normalized))change(normalized||null);}
  const props={value:state.draft,maxLength:200,"aria-label":label,"aria-invalid":invalid,placeholder,onChange:(event:ChangeEvent<HTMLInputElement>)=>update(event.currentTarget.value)};
  return search?<AppSearchField {...props} onClear={()=>update("")}/>:<span className="grid gap-2"><AppInput {...props}/>{invalid&&<span role="status" className="text-xs text-warning-foreground">{t("invalidIdentifier")}</span>}</span>;
}

export function QueueJobList({items,selected,onSelect,sampledAt}:{items:ConsoleJob[];selected:string|null;onSelect:(id:string)=>void;sampledAt:string}) {
  const t=useTranslations("queueMonitoring");
  if(!items.length)return <AppResourceEmpty icon={<ListChecks/>} title={t("empty")} description={t("emptyHint")}/>;
  return <QueueTable label={t("jobs")} rows={items} rowKey={job=>job.id} selected={selected} columns={[
    {key:"job",label:t("columns.job"),className:"lg:w-[25%]",cell:job=><div className="min-w-0"><button type="button" className={queueRowButton} aria-current={selected===job.id?"true":undefined} onClick={()=>onSelect(job.id)}><span className="flex items-start gap-2"><QueueKindIcon kind={job.kind} className="mt-0.5 size-4 shrink-0 text-muted-foreground"/><span className="break-words">{queueDisplayTitle(job,t("kinds."+job.kind))}</span></span></button><p className="mt-1.5 text-[10px] text-muted-foreground">{t("origins."+job.origin)} · <span title={job.id}>{shortQueueId(job.id)}</span>{job.cycle>1&&" · "+t("cycle",{cycle:job.cycle})}</p></div>},
    {key:"model",label:t("columns.model"),className:"lg:w-[13%]",cell:job=><span className="break-all text-muted-foreground">{job.model??t("kinds."+job.kind)}</span>},
    {key:"status",label:t("filters.status"),cell:job=><div className="space-y-1"><ConsoleJobStatus job={job}/>{job.primaryReason&&job.primaryReason!=="QUEUE_PAUSED"&&<p className="text-[10px] text-muted-foreground">{t("reasons."+job.primaryReason)}</p>}</div>},
    {key:"admitted",label:t("columns.admitted"),cell:job=><span className="text-[11px] text-muted-foreground"><ConsoleTime compact value={cycleAdmission(job)}/></span>},
    {key:"started",label:t("columns.started"),cell:job=><span className="text-[11px] text-muted-foreground"><ConsoleTime compact value={job.attempt?.startedAt??null}/></span>},
    {key:"wait",label:t("columns.beforeStart"),cell:job=><ConsoleDuration start={cycleAdmission(job)} end={waitingUntil(job,sampledAt)}/>},
    {key:"duration",label:t("columns.duration"),cell:job=><ConsoleAttemptDuration job={job} sampledAt={sampledAt}/>},
    {key:"attempts",label:t("columns.attempts"),cell:job=><span className="tabular-nums">{job.attemptCount??job.attempt?.ordinal??0}</span>},
  ]}/>;
}
