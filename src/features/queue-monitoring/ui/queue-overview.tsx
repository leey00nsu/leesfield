"use client";
import { useTranslations } from "next-intl";
import { Activity, Clock3, Layers, ShieldQuestion } from "lucide-react";
import type { ConsoleOverview, ConsoleOccupant } from "@/shared/api/job-queue-console-contract";
import { AppButton } from "@/shared/ui/app-button";
import { AppPopover, AppPopoverTrigger, AppPopoverContent } from "@/shared/ui/app-popover";
import { AppCard } from "@/shared/ui/app-card";
import { ConsoleStatus, ConsoleTime } from "./console-common";
import { QueueKindIcon } from "./queue-kind-icon";
import { QueueTable, queueRowButton } from "./queue-table";
import { ConsoleDuration, shortQueueId } from "./queue-times";
const pools=["generation","media-operation","assistant","storage-cleanup"];
export function QueueOverview({data,onSelect}:{data:ConsoleOverview;onSelect:(id:string)=>void}) {
  const t=useTranslations("queueMonitoring");
  const metrics=[{label:"pending",value:data.counts.pending,icon:Clock3},{label:"active",value:data.counts.active,icon:Activity},{label:"unresolvedJobs",value:data.counts.unresolvedJobs,icon:Layers},{label:"uncertainJobs",value:data.counts.uncertainJobs,icon:ShieldQuestion}] as const;
  const occupants=[...new Map(data.occupants.filter(item=>pools.includes(item.resourceKey)).map(item=>[item.attemptId,item])).values()].sort((a,b)=>pools.indexOf(a.resourceKey)-pools.indexOf(b.resourceKey)||a.startedAt.localeCompare(b.startedAt)||a.attemptId.localeCompare(b.attemptId));
  const oldest=Object.values(data.byKind).map(kind=>kind.oldestPendingAt).filter((at):at is string=>at!==null).sort()[0];
  function title(item:ConsoleOccupant) {return item.title&&!item.title.startsWith(item.kind+" ·")?item.title:t("kinds."+item.kind)+" · "+shortQueueId(item.executionId);}
  return <div className="space-y-4">
    <AppCard variant="editorial-flat" className="gap-0 py-0"><dl className="grid grid-cols-2 divide-x divide-border sm:grid-cols-4">{metrics.map(({label,value,icon:Icon})=><div key={label} className="flex items-center gap-3 px-4 py-3"><Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden="true"/><div className="min-w-0"><dt className="text-xs text-muted-foreground">{t("counts."+label)}</dt><dd className="mt-1 text-2xl font-semibold tabular-nums">{value.toLocaleString()}</dd></div></div>)}</dl></AppCard>
    <section aria-label={t("resourcesTitle")} className="space-y-3"><div className="flex items-center justify-between gap-3"><h2 className="text-sm font-semibold">{t("resourcesTitle")}</h2>{data.resources.some(resource=>resource.modelKey!==null)&&<AppPopover><AppPopoverTrigger asChild><AppButton variant="surface" size="sm">{t("modelLimits")}</AppButton></AppPopoverTrigger><AppPopoverContent align="end" className="max-h-80 w-80 overflow-auto"><p className="text-xs text-muted-foreground">{t("modelLimitsHint")}</p><dl className="mt-3 space-y-3 text-xs">{data.resources.filter(resource=>resource.modelKey!==null).map(resource=><div key={resource.key}><dt className="break-all font-medium">{resource.modelKey}</dt><dd className="mt-1 text-muted-foreground">{t("modelLimitCount",{reserved:resource.reserved,capacity:resource.capacity,uncertain:resource.uncertain})}</dd></div>)}</dl></AppPopoverContent></AppPopover>}</div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">{pools.map(key=>{
        const resource=data.resources.find(item=>item.key===key),active=occupants.filter(item=>item.resourceKey===key&&item.status==="active"&&item.disposition!=="uncertain").length;
        const capacity=resource?.capacity??0;
        return <div key={key} className="min-w-0 rounded-lg border border-border p-3"><div className="flex items-start justify-between gap-2"><h3 className="text-xs font-medium">{t("pools."+key)}</h3><span className="shrink-0 text-sm tabular-nums">{resource?.reserved??"—"} / {resource?.capacity??"—"}</span></div><QueueResourceSlots capacity={capacity} reserved={resource?.reserved??0} uncertain={resource?.uncertain??0}/><p className="text-[11px] text-muted-foreground">{t("poolUsage",{active,uncertain:resource?.uncertain??0,available:resource?.available??0})}</p>{resource?.capacitySource==="policy_default"&&<p className="mt-1 text-[10px] text-muted-foreground">{t("configuredLimit")}</p>}{resource&&resource.excess>0&&<p className="mt-1 text-xs text-warning-foreground">{t("excess",{count:resource.excess})}</p>}</div>;
      })}</div>

    </section>
    <section aria-label={t("slots")} className="space-y-3"><div className="flex flex-wrap items-center justify-between gap-2"><h2 className="text-sm font-semibold">{t("slots")} <span className="ml-2 text-xs font-normal text-muted-foreground">{occupants.length}</span></h2><span className="text-[11px] text-muted-foreground">{t("slotsHint")}</span></div>
      {occupants.length?<QueueTable label={t("slots")} rows={occupants} rowKey={item=>item.attemptId} columns={[
        {key:"job",label:t("columns.job"),className:"lg:w-[30%]",cell:item=><button type="button" className={queueRowButton} title={item.executionId} onClick={()=>onSelect(item.jobId)}><span className="flex items-start gap-2"><QueueKindIcon kind={item.kind} className="mt-0.5 size-4 shrink-0 text-muted-foreground"/><span className="break-words">{title(item)}</span></span></button>},
        {key:"kind",label:t("filters.kind"),cell:item=><span className="text-muted-foreground">{t("kinds."+item.kind)}</span>},
        {key:"model",label:t("columns.model"),cell:item=><span className="break-all text-muted-foreground">{item.model??t("kinds."+item.kind)}</span>},
        {key:"worker",label:t("filters.worker"),cell:item=><span className="break-all font-mono text-[11px] text-muted-foreground" title={item.workerInstanceId}>{shortQueueId(item.workerInstanceId)}</span>},
        {key:"duration",label:t("columns.duration"),cell:item=>item.disposition==="uncertain"?<span className="text-warning-foreground">{t("remoteFinishUnknown")}</span>:<ConsoleDuration start={item.startedAt} end={item.finishedAt??(item.status==="active"?data.sampledAt:null)}/>},
        {key:"status",label:t("filters.status"),cell:item=><ConsoleStatus value={item.disposition==="uncertain"?"uncertain":item.status==="active"?"active":"reserved"}/>},
      ]}/>:<p className="rounded-lg border border-border p-5 text-xs text-muted-foreground">{t("noOccupants")}</p>}
    </section>
    {(data.resourcesTruncated||data.occupantsTruncated)&&<p role="status" className="text-xs text-warning-foreground">{t("truncated")}</p>}
    <details className="rounded-lg border border-border px-4 py-3"><summary className="cursor-pointer text-xs text-muted-foreground">{t("queueDetails")} · {t("protectedCount",{count:data.counts.suspended})} · {t("oldestWaiting")}: <ConsoleDuration start={oldest} end={data.sampledAt}/></summary><div className="mt-4 space-y-3 text-xs text-muted-foreground"><p>{t("waitingAgeHint")}</p><p>{t("failedSummary",{count:data.counts.unresolvedJobs,reconciliation:data.counts.reconciliationJobs})}</p><p>{t("processScope")} · <span title={data.process.workerInstanceId}>{shortQueueId(data.process.workerInstanceId)}</span> · {t(data.process.stopping?"processStopping":data.process.started?"processStarted":"processStopped")} · {t("heartbeat")} <ConsoleTime value={data.process.lastHeartbeatAt}/></p></div></details>
  </div>;
}

/** Each segment is a resource place; very large capacities use at most 32 visual groups. */
function QueueResourceSlots({capacity,reserved,uncertain}:{capacity:number;reserved:number;uncertain:number}) {
  const total=Math.max(capacity,reserved),count=Math.min(32,total),held=Math.max(0,reserved-uncertain);
  return <div aria-hidden="true" className="my-3 flex h-2 gap-1">{Array.from({length:count},(_,index)=>{
    const from=index*total/count,to=(index+1)*total/count;
    const heldWidth=Math.max(0,Math.min(to,held)-from)/(to-from)*100;
    const uncertainWidth=Math.max(0,Math.min(to,reserved)-Math.max(from,held))/(to-from)*100;
    return <span key={index} className="flex min-w-0 flex-1 overflow-hidden rounded-[2px] bg-muted"><span className="bg-data-accent" style={{width:heldWidth+"%"}}/><span className="bg-warning-foreground bg-[repeating-linear-gradient(120deg,transparent,transparent_3px,var(--color-background)_3px,var(--color-background)_5px)]" style={{width:uncertainWidth+"%"}}/></span>;
  })}</div>;
}
