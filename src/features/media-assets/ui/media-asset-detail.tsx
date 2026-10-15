"use client";
import { useCallback, useState } from "react";
import { useTranslations } from "next-intl";
import { useQuery } from "@tanstack/react-query";
import { Download, Trash2 } from "lucide-react";
import type { GenerationHistoryItem } from "@/entities/generation/model/types";
import { useGenerationDetailTabs } from "@/features/generation-history/lib/use-generation-detail-tabs";
import type { MediaAssetDto } from "@/shared/media-assets/media-asset-contract";
import { getMediaAssetName } from "@/shared/media-assets/media-asset-name";
import { VariantImage } from "@/shared/media-assets/variant-image";
import { AppDialog, AppDialogContent, AppDialogTitle } from "@/shared/ui/app-dialog";
import { AppButton } from "@/shared/ui/app-button";
import { useAssetUsage, useMediaAsset, useDeleteMediaAsset } from "../hook/use-media-assets";
import { assetErrorKey } from "../lib/asset-ui";
import { useUnsavedAssetClose } from "../hook/use-unsaved-asset-close";
import { MediaAssetDetailPanel } from "./media-asset-detail-panel";
import { AppConfirmDialog, AppConfirmDialogContent, AppConfirmDialogHeader, AppConfirmDialogTitle, AppConfirmDialogDescription, AppConfirmDialogFooter, AppConfirmDialogCancel, AppConfirmDialogAction } from "@/shared/ui/app-confirm-dialog";

export function MediaAssetDetail({ asset: initial, onClose, writable = true, allowDelete = false }: {
  asset: MediaAssetDto; onClose: () => void; writable?: boolean; allowDelete?: boolean;
}) {
  const t = useTranslations("assets");
  const tActions = useTranslations("history.detailActions");
  const detail = useMediaAsset(initial.id), usage = useAssetUsage(initial.id);
  const remove = useDeleteMediaAsset();
  const asset = detail.data ?? initial;
  const [confirm, setConfirm] = useState(false), [message, setMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const onSaving = useCallback((value: boolean) => setSaving(value), []);
  const busy = remove.isPending || saving;
  const guard = useUnsavedAssetClose(onClose, busy || confirm);
  const close = guard.requestClose;
  const usable = asset.status === "completed" && !!asset.url;
  const name = asset.name ?? getMediaAssetName(asset);
  const source = usage.data?.provenance[0];
  const origin = source?.type === "edit" ? "edit" : "generation";
  const type = source?.type === "edit" ? asset.type : source?.type;
  const request = useQuery({
    queryKey: ["history", "asset-detail-source", source?.requestId, type, origin],
    enabled: !!source && !!type,
    queryFn: async ({ signal }) => {
      const params = new URLSearchParams({ type: type!, origin, view: "item" });
      const response = await fetch("/api/history/" + encodeURIComponent(source!.requestId) + "?" + params, { cache: "no-store", signal });
      if (!response.ok) throw new Error("HISTORY_NOT_FOUND");
      return (await response.json() as { item: GenerationHistoryItem }).item;
    },
  });
  const info = useGenerationDetailTabs(request.data ?? null, asset);
  return <>
    <AppDialog open onOpenChange={(value, details) => { if (!value) { if (busy || confirm) details.cancel(); else close(); } }}>
      <AppDialogContent size="full" surface="media" padding="none" showCloseButton={false} aria-describedby={undefined}
        className="z-[10010] grid h-dvh grid-rows-[minmax(100px,22dvh)_minmax(0,1fr)] gap-0 overflow-hidden lg:grid-cols-[1fr_25rem] lg:grid-rows-[minmax(0,1fr)]" data-media-asset-detail="">
        <AppDialogTitle className="sr-only">{name}</AppDialogTitle>
        <div className="relative flex min-h-0 min-w-0 items-center justify-center overflow-hidden bg-[#050606] p-6 lg:min-h-0" onClick={close}>
          <div className="flex w-full min-w-0 items-center justify-center" onClick={event => event.stopPropagation()}>
            {!usable ? <p className="text-sm text-muted-foreground">{t("error")}</p> : asset.type === "image"
              ? <VariantImage asset={asset} purpose="display" alt={name} className="max-h-[18dvh] lg:max-h-[86vh] max-w-full rounded-2xl object-contain shadow-2xl" />
              : asset.type === "video" ? <video src={asset.url} controls playsInline preload="metadata" className="max-h-[18dvh] lg:max-h-[86vh] max-w-full rounded-2xl" />
              : <div className="w-full max-w-2xl rounded-2xl border border-white/10 bg-black/30 p-6"><audio src={asset.url} controls preload="metadata" className="w-full" /></div>}
          </div>
        </div>
        <MediaAssetDetailPanel assetId={asset.id} onClose={close} writable={writable} busy={remove.isPending || confirm} onBusyChange={onSaving} onDirtyChange={guard.setDirty}
          tabs={usage.isLoading || usage.isError || (source && (request.isLoading || request.isError)) ? info.tabs.map(tab => ({...tab, content:<div className="grid gap-3"><p role={usage.isError || request.isError ? "alert" : "status"}>{t(usage.isError || request.isError ? "error" : "loading")}</p>{(usage.isError || request.isError) && <AppButton size="sm" variant="surface" onClick={() => void (usage.isError ? usage.refetch() : request.refetch())}>{t("retry")}</AppButton>}</div>})) : info.tabs}
          actions={<>
            {usable ? <AppButton variant="surface" asChild className="col-span-2 h-11 rounded-xl"><a href={"/api/media-assets/" + encodeURIComponent(asset.id) + "/download"} download><Download className="size-4" />{tActions("download")}</a></AppButton> : <AppButton variant="surface" disabled className="col-span-2 h-11 rounded-xl"><Download className="size-4" />{tActions("download")}</AppButton>}
            {allowDelete && writable && <AppButton variant="surface" className="col-span-2 h-11 rounded-xl text-destructive hover:bg-destructive/10 hover:text-destructive" disabled={!usage.data || usage.data.inUse || busy} onClick={() => setConfirm(true)}><Trash2 className="size-4" />{t("deleteFile")}</AppButton>}
            {message && <p role="alert" className="col-span-2 text-xs text-destructive">{message}</p>}
          </>} />
      </AppDialogContent>
    </AppDialog>
    {guard.confirmation}
    <AppConfirmDialog open={confirm} onOpenChange={value => { if (!remove.isPending) setConfirm(value); }}><AppConfirmDialogContent className="z-[10030]"><AppConfirmDialogHeader><AppConfirmDialogTitle>{t("deleteFile")}</AppConfirmDialogTitle><AppConfirmDialogDescription>{t("deleteFileDescription")}</AppConfirmDialogDescription></AppConfirmDialogHeader><AppConfirmDialogFooter><AppConfirmDialogCancel disabled={remove.isPending}>{t("cancel")}</AppConfirmDialogCancel><AppConfirmDialogAction variant="danger" disabled={remove.isPending} onClick={async event => { event.preventDefault(); try { await remove.mutateAsync(asset.id); setConfirm(false); onClose(); } catch (error) { setMessage(t(assetErrorKey(error))); setConfirm(false); } }}>{t("confirmDelete")}</AppConfirmDialogAction></AppConfirmDialogFooter></AppConfirmDialogContent></AppConfirmDialog>
  </>;
}
