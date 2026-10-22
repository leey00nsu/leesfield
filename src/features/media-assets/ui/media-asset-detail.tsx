"use client";
import { useCallback, useEffect, useRef, useState, type ComponentProps } from "react";
import { useTranslations } from "next-intl";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, ArrowRight, Download, Trash2 } from "lucide-react";
import type { GenerationHistoryItem } from "@/entities/generation/model/types";
import { useGenerationDetailTabs } from "@/features/generation-history/lib/use-generation-detail-tabs";
import type { MediaAssetDto } from "@/shared/media-assets/media-asset-contract";
import { getMediaAssetDownloadName, getMediaAssetName } from "@/shared/media-assets/media-asset-name";
import { cn } from "@/shared/lib/utils";
import { VariantImage } from "@/shared/media-assets/variant-image";
import { AppDialog, AppDialogContent, AppDialogTitle } from "@/shared/ui/app-dialog";
import { AppButton } from "@/shared/ui/app-button";
import { AppAudioPlayer } from "@/shared/ui/app-audio-player";
import { AppVideoPlayer } from "@/shared/ui/app-video-player";
import { useAssetUsage, useMediaAsset, useDeleteMediaAsset } from "../hook/use-media-assets";
import { assetErrorKey } from "../lib/asset-ui";
import { useUnsavedAssetClose } from "../hook/use-unsaved-asset-close";
import { MediaAssetDetailPanel } from "./media-asset-detail-panel";
import { AppConfirmDialog, AppConfirmDialogContent, AppConfirmDialogHeader, AppConfirmDialogTitle, AppConfirmDialogDescription, AppConfirmDialogFooter, AppConfirmDialogCancel, AppConfirmDialogAction } from "@/shared/ui/app-confirm-dialog";

type DetailProps = ({ asset: MediaAssetDto; assetId?: never } | { assetId: string; asset?: never }) & {
  onClose: () => void; writable?: boolean; allowDelete?: boolean;
  title?: string;
  autoPlay?: boolean;
  finalFocus?: ComponentProps<typeof AppDialogContent>["finalFocus"];
  navigation?: { index: number; total: number; previousLabel: string; nextLabel: string; onNavigate: (index: number) => void };
  contextualRemove?: { label: string; disabled?: boolean; onRemove: () => void };
};

