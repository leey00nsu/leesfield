"use client";

/* Gallery layout and lightbox behavior adapted from Node Banana's OutputGalleryNode.
 * Copyright (c) 2026 William Falloon. MIT License.
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 */

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { Play } from "lucide-react";
import { useTranslations } from "next-intl";
import { useMediaAssetList } from "@/features/media-assets/hook/use-media-assets";
import { MediaAssetDetail } from "@/features/media-assets/ui/media-asset-detail";
import { useCanvasTranslation } from "@/shared/i18n/use-canvas-translation";
import { cn } from "@/shared/lib/utils";
import type { MediaAssetDto } from "@/shared/media-assets/media-asset-contract";
import { getMediaAssetName } from "@/shared/media-assets/media-asset-name";
import { VariantImage } from "@/shared/media-assets/variant-image";
import { AppMediaPreviewLoading } from "@/shared/ui/app-media-preview-loading";
import { AppVideoPlayer } from "@/shared/ui/app-video-player";
import { AppAudioWaveform } from "@/shared/ui/app-audio-waveform";
import { GenerationPending } from "@/shared/ui/generation-canvas";
import { spaceFilmstripKey, spaceFilmstripScheduler, type SpaceFilmstripSpec } from "../../lib/space-filmstrip";
import { spaceNodeSize } from "../../model/space-editor-flow";
import { findSpaceNodeCatalogItem } from "../../model/space-editor-catalog";
import { galleryClearCommand, galleryEntries, galleryRemoveCommand, isGalleryItem, type GalleryItem, type GalleryStatus } from "../../model/space-gallery-items";
import type { SpaceInputResolver } from "../../model/space-editor-inputs";
import { useSpaceEditor, useSpaceInputRevision, useSpaceResolvedInput, useSpaceSelector, useSpaceViewSelector, type SpaceEditorScope } from "../space-editor-provider";
import { SpaceNodeFrame } from "./space-node-frame";
import styles from "./space-node-gallery.module.css";

type AssetQuery = ReturnType<typeof useMediaAssetList>[number];
type Lightbox = { scope: SpaceEditorScope; epoch: number; index: number; items: readonly GalleryItem[]; returnFocus: HTMLElement };
const posterSpec: SpaceFilmstripSpec = Object.freeze({ count: 1, width: 160, height: 90, quality: 0.7 });
const emptyConfig: Record<string, unknown> = Object.freeze({});

function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : emptyConfig;
}
function assetRevision(asset: MediaAssetDto) {
  return JSON.stringify([asset.id, asset.version, asset.updatedAt, asset.url]);
}

/** Posters share the same bounded decoder/cache as Trim, with one frame per visible source. */
function useGalleryPoster(asset: MediaAssetDto | undefined, element: HTMLElement | null) {
  const [visible, setVisible] = useState(() => typeof IntersectionObserver === "undefined");
  useEffect(() => {
    if (!element || typeof IntersectionObserver === "undefined") return;
    let active = true;
    const observer = new IntersectionObserver(entries => {
      if (active && entries[0]) setVisible(entries[0].isIntersecting);
    });
    observer.observe(element);
    return () => { active = false; observer.disconnect(); };
  }, [element]);
  const enabled = visible && asset?.type === "video" && asset.status === "completed";
  const key = enabled ? spaceFilmstripKey(asset, posterSpec) : "";
  const subscribe = useCallback((listener: () => void) => enabled
    ? spaceFilmstripScheduler.subscribe(asset, listener, posterSpec) : () => {}, [asset, enabled]);
  const snapshot = useCallback(() => spaceFilmstripScheduler.getSnapshot(key), [key]);
  return { key, visible, snapshot: useSyncExternalStore(subscribe, snapshot, () => spaceFilmstripScheduler.getSnapshot("")) };
}

