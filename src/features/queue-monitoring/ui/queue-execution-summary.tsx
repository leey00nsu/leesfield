"use client";
import { useLocale, useTranslations } from "next-intl";
import { ImageIcon, LoaderCircle } from "lucide-react";
import type { ConsoleJobDetail } from "@/shared/api/job-queue-console-contract";
import type { useMonitoringRequestDetail } from "@/features/monitoring-dashboard/hook/use-monitoring-dashboard";
import { VariantImage } from "@/shared/media-assets/variant-image";
import { AppVideoPlayer } from "@/shared/ui/app-video-player";
import { AppAudioPlayer } from "@/shared/ui/app-audio-player";
import { ConsoleTime } from "./console-common";
import { ConsoleAttemptDuration, ConsoleDuration, cycleAdmission, cycleStart, waitingUntil } from "./queue-times";

export function QueueExecutionSummary({job}:{job:ConsoleJobDetail}) {
  const t=useTranslations("queueMonitoring");
  return <dl className="grid grid-cols-3 divide-x divide-border rounded-lg border border-border">
    <div className="p-3 sm:p-4"><dt className="text-[10px] text-muted-foreground sm:text-xs">{t("cycleWaiting")}</dt><dd className="mt-2 text-sm font-medium sm:text-xl"><ConsoleDuration start={cycleAdmission(job)} end={waitingUntil(job,job.sampledAt)}/></dd></div>
    <div className="p-3 sm:p-4"><dt className="text-[10px] text-muted-foreground sm:text-xs">{t("currentAttemptElapsed")}</dt><dd className="mt-2 text-sm font-medium sm:text-xl"><ConsoleAttemptDuration job={job} sampledAt={job.sampledAt}/></dd></div>
    <div className="p-3 sm:p-4"><dt className="text-[10px] text-muted-foreground sm:text-xs">{t("phase")}</dt><dd className="mt-2 break-words text-xs font-medium sm:text-sm">{t.has("phases."+job.phase)?t("phases."+job.phase):t.has("statuses."+job.phase)?t("statuses."+job.phase):t("unknown")}</dd></div>
  </dl>;
}

export function QueueJobFlow({job}:{job:ConsoleJobDetail}) {
  const t=useTranslations("queueMonitoring"),locale=useLocale();
  const first=cycleStart(job);
  const events=[{label:t("admitted"),at:job.createdAt},
    ...(job.cycle>1?[{label:t("redriveAdmitted"),at:cycleAdmission(job)}]:[]),
    ...(first&&first!==job.attempt?.startedAt?[{label:t("cycleFirstStarted"),at:first}]:[]),
    ...(job.attempt?[{label:t("attemptStarted"),at:job.attempt.startedAt}]:[]),
    {label:t("localFinished"),at:job.attempt?.finishedAt??null}];
  const latest=events.findLastIndex(event=>Boolean(event.at));
  const time=new Intl.DateTimeFormat(locale,{hour:"2-digit",minute:"2-digit",second:"2-digit",hour12:false});
  return <div className="space-y-6 rounded-lg border border-border p-5 sm:p-6">
    <ol aria-label={t("detailTabs.flow")} className="flex pt-2">{events.map((event,index)=><li key={event.label} aria-current={index===latest&&job.status==="active"?"step":undefined} className="relative min-w-0 flex-1 pt-5 pr-2 text-[11px]">
      <span aria-hidden="true" className={"absolute top-0 right-0 left-0 border-t-2 "+(events[index+1]?.at?"border-data-accent":"border-dashed border-border")}/>
      <span aria-hidden="true" className={"absolute -top-1 left-0 size-2.5 rounded-full "+(event.at?"bg-data-accent":"bg-muted-foreground")}/>
      <p className="break-words font-medium">{event.label}</p><p className="mt-2 text-[10px] text-muted-foreground tabular-nums">{event.at?time.format(new Date(event.at)):index===events.length-1&&job.status==="active"?t("statuses.active"):t("unknownTime")}</p>
    </li>)}</ol>
    <dl className="divide-y divide-border text-xs">{events.map(event=><div key={event.label} className="flex flex-wrap justify-between gap-x-4 gap-y-1 py-3 first:pt-0 last:pb-0"><dt>{event.label}</dt><dd className="text-muted-foreground"><ConsoleTime value={event.at}/></dd></div>)}</dl>
    {job.status==="reconciliation_required"&&<p className="text-xs text-warning-foreground">{t("remoteFinishUnknown")}</p>}
  </div>;
}

export function QueueResultSummary({job,query}:{job:ConsoleJobDetail;query:ReturnType<typeof useMonitoringRequestDetail>}) {
  const t=useTranslations("queueMonitoring");
  if(!["generate_image","generate_video","generate_audio"].includes(job.kind))return null;
  const detail=query.data,asset=detail?.assets[0];
  return <section aria-label={t("resultPreview")} className="space-y-3">
    <h3 className="text-sm font-semibold">{t("resultPreview")}</h3>
    <div className="space-y-3 rounded-lg border border-border p-4 sm:p-5">
      <div className="flex flex-wrap gap-x-5 gap-y-2 text-xs text-muted-foreground"><span>{t("filters.model")} · {detail?.model??job.model??"—"}</span><span>{t("requestId")} · {job.requestId??"—"}</span></div>
      {detail?.errorMessage&&<p className="break-words text-sm text-destructive">{detail.errorMessage.slice(0,300)}</p>}
      {asset?<div className="overflow-hidden rounded-md bg-muted/20">{detail.type==="image"?<VariantImage asset={asset} alt={t("resultPreview")} className="max-h-60 w-full object-contain" loading="lazy"/>:detail.type==="video"?<AppVideoPlayer src={asset.url} controls className="max-h-60 w-full object-contain"/>:<div className="p-3"><AppAudioPlayer src={asset.url} controls className="w-full"/></div>}<p className="p-3 text-xs text-muted-foreground">{t("outputsCount",{count:detail.assets.length})}</p></div>:<div className="flex min-h-28 items-center justify-center gap-3 rounded-md bg-muted/20 text-muted-foreground">{job.status==="active"?<LoaderCircle className="size-5 animate-spin"/>:<ImageIcon className="size-6"/>}<span className="text-xs">{!job.requestId?t("resultMissing"):query.isError?t("resultError"):query.isPending?t("loading"):job.status==="active"?t("resultWaiting"):t("resultMissing")}</span></div>}
    </div>
  </section>;
}
