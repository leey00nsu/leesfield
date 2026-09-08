"use client";
import { VariantImage } from "@/shared/media-assets/variant-image";

import { useCanvasTranslation } from "@/shared/i18n/use-canvas-translation";

import { useMemo, useRef, useState, type ChangeEvent } from "react";
import { AudioLines, Download, ExternalLink, LoaderCircle, Search, Upload, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { ReactCompareSlider, ReactCompareSliderImage } from "react-compare-slider";

import { MediaAssetApiError } from "@/features/media-assets/api/media-asset-api";
import {
  useMediaAsset,
  useMediaAssets,
  useResolvedNodeAssets,
  useUploadMediaAsset,
} from "@/features/media-assets/hook/use-media-assets";
import type { CanonicalJsonValue } from "@/shared/generation-graph/canonical-graph";
import type { MediaAssetDto, MediaType } from "@/shared/media-assets/media-asset-contract";
import { cn } from "@/shared/lib/utils";
import {
  AppDialog,
  AppDialogClose,
  AppDialogContent,
  AppDialogDescription,
  AppDialogHeader,
  AppDialogIconButton,
  AppDialogTitle,
} from "@/shared/ui/app-dialog";
import { useNodeAuthoring } from "../../model/node-authoring-context";
import type { NodeBananaNodeData } from "../../runtime/node-banana/node-banana-runtime-adapter";

function readableDuration(durationMs: number | null) {
  if (durationMs === null) return null;
  const seconds = Math.round(durationMs / 1_000);
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(seconds % 60).padStart(2, "0")}`;
}

function MediaPreview({ asset, compact = false }: { asset: MediaAssetDto; compact?: boolean }) {
  if (asset.type === "audio") {
    if (compact) {
      return (
        <div className="flex min-h-12 items-center gap-2 rounded-lg bg-black/35 px-2 text-white/55">
          <AudioLines className="h-4 w-4 text-primary" aria-hidden="true" />
          <span className="text-[10px] tabular-nums">{readableDuration(asset.durationMs) ?? asset.mimeType}</span>
        </div>
      );
    }
    return (
      <div className="grid gap-1.5 rounded-lg bg-black/35 p-2">
        <audio controls preload="metadata" src={asset.url} className="h-8 w-full" />
        {asset.durationMs !== null ? (
          <span className="text-[10px] tabular-nums text-white/42">{readableDuration(asset.durationMs)}</span>
        ) : null}
      </div>
    );
  }
  if (asset.type === "video") {
    return (
      <video
        controls={!compact}
        muted={compact}
        playsInline
        preload="metadata"
        src={asset.url}
        className={cn("aspect-video w-full rounded-lg bg-black/45 object-contain", compact && "max-h-20")}
      />
    );
  }
  return (
    <VariantImage
      asset={asset} purpose={compact ? "list" : "display"}
      alt=""
      loading="lazy"
      className={cn("aspect-video w-full rounded-lg bg-black/45 object-contain", compact && "max-h-20")}
    />
  );
}

function assetErrorMessage(error: unknown, fallback: string, inUse: (graphs: string) => string) {
  if (error instanceof MediaAssetApiError && error.code === "MEDIA_ASSET_IN_USE") {
    const graphIds = Array.isArray(error.details.graphIds)
      ? error.details.graphIds.filter((value): value is string => typeof value === "string")
      : [];
    return inUse(graphIds.join(", ") || "-");
  }
  return fallback;
}

export function MediaInputNodeControls({
  id,
  data,
  mediaType,
}: {
  id: string;
  data: NodeBananaNodeData;
  mediaType: MediaType;
}) {
  const tc = useCanvasTranslation();
  const t = useTranslations("nodeStudio.mediaNodes");
  const authoring = useNodeAuthoring();
  const assetsQuery = useMediaAssets(mediaType);
  const upload = useUploadMediaAsset();
  const [localError, setLocalError] = useState<string | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historySearch, setHistorySearch] = useState("");
  const historyTriggerRef = useRef<HTMLButtonElement>(null);
  const config = data.config && typeof data.config === "object" && !Array.isArray(data.config)
    ? data.config as Record<string, unknown>
    : {};
  const localAssetId = typeof config.assetId === "string" ? config.assetId : null;
  const targetPortId = mediaType === "image" ? "reference" : mediaType;
  const incomingAssetId = authoring.getNodeInputAssetId?.(id, targetPortId) ?? null;
  const connected = Boolean(authoring.isNodePortConnected?.(id, targetPortId));
  const assetId = connected ? incomingAssetId : localAssetId;
  const selectedQuery = useMediaAsset(assetId);
  const assets = useMemo(
    () => assetsQuery.data?.pages.flatMap((page) => page.items) ?? [],
    [assetsQuery.data],
  );
  const selectedAsset = assetId
    ? selectedQuery.data ?? assets.find((asset) => asset.id === assetId) ?? null
    : null;
  const visibleAssets = useMemo(() => {
    const query = historySearch.trim().toLowerCase();
    if (!query) return assets;
    return assets.filter((asset) =>
      `${asset.id} ${asset.mimeType} ${asset.origin}`.toLowerCase().includes(query),
    );
  }, [assets, historySearch]);
  const writable = authoring.writable !== false && Boolean(authoring.updateCanonicalNodeConfig);
  const controlsWritable = writable && !connected;

  const selectAsset = (nextAssetId: string | null) => {
    if (!controlsWritable) return;
    authoring.updateCanonicalNodeConfig?.(id, { ...config, assetId: nextAssetId } as CanonicalJsonValue);
  };

  const closeHistory = (open: boolean) => {
    setHistoryOpen(open);
    if (!open) {
      requestAnimationFrame(() => historyTriggerRef.current?.focus());
    }
  };

  const uploadFile = async (file: File | undefined) => {
    if (!file) return;
    setLocalError(null);
    try {
      const asset = await upload.mutateAsync({ file, type: mediaType });
      selectAsset(asset.id);
    } catch (error) {
      setLocalError(assetErrorMessage(error, t("uploadError"), (graphs) => t("assetInUse", { graphs })));
    }
  };

  const handleUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    await uploadFile(file);
  };

  return (
    <div
      className="nodrag nowheel grid min-h-[160px] gap-2"
      data-node-banana-component={`${mediaType[0]?.toUpperCase()}${mediaType.slice(1)}InputNode`}
      onPointerDown={(event) => event.stopPropagation()}
    >
      {selectedAsset ? (
        <div className="relative min-h-36 overflow-hidden rounded-lg bg-neutral-900/40">
          <MediaPreview asset={selectedAsset} />
          <div className="absolute right-2 top-2 flex gap-1 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
            <a
              href={selectedAsset.url}
              download
              className="grid h-7 w-7 place-items-center rounded bg-neutral-900/85 text-neutral-200 shadow hover:bg-neutral-800"
              aria-label={t("download")}
              title={t("download")}
            >
              <Download className="h-3.5 w-3.5" aria-hidden="true" />
            </a>
            <button
              type="button"
              disabled={!controlsWritable}
              className="grid h-7 w-7 place-items-center rounded bg-neutral-900/85 text-neutral-200 shadow hover:bg-neutral-800 disabled:opacity-40"
              aria-label={tc("Clear selected asset")}
              title={tc("Clear selected asset")}
              onClick={() => selectAsset(null)}
            >
              <X className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          </div>
          <p className="absolute inset-x-0 bottom-0 truncate bg-neutral-900/90 px-2 py-1.5 text-[10px] text-white/48">
            {t(`origins.${selectedAsset.origin}`)} · {selectedAsset.mimeType}
          </p>
        </div>
      ) : (
        <label className={cn(
          "flex min-h-36 cursor-pointer flex-col items-center justify-center rounded-lg bg-neutral-900/40 text-neutral-500 transition-colors hover:bg-neutral-900/60",
          (!controlsWritable || upload.isPending) && "pointer-events-none opacity-45",
        )}
          onDragOver={(event) => {
            event.preventDefault();
            event.stopPropagation();
          }}
          onDrop={(event) => {
            event.preventDefault();
            event.stopPropagation();
            void uploadFile(event.dataTransfer.files?.[0]);
          }}
        >
          {upload.isPending
            ? <LoaderCircle className="h-8 w-8 animate-spin" aria-hidden="true" />
            : <Upload className="h-8 w-8 text-neutral-600" aria-hidden="true" />}
          <span className="mt-2 text-xs">
            {upload.isPending ? t("uploading") : `Drop ${mediaType} or click`}
          </span>
          <input
            type="file"
            className="sr-only"
            aria-label={tc("Upload file")}
            accept={`${mediaType}/*`}
            disabled={!controlsWritable || upload.isPending}
            onChange={(event) => void handleUpload(event)}
          />
        </label>
      )}

      <button
        type="button"
        ref={historyTriggerRef}
        disabled={!controlsWritable}
        className="h-8 rounded-lg border border-white/10 bg-white/[0.045] px-3 text-[11px] font-semibold text-white/72 hover:bg-white/[0.08] disabled:opacity-45"
        onClick={() => setHistoryOpen(true)}
      >
        {t("historyPicker")}
      </button>
      <AppDialog open={historyOpen} onOpenChange={closeHistory}>
        <AppDialogContent
          size="md"
          surface="editor"
          padding="none"
          className="flex h-[min(720px,calc(100dvh-2rem))] flex-col overflow-hidden"
          aria-label={`${mediaType} history`}
          data-node-banana-component="HistoryAssetDialog"
        >
            <AppDialogHeader className="flex-row items-center border-b border-neutral-700 px-4 py-3">
              <div>
                <AppDialogTitle className="m-0 text-sm">{tc("History assets")}</AppDialogTitle>
                <AppDialogDescription className="mt-0.5 text-xs font-normal normal-case tracking-normal text-neutral-500">{tc("Choose a")}{mediaType}{tc("asset")}</AppDialogDescription>
              </div>
              <AppDialogClose asChild>
                <AppDialogIconButton type="button" aria-label={tc("Close history")} className="ml-auto border-0 text-neutral-400 hover:bg-neutral-700 hover:text-white">
                  <X className="h-4 w-4" />
                </AppDialogIconButton>
              </AppDialogClose>
            </AppDialogHeader>
            <div className="border-b border-neutral-700 p-3">
              <label className="flex items-center gap-2 rounded-lg border border-neutral-600 bg-neutral-900/55 px-3">
                <Search className="h-4 w-4 text-neutral-500" aria-hidden="true" />
                <input autoFocus value={historySearch} onChange={(event) => setHistorySearch(event.target.value)} placeholder={tc("Search history...")} className="h-9 min-w-0 flex-1 bg-transparent text-xs outline-none" />
              </label>
            </div>
            <div className="grid min-h-0 flex-1 grid-cols-2 gap-3 overflow-y-auto p-3 sm:grid-cols-3">
              {visibleAssets.map((asset) => (
                <button
                  key={asset.id}
                  type="button"
                  disabled={!controlsWritable}
                  aria-pressed={asset.id === assetId}
                  className={cn("min-w-0 rounded-lg border p-2 text-left hover:border-neutral-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary", asset.id === assetId ? "border-primary/60 bg-primary/5" : "border-neutral-700 bg-neutral-900/35")}
                  onClick={() => { selectAsset(asset.id); closeHistory(false); }}
                >
                  <MediaPreview asset={asset} compact />
                  <span className="mt-1.5 block truncate text-[10px] text-neutral-400">{t(`origins.${asset.origin}`)} · {asset.mimeType}</span>
                </button>
              ))}
              {assetsQuery.isLoading ? <p className="col-span-full py-8 text-center text-xs text-neutral-400">{t("loading")}</p> : null}
              {!assetsQuery.isLoading && visibleAssets.length === 0 ? <p className="col-span-full py-8 text-center text-xs text-neutral-400">{t("historyEmpty")}</p> : null}
            </div>
            {assetsQuery.hasNextPage ? <footer className="border-t border-neutral-700 p-3 text-right"><button type="button" className="rounded border border-neutral-600 px-3 py-1.5 text-xs hover:bg-neutral-700" disabled={assetsQuery.isFetchingNextPage} onClick={() => void assetsQuery.fetchNextPage()}>{t("loadMore")}</button></footer> : null}
        </AppDialogContent>
      </AppDialog>
      {localError || assetsQuery.isError || selectedQuery.isError ? (
        <p role="alert" className="text-[11px] leading-4 text-red-200">
          {localError ?? t("loadError")}
        </p>
      ) : null}
    </div>
  );
}

function AssetActions({ asset }: { asset: MediaAssetDto }) {
  const t = useTranslations("nodeStudio.mediaNodes");
  return (
    <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
      <a
        href={asset.url}
        download
        className="inline-flex items-center gap-1 rounded-md border border-white/10 px-2 py-1 text-[10px] text-white/62 hover:border-primary/45 hover:text-primary"
      >
        <Download className="h-3 w-3" />
        {t("download")}
      </a>
      <a
        href="/history"
        className="inline-flex items-center gap-1 rounded-md border border-white/10 px-2 py-1 text-[10px] text-white/62 hover:border-primary/45 hover:text-primary"
      >
        <ExternalLink className="h-3 w-3" />
        {t("openHistory")}
      </a>
    </div>
  );
}

export function MediaOutputNodeControls({
  id,
  kind,
}: {
  id: string;
  kind: "output.single" | "output.gallery" | "inspect.imageCompare";
}) {
  const t = useTranslations("nodeStudio.mediaNodes");
  const authoring = useNodeAuthoring();
  const output = useResolvedNodeAssets(authoring.graphId, id);
  const assets = output.data?.groups.flatMap((group) => group.assets) ?? [];
  const componentName = kind === "inspect.imageCompare"
    ? "ImageCompareNode"
    : kind === "output.gallery"
      ? "OutputGalleryNode"
      : "OutputNode";

  if (output.isLoading) {
    return <p data-node-banana-component={componentName} className="mt-4 text-[11px] text-white/40">{t("loading")}</p>;
  }
  if (output.isError) {
    return <p data-node-banana-component={componentName} className="mt-4 text-[11px] text-red-200" role="alert">{t("outputError")}</p>;
  }
  if (assets.length === 0) {
    return <p data-node-banana-component={componentName} className="mt-4 rounded-xl border border-dashed border-white/12 px-3 py-4 text-center text-[11px] text-white/42">{t("outputEmpty")}</p>;
  }

  if (kind === "inspect.imageCompare") {
    const before = output.data?.groups.find((group) => group.portId === "before")?.assets[0];
    const after = output.data?.groups.find((group) => group.portId === "after")?.assets[0];
    if (!before || !after) {
      return <p className="mt-4 text-[11px] text-white/42">{t("compareNeedsTwo")}</p>;
    }
    return (
      <div data-node-banana-component={componentName} className="nodrag nowheel mt-4 overflow-hidden rounded-xl border border-white/10" onPointerDown={(event) => event.stopPropagation()}>
        <ReactCompareSlider
          itemOne={<ReactCompareSliderImage src={before.url} alt={t("before")} />}
          itemTwo={<ReactCompareSliderImage src={after.url} alt={t("after")} />}
          className="aspect-video bg-black/45"
        />
      </div>
    );
  }

  const visibleAssets = kind === "output.single" ? assets.slice(0, 1) : assets;
  return (
    <div
      className={cn("nodrag nowheel mt-4 grid gap-2", kind === "output.gallery" && "max-h-80 overflow-y-auto pr-1")}
      data-node-banana-component={componentName}
      onPointerDown={(event) => event.stopPropagation()}
    >
      {visibleAssets.map((asset, index) => (
        <div key={asset.id} className="rounded-xl border border-white/10 bg-black/20 p-2">
          <MediaPreview asset={asset} />
          <p className="mt-1.5 truncate text-[10px] text-white/42">
            {kind === "output.gallery" ? `${index + 1} · ` : ""}{asset.mimeType}
          </p>
          <AssetActions asset={asset} />
        </div>
      ))}
    </div>
  );
}