function GalleryTile({ item, index, query, active, onHover, onOpen }: {
  item: GalleryItem; index: number; query: AssetQuery | undefined; active: boolean;
  onHover: (hovered: boolean) => void; onOpen: (element: HTMLElement) => void;
}) {
  const tc = useCanvasTranslation(), t = useTranslations("nodeStudio.mediaNodes");
  const [element, setElement] = useState<HTMLDivElement | null>(null);
  const asset = query?.data, available = asset?.status === "completed" && asset.type === item.type;
  const source = asset ? assetRevision(asset) : "";
  const [image, setImage] = useState({ source, failed: false, attempt: 0 });
  if (image.source !== source) setImage({ source, failed: false, attempt: 0 });
  const poster = useGalleryPoster(item.type === "video" && available ? asset : undefined, element);
  const queryFailed = query?.isError || (asset && !available), posterFailed = poster.snapshot.status === "error";
  const error = queryFailed || posterFailed || image.failed;
  const previewing = active && poster.visible && available && !image.failed && item.type === "video";
  const openLabel = `${tc("View full size")} · ${tc(item.type === "image" ? "Image" : item.type === "video" ? "Video" : "Audio")} ${index + 1}`;
  return <div ref={setElement} className={styles.tile} data-gallery-key={item.key} data-gallery-asset={item.assetId} data-gallery-type={item.type} data-gallery-result={item.resultId}
    onPointerEnter={() => onHover(true)} onPointerLeave={() => onHover(false)}>
    <button type="button" className={styles.open} aria-label={openLabel} onClick={event => onOpen(event.currentTarget)}>
      {available && item.type === "image" ? <VariantImage showError={false} key={`${source}:${image.attempt}`} asset={asset} purpose="list" className={styles.thumbnail}
        alt={getMediaAssetName(asset)} loading="lazy" decoding="async" draggable={false} onError={() => setImage(value => value.source === source ? { ...value, failed: true } : value)} />
        : item.type === "video" ? <>
          {available && poster.visible && !poster.snapshot.images.length && !posterFailed && !previewing && <AppMediaPreviewLoading />}
          {poster.snapshot.images[0] && <VariantImage showError={false} key={image.attempt} asset={{ url: poster.snapshot.images[0] }} className={styles.thumbnail}
            alt={`${tc("Video")} ${index + 1}`} draggable={false} onError={() => setImage(value => value.source === source ? { ...value, failed: true } : value)} />}
          {previewing ? <AppVideoPlayer key={`${source}:${image.attempt}`} src={asset.url} controls={false} active inlineOnly muted loop autoPlay playsInline preload="none"
            autoPreview={{ hovered: true }} className={cn(styles.thumbnail, styles.preview)} aria-label={`${tc("Video")} ${index + 1}`}
            onError={() => setImage(value => value.source === source ? { ...value, failed: true } : value)} />
            : <span className={styles.videoIcon}><Play aria-hidden="true" fill="currentColor" /></span>}
        </> : item.type === "audio" && available ? <AppAudioWaveform src={asset.url} asset={asset} active={poster.visible} className={styles.audioWaveform} />
          : <span className={styles.placeholder}>{!error && <AppMediaPreviewLoading />}</span>}
    </button>
    {error && <div className={styles.tileError} role="alert"><span>{t("loadError")}</span>
      <button type="button" onClick={() => {
        if (posterFailed) spaceFilmstripScheduler.retry(poster.key);
        else { setImage(value => ({ ...value, failed: false, attempt: value.attempt + 1 })); void query?.refetch(); }
      }}>{tc("Retry")}</button>
    </div>}
  </div>;
}

function GalleryStatusTile({ entry }: { entry: GalleryStatus }) {
  const t = useTranslations("nodeStudio.mediaNodes");
  return <div className={cn(styles.tile, styles.resultSlot)} data-gallery-result={entry.resultId}
    data-gallery-state={entry.state} data-gallery-type={entry.type} aria-busy={entry.state === "pending"}>
    {entry.state === "pending" ? <GenerationPending status="processing" />
      : <span className={styles.resultMessage} role={entry.state === "failed" ? "alert" : "status"}>
        {t(entry.state === "failed" ? "resultFailed" : "resultCancelled")}
      </span>}
  </div>;
}