export function MediaAssetDetail({ asset: initial, assetId, onClose, writable = true, allowDelete = false, title, autoPlay = false, finalFocus, navigation, contextualRemove }: DetailProps) {
  const t = useTranslations("assets");
  const tActions = useTranslations("history.detailActions");
  const id = assetId ?? initial!.id;
  const detail = useMediaAsset(id), usage = useAssetUsage(id);
  const remove = useDeleteMediaAsset();
  const asset = detail.data ?? initial;
  const [confirm, setConfirm] = useState(false), [message, setMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false), [panelEpoch, setPanelEpoch] = useState(0), content = useRef<HTMLDivElement>(null), composing = useRef(false);
  const pendingAction = useRef<(() => void) | null>(null);
  const onSaving = useCallback((value: boolean) => setSaving(value), []);
  const busy = remove.isPending || saving;
  const guard = useUnsavedAssetClose(() => {
    const action = pendingAction.current;
    pendingAction.current = null;
    if (action) { setPanelEpoch(value => value + 1); action(); } else onClose();
  }, busy || confirm);
  const requestAction = (action: (() => void) | null) => {
    if (busy || confirm) return;
    pendingAction.current = action;
    guard.requestClose();
  };
  const close = () => requestAction(null);
  const navigate = (index: number) => {
    if (!navigation || index < 0 || index >= navigation.total || index === navigation.index) return;
    requestAction(() => navigation.onNavigate(index));
  };
  const usable = asset?.status === "completed" && !!asset.url;
  const name = asset ? asset.name ?? getMediaAssetName(asset) : t("loading");
  const source = usage.data?.provenance[0];
  const origin = source?.type === "edit" ? "edit" : "generation";
  const type = source?.type === "edit" ? asset?.type : source?.type;
  // The loading rail becomes an editable rail after the real query resolves.
  // Restore its close focus only when that replacement removed the focused control.
  useEffect(() => {
    if (content.current && document.activeElement === document.body) {
      [...content.current.querySelectorAll<HTMLButtonElement>("button")].find(button => button.getAttribute("aria-label") === t("close"))?.focus();
    }
  }, [detail.data?.id, t]);
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
    <AppDialog open onOpenChange={(value, details) => { if (!value) {
      if (busy || confirm || composing.current || (details.event instanceof KeyboardEvent && (details.event.isComposing || details.event.keyCode === 229))) details.cancel();
      else close();
    } }}>
      <AppDialogContent ref={content} size="full" surface="media" padding="none" showCloseButton={false} aria-describedby={undefined}
        overlayClassName="z-[10009]" finalFocus={finalFocus}
        initialFocus={() => [...(content.current?.querySelectorAll<HTMLButtonElement>("button") ?? [])].find(button => button.getAttribute("aria-label") === t("close")) ?? false}
        onCompositionStart={() => { composing.current = true; }} onCompositionEnd={() => { composing.current = false; }}
        onPointerDown={event => event.stopPropagation()} onKeyDown={event => event.stopPropagation()}
        onKeyDownCapture={event => {
          if (composing.current || event.nativeEvent.isComposing || event.keyCode === 229) { event.stopPropagation(); return; }
          const target = event.target instanceof Element ? event.target : null;
          const nested = target?.closest('[role="dialog"], [role="alertdialog"], [role="menu"], [role="listbox"]');
          if (nested && nested !== event.currentTarget) return;
          // Pointer-opened popovers can leave focus on their trigger. Let the
          // active child layer consume Escape before dismissing this detail.
          if (event.key === "Escape" && [...event.currentTarget.querySelectorAll('[aria-expanded="true"][aria-controls]')]
            .some(trigger => document.getElementById(trigger.getAttribute("aria-controls") ?? ""))) return;
          if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); close(); return; }
          if (!navigation || target?.closest('input, textarea, select, [contenteditable="true"], [role="slider"], [role="combobox"], [role="tablist"], [data-media-asset-preview]')) return;
          if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
            event.preventDefault(); event.stopPropagation();
            navigate(navigation.index + (event.key === "ArrowLeft" ? -1 : 1));
          }
        }}
        className={cn("nodrag nopan nowheel z-[10010] grid h-dvh gap-0 overflow-hidden lg:grid-cols-[1fr_25rem] lg:grid-rows-[minmax(0,1fr)]",
          asset?.type === "audio" || asset?.type === "video" ? "grid-rows-[minmax(220px,32dvh)_minmax(0,1fr)]" : "grid-rows-[minmax(100px,22dvh)_minmax(0,1fr)]")} data-media-asset-detail="">
        <AppDialogTitle className="sr-only">{title ?? name}</AppDialogTitle>
        <div className="relative flex min-h-0 min-w-0 flex-col gap-2 overflow-hidden bg-[#050606] p-3 lg:p-6" onClick={close}>
          <div data-media-asset-preview="" className="flex w-full min-h-0 min-w-0 flex-1 items-center justify-center" onClick={event => event.stopPropagation()}>
            {usable && asset ? <AssetPreview key={JSON.stringify([asset.id, asset.version, asset.updatedAt, asset.url])} asset={asset} name={name} autoPlay={autoPlay} />
              : <div className="grid gap-3 text-center"><p role={detail.isError || asset ? "alert" : "status"} className="text-sm text-muted-foreground">{t(detail.isError || asset ? "error" : "loading")}</p>
                {detail.isError && <AppButton variant="surface" size="sm" onClick={() => void detail.refetch()}>{t("retry")}</AppButton>}</div>}
          </div>
          {navigation && <div className="flex shrink-0 items-center justify-center gap-3" onClick={event => event.stopPropagation()}>
            <AppButton variant="surface" size="icon-sm" aria-label={navigation.previousLabel} disabled={navigation.index === 0 || busy || confirm} onClick={() => navigate(navigation.index - 1)}><ArrowLeft className="size-4" /></AppButton>
            <span role="status" aria-live="polite" className="text-xs">{navigation.index + 1} / {navigation.total}</span>
            <AppButton variant="surface" size="icon-sm" aria-label={navigation.nextLabel} disabled={navigation.index === navigation.total - 1 || busy || confirm} onClick={() => navigate(navigation.index + 1)}><ArrowRight className="size-4" /></AppButton>
          </div>}
        </div>
        <MediaAssetDetailPanel key={`${id}:${panelEpoch}`} assetId={id} onClose={close} writable={writable} busy={remove.isPending || confirm} onBusyChange={onSaving} onDirtyChange={guard.setDirty}
          tabs={usage.isLoading || usage.isError || (source && (request.isLoading || request.isError)) ? info.tabs.map(tab => ({...tab, content:<div className="grid gap-3"><p role={usage.isError || request.isError ? "alert" : "status"}>{t(usage.isError || request.isError ? "error" : "loading")}</p>{(usage.isError || request.isError) && <AppButton size="sm" variant="surface" onClick={() => void (usage.isError ? usage.refetch() : request.refetch())}>{t("retry")}</AppButton>}</div>})) : info.tabs}
          actions={<>
            {usable && asset ? <AppButton variant="surface" asChild className="col-span-2 h-11 rounded-xl"><a href={"/api/media-assets/" + encodeURIComponent(id) + "/download"} download={getMediaAssetDownloadName(asset)}><Download className="size-4" />{tActions("download")}</a></AppButton> : <AppButton variant="surface" disabled className="col-span-2 h-11 rounded-xl"><Download className="size-4" />{tActions("download")}</AppButton>}
            {contextualRemove && <AppButton variant="surface" className="col-span-2 h-11 rounded-xl" disabled={!writable || contextualRemove.disabled || busy || confirm}
              onClick={() => requestAction(contextualRemove.onRemove)}><Trash2 className="size-4" />{contextualRemove.label}</AppButton>}
            {allowDelete && writable && <AppButton variant="surface" className="col-span-2 h-11 rounded-xl text-destructive hover:bg-destructive/10 hover:text-destructive" disabled={!usage.data || usage.data.inUse || busy} onClick={() => setConfirm(true)}><Trash2 className="size-4" />{t("deleteFile")}</AppButton>}
            {message && <p role="alert" className="col-span-2 text-xs text-destructive">{message}</p>}
          </>} />
      </AppDialogContent>
    </AppDialog>
    {guard.confirmation}
    <AppConfirmDialog open={confirm} onOpenChange={value => { if (!remove.isPending) setConfirm(value); }}><AppConfirmDialogContent className="z-[10030]"><AppConfirmDialogHeader><AppConfirmDialogTitle>{t("deleteFile")}</AppConfirmDialogTitle><AppConfirmDialogDescription>{t("deleteFileDescription")}</AppConfirmDialogDescription></AppConfirmDialogHeader><AppConfirmDialogFooter><AppConfirmDialogCancel disabled={remove.isPending}>{t("cancel")}</AppConfirmDialogCancel><AppConfirmDialogAction variant="danger" disabled={remove.isPending} onClick={async event => { event.preventDefault(); try { await remove.mutateAsync(id); setConfirm(false); onClose(); } catch (error) { setMessage(t(assetErrorKey(error))); setConfirm(false); } }}>{t("confirmDelete")}</AppConfirmDialogAction></AppConfirmDialogFooter></AppConfirmDialogContent></AppConfirmDialog>
  </>;
}

