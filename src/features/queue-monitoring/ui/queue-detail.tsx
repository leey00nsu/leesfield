"use client";
import { useEffect, useId, useState, type ReactNode, type RefObject } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import type { ConsoleAction, ConsoleAttempt, ConsoleDeadLetter, ConsoleJobDetail } from "@/shared/api/job-queue-console-contract";
import { AppDialogDescription, AppDialogTitle } from "@/shared/ui/app-dialog";
import { AppMediaDetailDialog, AppMediaDetailBackdrop, useMediaDetailDialog } from "@/shared/ui/app-media-detail-dialog";
import { AppMediaDetailRail } from "@/shared/ui/app-media-detail-rail";
import { Copy } from "lucide-react";
import { useClipboardCopy } from "@/shared/ui/use-clipboard-copy";
import { AppButton } from "@/shared/ui/app-button";
import { queueConsoleKey, useQueueConsole, useQueueConsoleHistory } from "../hook/use-queue-console";
import { ConsoleError, ConsoleOperationReason, ConsoleStatus, ConsoleJobStatus, ConsoleTime } from "./console-common";
import { useMonitoringRequestDetail } from "@/features/monitoring-dashboard/hook/use-monitoring-dashboard";
import { MonitoringRequestDetailContent } from "@/features/monitoring-dashboard/ui/monitoring-request-detail-dialog";
import { QueueExecutionSummary, QueueJobFlow, QueueResultSummary } from "./queue-execution-summary";
import { QueueCleanupDetail } from "./queue-cleanup-detail";
import { QueueActions } from "./queue-actions";
import { queueDisplayTitle } from "./queue-kind-icon";

export function QueueDetail({jobId,entryId,onClose,returnFocus}:{jobId:string|null;entryId:string|null;onClose:()=>void;returnFocus:RefObject<HTMLElement|null>}){
  const t=useTranslations("queueMonitoring");
  const dialog=useMediaDetailDialog(onClose);
  return <AppMediaDetailDialog controller={dialog} open={Boolean(jobId)} finalFocus={returnFocus}
      className="nodrag nopan nowheel grid h-dvh grid-rows-[auto_minmax(0,1fr)] gap-0 overflow-hidden lg:grid-cols-[1fr_25rem] lg:grid-rows-[minmax(0,1fr)]">
      <AppDialogTitle className="sr-only">{t("detailTitle")}</AppDialogTitle><AppDialogDescription className="sr-only">{t("detailHint")}</AppDialogDescription>
      {jobId&&<QueueDetailBody key={jobId} jobId={jobId} initialEntry={entryId} onClose={dialog.requestClose}/>}
  </AppMediaDetailDialog>;
}
function CopyId({label,value}:{label:string;value:string}){const t=useTranslations("queueMonitoring"),copy=useClipboardCopy();return <div className="min-w-0"><dt className="text-[11px] text-muted-foreground">{label}</dt><dd className="relative mt-1 flex min-h-12 items-center rounded-md border border-border bg-muted/20 py-3 pl-4 pr-12"><code className="min-w-0 break-all text-xs">{value}</code><AppButton type="button" size="icon-sm" variant="ghost" className="absolute top-1/2 right-2 -translate-y-1/2" aria-label={t("copyId",{label})} onClick={()=>void copy(value)}><Copy className="block size-4 shrink-0"/></AppButton></dd></div>;}

