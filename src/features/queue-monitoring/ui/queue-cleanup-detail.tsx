"use client";
import { useTranslations } from "next-intl";
import type { ConsoleCleanup } from "@/shared/api/job-queue-console-contract";
import { ConsoleOperationReason, ConsoleTime } from "./console-common";
export function QueueCleanupDetail({cleanup,jobStatus}:{cleanup:ConsoleCleanup|null;jobStatus?:string}) {
  const t=useTranslations("queueMonitoring");
  if(!cleanup)return <p className="text-xs text-muted-foreground">{t("cleanup.missing")}</p>;
  const row=(label:string,value:React.ReactNode)=><div><dt className="text-muted-foreground">{label}</dt><dd className="mt-1 break-all">{value??"—"}</dd></div>;
  return <section aria-label={t("cleanup.title")} className="space-y-4 text-xs">
    <h3 className="text-sm font-semibold">{t("cleanup.title")}</h3>
    <dl className="grid gap-3">
      {row(t("cleanup.status"),jobStatus==="cancelled"&&cleanup.status==="linked"?t("statuses.cleanup_released"):t.has("cleanup.states."+cleanup.status)?t("cleanup.states."+cleanup.status):cleanup.status)}
      {row(t("cleanup.reason"),t.has("cleanup.reasons."+cleanup.reason)?t("cleanup.reasons."+cleanup.reason):t("unknownReason"))}
      {row(t("cleanup.file"),cleanup.fileName??t("cleanup.fileUnavailable"))}
      {row(t("cleanup.assetId"),cleanup.assetId)}
      {row(t("cleanup.provider"),cleanup.storageProvider)}
      {row(t("cleanup.objectId"),cleanup.storageObjectId??t("cleanup.objectRedacted"))}
      {cleanup.mediaType&&row(t("cleanup.mediaType"),t.has("cleanup.mediaTypes."+cleanup.mediaType)?t("cleanup.mediaTypes."+cleanup.mediaType):cleanup.mediaType)}
      {cleanup.mimeType&&row(t("cleanup.mime"),cleanup.mimeType)}
      {cleanup.bytes&&row(t("cleanup.size"),t("cleanup.bytes",{bytes:Number(cleanup.bytes).toLocaleString()}))}
      {row(t("cleanup.attempts"),cleanup.attempts)}
      {["uploading","pending","failed"].includes(cleanup.status)&&row(t(cleanup.status==="uploading"?"cleanup.graceUntil":"cleanup.retryAt"),<ConsoleTime value={cleanup.retryAt}/>)}
    </dl>
    <div><h4 className="font-medium">{t("cleanup.usageTitle")}</h4><dl className="mt-3 grid grid-cols-2 gap-3">{Object.entries(cleanup.usage).map(([key,count])=><div key={key}>{row(t("cleanup.usage."+key),count)}</div>)}</dl></div>
    {cleanup.lastError&&<p><ConsoleOperationReason code={cleanup.lastError}/></p>}
  </section>;
}
