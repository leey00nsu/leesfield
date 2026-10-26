"use client";
import { useTranslations } from "next-intl";
import { useRef } from "react";
import { Activity, History, Layers, RotateCcw, ChartNoAxesCombined } from "lucide-react";
import { AppPageShell } from "@/shared/ui/app-page-shell";
import { AppPageSidebar } from "@/shared/ui/app-page-sidebar";
import { AppButton } from "@/shared/ui/app-button";
import { QueueJobs, QueueService } from "@/features/queue-monitoring/ui/queue-service";
import { QueueFailed } from "@/features/queue-monitoring/ui/queue-failed";
import { QueueDetail } from "@/features/queue-monitoring/ui/queue-detail";
import { consoleTabs, useConsoleLocation } from "@/features/queue-monitoring/model/console-location";
import { MonitoringRequestStatistics } from "./monitoring-request-statistics";

const icons = { current: Activity, history: History, service: Layers, failed: RotateCcw, statistics: ChartNoAxesCombined };
export function MonitoringDashboardScreen(){
  const t=useTranslations("queueMonitoring");const {tab,filters,failedFilters,selected,selectedEntry,change,invalid}=useConsoleLocation();
  const returnFocus=useRef<HTMLElement|null>(null);
  const update=(values:Record<string,string|undefined|null>)=>{if(values.job)returnFocus.current=document.activeElement instanceof HTMLElement?document.activeElement:null;change(values);};
  return <AppPageShell className="relative min-w-0 max-w-[1600px] gap-6 lg:grid lg:grid-cols-[18rem_minmax(0,1fr)]">
    <h1 className="sr-only">{t("title")}</h1>
    <AppPageSidebar title={t("title")} navigationLabel={t("navigation")} toggleLabel={t("toggleNavigation")}>
      {close=><div className="flex flex-col gap-1">{consoleTabs.map(value=>{
        const Icon=icons[value];
        return <AppButton key={value} size="sm" variant={tab===value?"surface-muted":"ghost"} aria-current={tab===value?"page":undefined} aria-controls="monitoring-content" className="justify-start" onClick={()=>{update({tab:value});close();}}><Icon className="size-4"/>{t("tabs."+value)}</AppButton>;
      })}</div>}
    </AppPageSidebar>
    <section id="monitoring-content" aria-label={t("tabs."+tab)} className="min-w-0 space-y-5">
      {invalid&&<p role="alert" className="text-xs text-warning-foreground">{t("invalidUrl")}</p>}
      {tab==="statistics"?<MonitoringRequestStatistics embedded/>:tab==="service"?<QueueService change={update} selected={selected}/>:tab==="failed"?<QueueFailed filters={failedFilters} selected={selected} change={update}/>:<QueueJobs key={tab} filters={filters} selected={selected} change={update}/>}
    </section>
    <QueueDetail jobId={selected} entryId={selectedEntry} onClose={()=>change({job:null})} returnFocus={returnFocus}/>
  </AppPageShell>;
}