function QueueDetailBody({jobId,initialEntry,onClose}:{jobId:string;initialEntry:string|null;onClose:()=>void}){
  const t=useTranslations("queueMonitoring"),client=useQueryClient();const query=useQueueConsole<ConsoleJobDetail>(`jobs/${jobId}`);
  const [tab,setTab]=useState("general"),[chosenEntry,setChosenEntry]=useState<string|null>(null);
  const refresh=()=>Promise.all([client.invalidateQueries({queryKey:queueConsoleKey}),client.invalidateQueries({queryKey:["monitoring","request-detail"]})]);
  const job=query.data,entry=chosenEntry??initialEntry??job?.currentDeadLetter?.id??job?.latestDeadLetter?.id;
  const formId=useId();
  const type=job?.kind==="generate_image"?"image":job?.kind==="generate_video"?"video":job?.kind==="generate_audio"?"audio":null;
  const result=useMonitoringRequestDetail(type,job?.requestId??null,Boolean(type&&job?.requestId));
  const flow=job&&<QueueJobFlow job={job}/>;

  return <>
    <AppMediaDetailBackdrop className="max-h-[32dvh] min-h-0 overflow-y-auto overscroll-contain p-5 lg:max-h-none lg:p-10" aria-label={t("detailTabs.flow")}>
      {job?<div data-app-media-detail-content="" className="mx-auto max-w-3xl space-y-8"><div className="flex items-start justify-between gap-2"><div className="min-w-0"><h2 className="break-words text-lg font-semibold">{queueDisplayTitle(job,t("kinds."+job.kind))}</h2><div className="mt-2 flex flex-wrap gap-2"><ConsoleJobStatus job={job}/><span className="text-xs text-muted-foreground">{t("cycle",{cycle:job.cycle})}</span></div></div></div>
<QueueExecutionSummary job={job}/><div className="hidden space-y-6 lg:block"><section className="space-y-3"><h3 className="text-sm font-semibold">{t("detailTabs.flow")}</h3>{flow}</section><QueueResultSummary job={job} query={result}/></div></div>:query.isPending?<p role="status">{t("loading")}</p>:null}
    </AppMediaDetailBackdrop>
    <AppMediaDetailRail readOnly formId={formId} onClose={onClose} closeLabel={t("close")} tabsLabel={t("detailTabsLabel")} value={tab} onValueChange={setTab} testId="queue-job-detail-rail"
      notice={<>{query.isError&&<ConsoleError error={query.error} stale={Boolean(job)} retry={()=>void query.refetch()}/>} {query.isPending&&!job&&<p role="status">{t("loading")}</p>}</>}
      headerActions={job&&<p className="text-[11px] text-muted-foreground">{t("sampledAt")} <ConsoleTime value={job.sampledAt}/></p>}
      actions={<AppButton className="col-span-full w-full" variant="surface" disabled={query.isFetching} onClick={()=>void refresh()}>{t("refresh")}</AppButton>}
      tabs={job?["general","attempts","failures","actions"].map(value=>({value,label:t("detailTabs."+value)+(value==="general"?"":` (${value==="failures"?job.counts.deadLetters:job.counts[value as "attempts"|"actions"]})`),content:tab!==value?null:value==="general"?<div className="space-y-4">      {!job.sourceAvailable&&<p role="status" className="text-xs text-warning-foreground">{t("sourceMissing")}</p>}
      <dl className="grid grid-cols-2 gap-4 text-xs"><div><dt className="text-muted-foreground">{t("filters.kind")}</dt><dd className="mt-1">{t("kinds."+job.kind)}</dd></div><div><dt className="text-muted-foreground">{t("filters.origin")}</dt><dd className="mt-1">{t("origins."+job.origin)}</dd></div><div><dt className="text-muted-foreground">{t("filters.model")}</dt><dd className="mt-1 break-all">{job.model??t("noModel")}</dd></div><div><dt className="text-muted-foreground">{t("phase")}</dt><dd className="mt-1">{t.has("phases."+job.phase)?t("phases."+job.phase):t.has("statuses."+job.phase)?t("statuses."+job.phase):t("unknown")}</dd></div></dl>
      {job.reasons.length>0&&<div className="space-y-2 rounded-md bg-muted/30 p-3 text-xs">{job.reasons.map(reason=><p key={reason}>{t("reasons."+reason)}</p>)}</div>}
      <div className="lg:hidden">{flow}</div>
      <details open className="rounded-lg border border-border p-4"><summary className="cursor-pointer rounded text-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring">{t("detailedInformation")}</summary><div className="mt-4 space-y-4">
      <QueueRequestResult job={job} query={result}/>
      {job.kind==="storage_cleanup"&&<QueueCleanupDetail cleanup={job.cleanup??null} jobStatus={job.status}/>}
      <dl className="grid gap-4 rounded-lg border border-border p-4"><CopyId label={t("jobId")} value={job.id}/><CopyId label={t("sourceId")} value={job.sourceId}/><CopyId label={t("executionId")} value={job.executionId}/></dl>
      {(job.requestId||job.sourceRequestId)&&<dl className="grid gap-3">{job.sourceRequestId&&<CopyId label={t("sourceRequestId")} value={job.sourceRequestId}/>} {job.requestId&&<CopyId label={t("requestId")} value={job.requestId}/>}</dl>}
      {job.attempt&&<dl><CopyId label={t("filters.worker")} value={job.attempt.workerInstanceId}/></dl>}
        {entry&&<dl><CopyId label={t("failureId")} value={entry}/></dl>}
        <div className="space-y-2 text-xs"><p className="text-muted-foreground">{t("filters.resource")}</p><div className="flex flex-wrap gap-2">{job.resources.map(key=><code key={key} className="break-all rounded border border-border px-2 py-1">{key}</code>)}</div>
        {job.group&&<p>{t("groupState",{sequence:job.group.sequence??"—",head:job.group.head})}{job.group.blockedByJobId&&<code className="ml-1 break-all">{job.group.blockedByJobId}</code>}</p>}</div>
      </div></details>
      {entry&&<div className="space-y-2">
        {job.currentDeadLetter&&entry!==job.currentDeadLetter.id&&<AppButton size="sm" variant="surface" onClick={()=>setChosenEntry(job.currentDeadLetter!.id)}>{t("inspectCurrentFailure")}</AppButton>}
        <QueueActions key={entry} entryId={entry} jobId={jobId} refresh={refresh}/></div>}
</div>:value==="attempts"?<QueueHistoryPage<ConsoleAttempt> path={`jobs/${jobId}/attempts`} renderItem={item=><div className="space-y-2">
          <div className="flex flex-wrap justify-between gap-2"><h4 className="font-medium">{t("attemptOrdinal",{ordinal:item.lifetimeOrdinal,cycle:item.cycle})}</h4><ConsoleStatus value={item.outcome??"active"}/></div>
          <p className="break-all font-mono text-[11px]">{item.executionId}</p><p className="break-all text-[11px] text-muted-foreground">{t("filters.worker")}: {item.workerInstanceId}</p>
          <p><ConsoleTime value={item.startedAt}/> → <ConsoleTime value={item.finishedAt}/></p>
          {item.imported&&<p className="text-warning-foreground">{t("imported")}</p>}
          {item.reservations.map(r=><p key={r.resourceKey} className="break-all text-[11px]">{r.resourceKey} · {r.releasedAt?t("released"):t(r.disposition==="uncertain"?"reservationUnknown":"reservationHeld")} · <ConsoleTime value={r.releasedAt}/></p>)}
        </div>}/>:value==="failures"?<QueueHistoryPage<ConsoleDeadLetter> path={`jobs/${jobId}/dead-letters`} renderItem={item=><div className="space-y-2">
          <div className="flex flex-wrap justify-between gap-2"><ConsoleStatus value={item.state}/><ConsoleTime value={item.createdAt}/></div><ConsoleOperationReason code={item.safeErrorCode}/>
          <p className="text-xs text-muted-foreground">{t("classifications."+item.classification)}</p><AppButton size="sm" variant="surface" onClick={()=>{setChosenEntry(item.id);setTab("general");}}>{t("inspectFailure")}</AppButton>
        </div>}/>:<QueueHistoryPage<ConsoleAction> path={`jobs/${jobId}/actions`} renderItem={item=><div className="space-y-2">
          <div className="flex flex-wrap justify-between gap-2"><h4>{t.has("actions."+item.action)?t("actions."+item.action):item.action}</h4><span>{t("auditOutcomes."+item.outcome)}</span></div>
          <ConsoleTime value={item.createdAt}/><p><ConsoleOperationReason code={item.safeReason}/></p>{item.result.code&&<p><ConsoleOperationReason code={item.result.code}/></p>}
          {item.result.executionId&&<p className="break-all font-mono text-[11px]">{item.result.executionId}</p>}<p className="text-[11px] text-muted-foreground">{t("actorOpaque")}</p>
        </div>}/>})):[]}/>
  </>;
}
function QueueHistoryPage<T extends{id:string}>({path,renderItem}:{path:string;renderItem:(item:T)=>ReactNode}){
  const t=useTranslations("queueMonitoring"),query=useQueueConsoleHistory<T>(path);
  const [sentinel,setSentinel]=useState<HTMLDivElement|null>(null);
  const {hasNextPage,isFetching,isFetchNextPageError,fetchNextPage}=query;
  useEffect(()=>{
    if(!sentinel||!hasNextPage||isFetching||isFetchNextPageError||typeof IntersectionObserver==="undefined")return;
    const observer=new IntersectionObserver(entries=>{if(entries.some(entry=>entry.isIntersecting))void fetchNextPage({cancelRefetch:false});},
      {root:sentinel.closest('[role="tabpanel"]'),rootMargin:"120px"});
    observer.observe(sentinel);return ()=>observer.disconnect();
  },[sentinel,hasNextPage,isFetching,isFetchNextPageError,fetchNextPage]);
  const items=[...new Map(query.data?.pages.flatMap(page=>page.items).map(item=>[item.id,item])).values()];
  return <div className="overflow-hidden rounded-lg border border-border" aria-busy={isFetching}>
    {query.isError&&<ConsoleError error={query.error} stale={Boolean(query.data)} retry={()=>void (query.isFetchNextPageError?query.fetchNextPage({cancelRefetch:false}):query.refetch())}/>}
    {query.isPending&&!query.data&&<p role="status" className="p-4">{t("loading")}</p>}
    {query.data&&!items.length&&<p className="p-4 text-xs text-muted-foreground">{t("noHistory")}</p>}
    <ol className="divide-y divide-border text-xs">{items.map(item=><li key={item.id} className="p-4">{renderItem(item)}</li>)}</ol>
    <div ref={setSentinel} className="p-3 text-center text-xs text-muted-foreground">
      {query.isFetchingNextPage?<p role="status">{t("loading")}</p>:query.hasNextPage?<AppButton variant="surface" size="sm" disabled={isFetching} onClick={()=>void query.fetchNextPage({cancelRefetch:false})}>{t("loadMoreHistory")}</AppButton>:items.length>0?<p>{t("historyEnd")}</p>:null}
    </div>
  </div>;
}
function QueueRequestResult({job,query}:{job:ConsoleJobDetail;query:ReturnType<typeof useMonitoringRequestDetail>}) {
  const t=useTranslations("queueMonitoring");
  const type=job.kind==="generate_image"?"image":job.kind==="generate_video"?"video":job.kind==="generate_audio"?"audio":null;
  if(!type)return null;
  if(!job.requestId)return <p className="text-xs text-muted-foreground">{t("resultMissing")}</p>;
  return <section aria-label={t("requestResult")} className="space-y-3">
    <h3 className="text-sm font-semibold">{t("requestResult")}</h3>
    {job.cycle>1&&<p className="text-xs text-muted-foreground">{t("currentExecutionResult")}</p>}
    {query.isPending&&<p role="status" className="text-xs">{t("loading")}</p>}
    {query.isError&&<div role="alert" className="space-y-2 text-xs text-warning-foreground"><p>{t("resultError")}</p><AppButton variant="surface" size="sm" onClick={()=>void query.refetch()}>{t("refresh")}</AppButton></div>}
    {query.data?<MonitoringRequestDetailContent detail={query.data} timeZone={Intl.DateTimeFormat().resolvedOptions().timeZone??"UTC"} compact/>:!query.isPending&&!query.isError?<p className="text-xs text-muted-foreground">{t("resultMissing")}</p>:null}
  </section>;
}
