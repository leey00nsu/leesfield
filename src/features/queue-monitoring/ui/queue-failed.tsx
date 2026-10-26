"use client";
import { useTranslations } from "next-intl";
import { Layers, RefreshCw } from "lucide-react";
import { z } from "zod";
import { consoleFailedQuerySchema, type ConsoleFailedJob, type ConsolePage } from "@/shared/api/job-queue-console-contract";
import { AppSortSelect } from "@/shared/ui/app-filter-toolbar";
import { AppButton } from "@/shared/ui/app-button";
import { AppResourceEmpty } from "@/shared/ui/app-resource-list";
import { useQueueConsole } from "../hook/use-queue-console";
import { useConsolePagination } from "../hook/use-console-pagination";
import { ConsoleError, ConsoleOperationReason, ConsolePagination, ConsoleStatus, ConsoleTime } from "./console-common";
import { QueueFilters, QueueTextField } from "./queue-job-list";
import { QueueTable, queueRowButton } from "./queue-table";
import { ConsoleDuration, shortQueueId } from "./queue-times";
import { QueueKindIcon, queueDisplayTitle } from "./queue-kind-icon";
export function QueueFailed({filters,selected,change}:{filters:z.output<typeof consoleFailedQuerySchema>;selected:string|null;change:(values:Record<string,string|undefined|null>)=>void}) {
  const t=useTranslations("queueMonitoring"),{cursors,setCursors}=useConsolePagination(filters);
  const query=useQueueConsole<ConsolePage<ConsoleFailedJob>>("failed-jobs",{...filters,cursor:cursors.at(-1)},{poll:filters.view==="current"&&cursors.length===1&&!selected});
  return <section className="space-y-4" aria-label={t("tabs.failed")}>
    <QueueFilters filters={filters} change={change} actions={<AppButton variant="surface" disabled={query.isFetching} onClick={()=>void query.refetch()}><RefreshCw className="size-4" aria-hidden="true"/>{t("refresh")}</AppButton>}
      extra={{count:Number(filters.state!=="unresolved")+Number(Boolean(filters.classification))+Number(Boolean(filters.code)),reset:{state:null,classification:null,code:null},chips:[
        ...(filters.state!=="unresolved"?[{label:t("failureState")+": "+t("failureStates."+filters.state),onRemove:()=>change({state:null})}]:[]),
        ...(filters.classification?[{label:t("classification")+": "+t("classifications."+filters.classification),onRemove:()=>change({classification:null})}]:[]),
        ...(filters.code?[{label:t("errorCode")+": "+filters.code,onRemove:()=>change({code:null})}]:[])],content:<>
        <label className="grid gap-2 text-xs">{t("failureState")}<AppSortSelect className="w-full" ariaLabel={t("failureState")} value={filters.state} onValueChange={state=>change({state})} options={["unresolved","redriving","resolved","abandoned","all"].map(value=>({value,label:t("failureStates."+value)}))}/></label>
        <label className="grid gap-2 text-xs">{t("classification")}<AppSortSelect className="w-full" ariaLabel={t("classification")} value={filters.classification??"all"} onValueChange={value=>change({classification:value==="all"?null:value})} options={[{value:"all",label:t("all")},...(["terminal","reconciliation"] as const).map(value=>({value,label:t("classifications."+value)}))]}/></label>
        <label className="grid gap-2 text-xs">{t("errorCode")}<QueueTextField value={filters.code} label={t("errorCode")} validate={value=>/^[A-Z][A-Z0-9_]{0,119}$/.test(value)} change={code=>change({code})}/></label>
      </>}}/>
    <div className="flex flex-wrap items-center justify-end gap-2 text-xs text-muted-foreground">{query.data&&<span>{t("sampledAt")} <ConsoleTime value={query.data.sampledAt}/></span>}</div>
    {query.isError&&<ConsoleError error={query.error} stale={Boolean(query.data)} retry={()=>void query.refetch()}/>}
    {query.isPending&&!query.data&&<p role="status" className="p-6">{t("loading")}</p>}
    {query.data?.items.length===0&&<AppResourceEmpty icon={<Layers/>} title={t("noFailures")} description={t("failedEmptyHint")}/>}
    {Boolean(query.data?.items.length)&&<QueueTable label={t("tabs.failed")} rows={query.data!.items} rowKey={job=>job.id} selected={selected} columns={[
      {key:"job",label:t("columns.job"),className:"lg:w-[26%]",cell:job=><button type="button" className={queueRowButton} onClick={()=>change({job:job.id,entry:job.entry.id})}><span className="flex items-start gap-2"><QueueKindIcon kind={job.kind} className="mt-0.5 size-4 shrink-0 text-muted-foreground"/><span>{queueDisplayTitle(job,t("kinds."+job.kind))}<span className="mt-1 block text-[10px] text-muted-foreground">{t("kinds."+job.kind)} · {shortQueueId(job.id)}</span></span></span></button>},
      {key:"model",label:t("columns.model"),cell:job=><span className="break-all text-muted-foreground">{job.model??t("kinds."+job.kind)}</span>},
      {key:"status",label:t("filters.status"),cell:job=><ConsoleStatus value={job.status}/>},
      {key:"failure",label:t("failureState"),cell:job=><ConsoleStatus value={job.entry.state}/>},
      {key:"reason",label:t("errorCode"),className:"lg:max-w-48",cell:job=><ConsoleOperationReason code={job.entry.safeErrorCode}/>},
      {key:"failed",label:t("failureAt"),cell:job=><ConsoleTime compact value={job.entry.createdAt}/>},
      {key:"age",label:t("failureElapsed"),cell:job=><ConsoleDuration start={job.entry.createdAt} end={query.data!.sampledAt}/>},
      {key:"failures",label:t("columns.failures"),cell:job=><span className="tabular-nums">{job.failureCount}</span>},
      {key:"count",label:t("redrives"),cell:job=><span className="tabular-nums">{job.cycle-1}</span>},
    ]}/>}
    <ConsolePagination page={cursors.length-1} busy={query.isFetching} previous={()=>setCursors(old=>old.slice(0,-1))} next={query.data?.nextCursor?()=>setCursors(old=>[...old,query.data!.nextCursor!]):null}/>
  </section>;
}
