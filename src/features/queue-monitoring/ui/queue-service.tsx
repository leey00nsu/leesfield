"use client";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { RefreshCw } from "lucide-react";
import type { ConsoleJob, ConsoleOverview, ConsolePage, ConsoleQuery } from "@/shared/api/job-queue-console-contract";
import { AppButton } from "@/shared/ui/app-button";
import { useQueueConsole } from "../hook/use-queue-console";
import { useConsolePagination } from "../hook/use-console-pagination";
import { QueueOverview } from "./queue-overview";
import { QueueFilters, QueueJobList } from "./queue-job-list";
import { ConsoleError, ConsolePagination, ConsoleTime } from "./console-common";
type Props={filters:ConsoleQuery;selected:string|null;change:(values:Record<string,string|undefined|null>)=>void};
export function QueueService({change,selected}:Pick<Props,"change">&{selected?:string|null}) {
  const t=useTranslations("queueMonitoring");
  const [automatic,setAutomatic]=useState(true);
  const overview=useQueueConsole<ConsoleOverview>("overview",{},{poll:automatic&&!selected});
  return <section className="space-y-4" aria-label={t("tabs.service")}>
    <div className="flex flex-wrap items-center justify-between gap-3"><div className="ml-auto flex flex-wrap gap-2"><QueueRefreshToggle value={automatic} onChange={setAutomatic}/><AppButton variant="surface" className="h-10" disabled={overview.isFetching} onClick={()=>void overview.refetch()}><RefreshCw className="size-4" aria-hidden="true"/>{t("refresh")}</AppButton></div></div>
    {overview.isError&&<ConsoleError error={overview.error} stale={Boolean(overview.data)} retry={()=>void overview.refetch()}/>}
    {overview.isPending&&!overview.data&&<p role="status" className="py-8 text-sm text-muted-foreground">{t("loading")}</p>}
    {overview.data&&<QueueOverview data={overview.data} onSelect={id=>change({job:id})}/>}
  </section>;
}
export function QueueJobs({filters,selected,change}:Props) {
  const t=useTranslations("queueMonitoring"),{cursors,setCursors}=useConsolePagination(filters);
  const [automatic,setAutomatic]=useState(true);
  const jobs=useQueueConsole<ConsolePage<ConsoleJob>>("jobs",{...filters,cursor:cursors.at(-1)},{poll:automatic&&cursors.length===1&&filters.view==="current"&&!selected});
  return <section className="space-y-4" aria-label={t("jobs")}>
    <QueueFilters filters={filters} change={change} actions={<>{filters.view==="current"&&<QueueRefreshToggle value={automatic} onChange={setAutomatic}/>}<AppButton variant="surface" disabled={jobs.isFetching} onClick={()=>void jobs.refetch()}><RefreshCw className="size-4" aria-hidden="true"/>{t("refresh")}</AppButton></>}/>
    <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground"><h2 className="sr-only">{t("jobs")}</h2>{selected&&<p>{t("selectionPaused")}</p>}{jobs.data&&<span>{t("sampledAt")} <ConsoleTime value={jobs.data.sampledAt}/></span>}
      {selected&&<AppButton variant="ghost" size="sm" onClick={()=>change({job:null})}>{t("clearSelection")}</AppButton>}
    </div>
    {jobs.isError&&<ConsoleError error={jobs.error} stale={Boolean(jobs.data)} retry={()=>void jobs.refetch()}/>}
    {jobs.isPending&&!jobs.data&&<p role="status" className="p-8 text-center text-sm text-muted-foreground">{t("loading")}</p>}
    {jobs.data&&<QueueJobList sampledAt={jobs.data.sampledAt} items={jobs.data.items} selected={selected} onSelect={id=>change({job:id})}/>}
    <ConsolePagination page={cursors.length-1} busy={jobs.isFetching} previous={()=>setCursors(old=>old.slice(0,-1))} next={jobs.data?.nextCursor?()=>setCursors(old=>[...old,jobs.data!.nextCursor!]):null}/>
  </section>;
}

function QueueRefreshToggle({value,onChange}:{value:boolean;onChange:(value:boolean)=>void}) {const t=useTranslations("queueMonitoring");return <AppButton type="button" variant="surface" aria-pressed={value} onClick={()=>onChange(!value)}><span aria-hidden="true" className={"size-1.5 rounded-full "+(value?"bg-data-accent":"bg-muted-foreground")}/>{t(value?"autoRefreshOn":"autoRefreshOff")}</AppButton>;}
