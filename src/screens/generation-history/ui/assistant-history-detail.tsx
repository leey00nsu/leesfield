"use client";

import { useId } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { Copy, Sparkles } from "lucide-react";
import type { GenerationHistoryItem } from "@/entities/generation/model/types";
import { useGenerationDetailTabs } from "@/features/generation-history/lib/use-generation-detail-tabs";
import { AppDialogTitle } from "@/shared/ui/app-dialog";
import { AppMediaDetailDialog, AppMediaDetailBackdrop, useMediaDetailDialog } from "@/shared/ui/app-media-detail-dialog";
import { AppMediaDetailRail } from "@/shared/ui/app-media-detail-rail";
import { AppDetailSection } from "@/shared/ui/app-detail-rail";
import { AppButton } from "@/shared/ui/app-button";
import { useClipboardCopy } from "@/shared/ui/use-clipboard-copy";

export function AssistantHistoryDetail({ item, onClose }: { item: GenerationHistoryItem; onClose: () => void }) {
  const t = useTranslations("history"), actions = useTranslations("common.actions"), copy = useClipboardCopy(), formId = useId();
  const dialog = useMediaDetailDialog(onClose);
  const query = useQuery({
    queryKey: ["history", "assistant-detail", item.id],
    queryFn: async ({ signal }) => {
      const response = await fetch("/api/history/" + encodeURIComponent(item.id) + "?type=assistant&view=detail", { cache: "no-store", signal });
      if (!response.ok) throw Error("HISTORY_DETAIL_UNAVAILABLE");
      return (await response.json() as { item: GenerationHistoryItem }).item;
    }, retry: 1,
  });
  const detail = query.data ?? item;
  const { tabs } = useGenerationDetailTabs(detail);
  const general = <div className="space-y-4">
    <AppDetailSection className="space-y-3 p-4">
      <div className="flex items-center justify-between gap-2"><h3 className="text-sm font-medium">{t("assistant.result")}</h3>
        <AppButton type="button" size="icon-sm" variant="ghost" aria-label={actions("copy") + " · " + t("assistant.result")} disabled={!detail.outputText} onClick={() => detail.outputText && void copy(detail.outputText)}><Copy className="size-4" /></AppButton>
      </div>
      <p className="whitespace-pre-wrap break-words text-sm leading-6">{detail.outputText || "—"}</p>
    </AppDetailSection>
    {detail.errorMessage && <p role="alert" className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{detail.errorMessage}</p>}
  </div>;
  return <AppMediaDetailDialog controller={dialog} className="grid-rows-[minmax(100px,22dvh)_minmax(0,1fr)] lg:grid-cols-[1fr_25rem] lg:grid-rows-[minmax(0,1fr)]">
    <AppDialogTitle className="sr-only">{t("detail.title")}</AppDialogTitle>
    <AppMediaDetailBackdrop className="min-h-0 overflow-auto bg-black/30 p-6 lg:p-10">
      <div data-app-media-detail-content="" className="mx-auto max-w-3xl space-y-4"><Sparkles className="size-6 text-muted-foreground" /><h2 className="text-lg font-semibold">{t("types.assistant")}</h2><p className="whitespace-pre-wrap break-words text-sm leading-7">{detail.outputText || detail.prompt || "—"}</p></div>
    </AppMediaDetailBackdrop>
    <AppMediaDetailRail readOnly formId={formId} onClose={dialog.requestClose} closeLabel={actions("close")} tabsLabel={t("detail.title")}
      tabs={[{ value: "general", label: t("assistant.general"), content: general }, ...tabs]}
      notice={query.isError ? <p role="alert" className="text-xs text-destructive">{t("error")}</p> : undefined}
      actions={<AppButton type="button" variant="surface" className="col-span-full" disabled={query.isFetching} onClick={() => void query.refetch()}>{actions("refresh")}</AppButton>} />
  </AppMediaDetailDialog>;
}