/** Canonical Gallery presenter; no runtime/provider execution or source deletion. */
export function SpaceGalleryNode({ nodeId }: { nodeId: string }) {
  const scope = useSpaceEditor(), tc = useCanvasTranslation();
  const node = useSpaceSelector(state => state.nodeById.get(nodeId));
  const writable = useSpaceSelector(state => state.writable), disposed = useSpaceSelector(state => state.disposed);
  const selected = useSpaceSelector(state => state.selectedNodeIds.includes(nodeId));
  const inputRevision = useSpaceInputRevision(nodeId);
  const epoch = useSpaceViewSelector(state => state.epoch);
  const valid = node?.kind === "output.gallery" && node.configVersion === 1, config = record(node?.config);
  const entries = useSpaceResolvedInput(nodeId, useCallback((inputs: SpaceInputResolver) => valid ? galleryEntries(inputs, nodeId, config) : [], [nodeId, config, valid]));
  const items = useMemo(() => entries.filter(isGalleryItem), [entries]);
  const itemIndices = new Map(items.map((item, index) => [item.key, index]));
  const ids = useMemo(() => [...new Set(items.map(item => item.assetId))], [items]);
  const queries = useMediaAssetList(ids), byId = new Map(ids.map((id, index) => [id, queries[index]]));
  const body = useRef<HTMLDivElement>(null), [lightbox, setLightbox] = useState<Lightbox | null>(null);
  const [hovered, setHovered] = useState<{ scope: SpaceEditorScope; epoch: number; key: string } | null>(null);
  if (hovered && (!selected || disposed || hovered.scope !== scope || hovered.epoch !== epoch || lightbox)) setHovered(null);
  // Clamp after upstream changes too, and discard a closed/empty session so undo
  // or an unrelated Space cannot unexpectedly reopen a previous lightbox.
  if (lightbox && (lightbox.scope !== scope || lightbox.epoch !== epoch || !items.length || !valid || disposed)) setLightbox(null);
  else if (lightbox && lightbox.items !== items) {
    const selected = items.findIndex(item => item.key === lightbox.items[lightbox.index]?.key);
    setLightbox({ ...lightbox, items, index: selected < 0 ? Math.min(lightbox.index, items.length - 1) : selected });
  }
  const index = lightbox && lightbox.scope === scope && lightbox.epoch === epoch && items.length
    ? Math.min(lightbox.index, items.length - 1) : null;
  const latestGallery = () => {
    const state = scope.session.getSnapshot(), current = state.nodeById.get(nodeId);
    return state.writable && !state.disposed && scope.view.getState().epoch === epoch && current?.kind === "output.gallery" && current.configVersion === 1
      ? { state, node: current } : null;
  };
  const remove = (item: GalleryItem) => {
    const latest = latestGallery();
    if (!latest) return;
    const command = galleryRemoveCommand(scope.inputs, latest.node, item);
    if (!command) return;
    const result = scope.session.dispatch(command);
    if (!result.ok) scope.view.getState().services.onError?.(new Error(result.message));
  };
  const clear = () => {
    if (!latestGallery() || scope.inputs.inputRevision(nodeId) !== inputRevision) return;
    const result = scope.session.dispatch(galleryClearCommand(scope.inputs, nodeId));
    if (!result.ok) scope.view.getState().services.onError?.(new Error(result.message));
  };
  const extract = () => {
    const latest = latestGallery();
    if (!latest) return;
    const visible = galleryEntries(scope.inputs, nodeId, latest.node.config).filter(isGalleryItem);
    if (!visible.length) return;
    const x = latest.node.position.x + spaceNodeSize(latest.node, latest.state).width + 100;
    let y = latest.node.position.y;
    const result = scope.session.dispatch({ type: "batch", commands: visible.map(item => {
      const position = { x, y };
      y += (findSpaceNodeCatalogItem(`input.${item.type}`)?.geometry.height ?? 300) + 60;
      return { type: "node.add", node: { kind: `input.${item.type}`, position, config: { assetId: item.assetId } } };
    }) });
    if (!result.ok) scope.view.getState().services.onError?.(new Error(result.message));
  };
  const clearable = [config.resultItems, config.excludedAssetIds, config.excludedOccurrences, config.legacyExcludedEdgeIds]
    .some(value => Array.isArray(value) && value.length > 0) || scope.inputs.incomingEdges(nodeId).length > 0 || !!node?.selectedOutputAssetId;
  if (!valid) return null;
  return <SpaceNodeFrame nodeId={nodeId} contentClassName={styles.content}>
    <div ref={body} tabIndex={-1} className={cn(styles.body, "nodrag nopan nowheel")} data-space-gallery=""
      onPointerDown={event => event.stopPropagation()} onKeyDown={event => event.stopPropagation()}>
      {(entries.length > 0 || clearable) &&
        <div className={styles.toolbar}><span>{entries.length} {tc(entries.length === 1 ? "item" : "items")}</span>
          <div className={styles.actions}>
            <button type="button" onClick={clear} disabled={!clearable || !writable || disposed}>{tc("Clear all")}</button>
            <button type="button" onClick={extract} disabled={!items.length || !writable || disposed} title={tc("Extract each item as an input node")}>{tc("Extract")}</button>
          </div>
        </div>}
      {entries.length > 0 ? <>
        <div className={styles.scroll}><div className={styles.grid}>{entries.map(entry => isGalleryItem(entry) ? <GalleryTile
          key={entry.key} item={entry} index={itemIndices.get(entry.key)!} query={byId.get(entry.assetId)}
          active={selected && !disposed && !lightbox && hovered?.scope === scope && hovered.epoch === epoch && hovered.key === entry.key}
          onHover={active => setHovered(previous => active ? { scope, epoch, key: entry.key } : previous?.key === entry.key ? null : previous)}
          onOpen={element => setLightbox({ scope, epoch, index: itemIndices.get(entry.key)!, items, returnFocus: element })} />
          : <GalleryStatusTile key={entry.key} entry={entry} />)}</div></div>
      </> : <div className={styles.empty}>{tc("Connect image, video, or audio nodes to view gallery")}</div>}
    </div>
    {index !== null && lightbox && <MediaAssetDetail assetId={items[index].assetId} title={tc("Output Gallery")} autoPlay writable={writable && !disposed}
      onClose={() => setLightbox(null)} finalFocus={() => lightbox.returnFocus.isConnected ? lightbox.returnFocus
        : [...(body.current?.querySelectorAll<HTMLElement>("[data-gallery-key]") ?? [])].find(element => element.dataset.galleryKey === items[index].key)?.querySelector<HTMLButtonElement>("button") ?? body.current ?? false}
      navigation={{ index, total: items.length, previousLabel: tc("Previous"), nextLabel: tc("Next"), onNavigate: next => setLightbox({ ...lightbox, index: next }) }}
      contextualRemove={{ label: tc("Remove"), disabled: !writable || disposed, onRemove: () => remove(items[index]) }} />}
  </SpaceNodeFrame>;
}
