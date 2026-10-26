"use client";
import { useState } from "react";
import { useTranslations } from "next-intl";
import type { ConsoleCapabilities } from "@/shared/api/job-queue-console-contract";
import { AppButton } from "@/shared/ui/app-button";
import { AppSortSelect } from "@/shared/ui/app-filter-toolbar";
import { AppDialog, AppDialogContent, AppDialogTitle, AppDialogDescription } from "@/shared/ui/app-dialog";
import { useQueueConsole } from "../hook/use-queue-console";
import { useQueueOperation } from "../hook/use-queue-operation";
import type { ConsoleOperation } from "../api/queue-console-api";
import { ConsoleError, ConsoleOperationReason, ConsoleTime } from "./console-common";

export function QueueActions({entryId,jobId,refresh}:{entryId:string;jobId:string;refresh:()=>Promise<unknown>}){
  const t=useTranslations("queueMonitoring");const capabilities=useQueueConsole<ConsoleCapabilities>(`dead-letters/${entryId}/capabilities`);
  const operation=useQueueOperation(entryId,refresh);
  const [selected,setSelected]=useState<ConsoleOperation|null>(null),[reason,setReason]=useState("CAUSE_FIXED");
  const action=selected??"redrive",cap=capabilities.data;
  function open(value:ConsoleOperation){operation.beginReview();setReason(operation.pending?.body.reason??(value==="reconcile"?"REMOTE_CHECK_REQUIRED":value==="abandon"?"OPERATOR_ABANDON":"CAUSE_FIXED"));setSelected(value);}
  const actions=["reconcile","redrive","abandon"] as const;
  return <section className="space-y-3 rounded-lg border border-border bg-card p-4" aria-label={t("actionsTitle")}>
    <h3 className="text-sm font-semibold">{t("actionsTitle")}</h3>
    {capabilities.isError&&<ConsoleError error={capabilities.error} stale={Boolean(cap)} retry={()=>void capabilities.refetch()}/>}
    {capabilities.isPending&&<p role="status" className="text-xs text-muted-foreground">{t("loading")}</p>}
    {cap&&cap.jobId===jobId&&<><div className="grid gap-3">
      {actions.map(value=><div key={value} className="space-y-1"><AppButton className="w-full" size="sm" variant={value==="abandon"?"danger":"surface"}
        disabled={cap[value].status==="blocked"||operation.busy||Boolean(operation.pending)} onClick={()=>open(value)}>{t("actions."+value)}</AppButton>
        {cap[value].status==="blocked"&&<p className="text-[11px] text-muted-foreground"><ConsoleOperationReason code={cap[value].reasons[0]}/></p>}
      </div>)}
    </div><p className="text-[11px] text-muted-foreground">{t("checkedAt")} <ConsoleTime value={cap.checkedAt}/></p></>}
    {operation.pending&&<div role="status" className="space-y-2 text-xs text-warning-foreground"><p>{t("pendingOperation")}</p><AppButton size="sm" variant="surface" disabled={operation.busy} onClick={()=>open(operation.pending!.action)}>{t("retrySameOperation")}</AppButton></div>}
    <AppDialog open={selected!==null} onOpenChange={next=>{if(!next&&!operation.busy)setSelected(null);}}>
      <AppDialogContent size="sm" showCloseButton={!operation.busy}>
        <AppDialogTitle>{t("actions."+action)}</AppDialogTitle><AppDialogDescription>{t("impacts."+action)}</AppDialogDescription>
        <p className="break-all font-mono text-xs text-muted-foreground">{jobId}</p>
        <label className="grid gap-2 text-sm">{t("reasonLabel")}<AppSortSelect ariaLabel={t("reasonLabel")} value={reason} className="w-full"
          options={["CAUSE_FIXED","RETRY_APPROVED","REMOTE_CHECK_REQUIRED","OPERATOR_ABANDON"].map(value=>({value,label:t("reasonChoices."+value)}))}
          onValueChange={value=>{if(!operation.pending&&!operation.busy)setReason(value);}}/></label>
        {Boolean(operation.error)&&<ConsoleError error={operation.error} retry={()=>void refresh()}/>}
        {operation.result&&<div role="status" className="rounded-md border border-border p-3 text-sm"><p>{t("outcomes."+action+"_"+operation.result.outcome)}</p>
          {operation.result.result?.code&&<p className="mt-2 text-xs"><ConsoleOperationReason code={operation.result.result.code}/></p>}
          {operation.result.result?.mode==="collect"&&<p className="mt-2 text-xs">{t("collectMode")}</p>}
        </div>}
        {operation.reviewRequired&&<p role="alert" className="text-sm text-warning-foreground">{t("reviewRequired")}</p>}
        <div className="flex flex-wrap justify-end gap-2"><AppButton variant="surface" disabled={operation.busy} onClick={()=>setSelected(null)}>{t("close")}</AppButton>
          {!operation.result&&!operation.reviewRequired&&<AppButton variant={action==="abandon"?"danger":"brand"} disabled={operation.busy||(!operation.pending&&(!cap||cap.jobId!==jobId||cap[action].status==="blocked"))}
            onClick={()=>void operation.run(action,{expectedVersion:cap?.entryVersion??operation.pending!.body.expectedVersion,reason,
              ...(action==="reconcile"&&cap?.reconcile.evidenceRef?{evidenceRef:cap.reconcile.evidenceRef}:{})})}>
            {operation.busy?t("sending"):operation.pending?t("retrySameOperation"):t("confirmOperation")}</AppButton>}
        </div>
      </AppDialogContent>
    </AppDialog>
  </section>;
}
