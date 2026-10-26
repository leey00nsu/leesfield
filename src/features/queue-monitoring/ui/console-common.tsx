"use client";
import type { ConsoleJob } from "@/shared/api/job-queue-console-contract";
import { useLocale, useTranslations } from "next-intl";
import { Badge } from "@/shared/ui/brand/badge/badge";
import { StatePanel } from "@/shared/ui/brand/state-panel/state-panel";
import { AppButton } from "@/shared/ui/app-button";
import { QueueConsoleHttpError } from "../api/queue-console-api";

export function ConsoleTime({value,compact=false}:{value:string|null;compact?:boolean}){const locale=useLocale();return value?<time dateTime={value} title={new Intl.DateTimeFormat(locale,{dateStyle:"short",timeStyle:"medium"}).format(new Date(value))}>{compact?<><span className="block text-[10px]">{new Intl.DateTimeFormat(locale,{month:"2-digit",day:"2-digit"}).format(new Date(value))}</span><span className="block whitespace-nowrap tabular-nums">{new Intl.DateTimeFormat(locale,{hour:"2-digit",minute:"2-digit",second:"2-digit",hour12:false}).format(new Date(value))}</span></>:new Intl.DateTimeFormat(locale,{dateStyle:"short",timeStyle:"medium"}).format(new Date(value))}</time>:<span>—</span>;}
export function ConsoleStatus({value}:{value:string}){
  const t=useTranslations("queueMonitoring");const key="statuses."+value;
  const color=value==="active"?"bg-data-accent/15 text-data-accent-foreground":value==="succeeded"||value==="resolved"?"bg-success text-success-foreground"
    :value==="dead_letter"?"bg-destructive/10 text-destructive":["retry_wait","reconciliation_required","uncertain","blocked"].includes(value)?"bg-warning text-warning-foreground":"";
  return <Badge variant="outline" className={color}>{t.has(key)?t(key):value}</Badge>;
}
export function ConsoleError({error,retry,stale=false}:{error:unknown;retry:()=>void;stale?:boolean}){
  const t=useTranslations("queueMonitoring");const status=error instanceof QueueConsoleHttpError?error.status:0;
  const description=status===401||status===403?t("errors.auth"):status===400?t("errors.input"):status===429?t("errors.rate",{seconds:(error as QueueConsoleHttpError).retryAfter??60}):status===409?t("errors.conflict"):t("errors.unavailable");
  return stale?<div role="alert" className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-warning/30 bg-warning/10 p-3 text-sm"><span>{t("stale")} {description}</span><AppButton size="sm" variant="surface" onClick={retry}>{t("refresh")}</AppButton></div>
    :<StatePanel tone="warning" title={t("errors.title")} description={<span role="alert">{description}</span>} action={<AppButton variant="surface" onClick={retry}>{t("refresh")}</AppButton>}/>;
}
export function ConsoleOperationReason({code}:{code:string}){const t=useTranslations("queueMonitoring");return <span>{t.has("operationReasons."+code)?t("operationReasons."+code):t("unknownReason")}<span className="ml-1 break-all font-mono text-[10px] text-muted-foreground">({code})</span></span>;}
export function ConsolePagination({page,previous,next,busy}:{page:number;previous:()=>void;next:(()=>void)|null;busy:boolean}){
  const t=useTranslations("queueMonitoring");return <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-4 py-3 text-xs text-muted-foreground">
    <span>{t("page",{page:page+1})}</span><div className="flex gap-2"><AppButton variant="surface" size="sm" disabled={page===0||busy} onClick={previous}>{t("previous")}</AppButton><AppButton variant="surface" size="sm" disabled={!next||busy} onClick={()=>next?.()}>{t("next")}</AppButton></div></div>;
}

export function ConsoleJobStatus({job}:{job:Pick<ConsoleJob,"kind"|"status"|"sourceStatus"|"primaryReason">}) {
  const value=job.primaryReason==="GROUP_BLOCKED"||job.primaryReason==="GROUP_CLOSED"?"blocked":job.kind==="storage_cleanup"&&job.status==="cancelled"&&job.sourceStatus==="linked"?"cleanup_released":job.status==="suspended"&&job.kind==="storage_cleanup"?job.sourceStatus==="linked"?"file_linked":job.sourceStatus==="uploading"?"upload_grace":job.status:job.status;
  return <ConsoleStatus value={value}/>;
}