function AssetPreview({ asset, name, autoPlay }: { asset: MediaAssetDto; name: string; autoPlay: boolean }) {
  const t = useTranslations("assets");
  const [failed, setFailed] = useState(false), [attempt, setAttempt] = useState(0);
  return <div className="relative flex w-full min-w-0 items-center justify-center">
    {asset.type === "image" ? <VariantImage key={attempt} asset={asset} purpose="display" alt={name} onError={() => setFailed(true)} className="max-h-[18dvh] lg:max-h-[86vh] max-w-full rounded-2xl object-contain shadow-2xl" />
      : asset.type === "video" ? <AppVideoPlayer key={attempt} src={asset.url} aria-label={name} autoPlay={autoPlay} playsInline preload="metadata" onError={() => setFailed(true)} className="w-full max-w-5xl" mediaClassName="max-h-[16dvh] lg:max-h-[76vh] object-contain" />
        : <AppAudioPlayer key={attempt} asset={asset} src={asset.url} aria-label={name} autoPlay={autoPlay} preload="metadata" onError={() => setFailed(true)} className="w-full max-w-2xl" />}
    {failed && <div role="alert" className="absolute bottom-0 flex items-center gap-3 rounded-lg bg-black/90 p-3 text-sm">{t("error")}
      <AppButton variant="surface" size="sm" onClick={() => { setFailed(false); setAttempt(value => value + 1); }}>{t("retry")}</AppButton></div>}
  </div>;
}
