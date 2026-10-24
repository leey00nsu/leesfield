"use client";

import { useCallback, useEffect, useRef, useState, type MouseEvent } from "react";
import { FileAudio, FolderOpen, ImagePlus, LoaderCircle, Plus, Video, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useMediaAsset } from "@/features/media-assets/hook/use-media-assets";
import { MediaAssetPicker } from "@/features/media-assets/ui/media-asset-picker";
import { useCanvasTranslation } from "@/shared/i18n/use-canvas-translation";
import { cn } from "@/shared/lib/utils";
import { allowedMediaMimeTypes } from "@/shared/media-assets/media-asset-contract";
import { AppMediaActionButton } from "@/shared/ui/app-media-action-button";
import { GenerationPending } from "@/shared/ui/generation-canvas";
import { spaceNodeSize } from "../../model/space-editor-flow";
import { useSpaceEditor, useSpaceInputRevision, useSpaceResolvedInput, useSpaceSelector, useSpaceVideoPreview } from "../space-editor-provider";
import { useSpaceInputMedia, type SpaceInputExpectation } from "../space-input-media-provider";
import { useSpaceImageFit } from "../space-image-view-settings";
import { SpaceMediaPreview, type SpaceMediaDimensions } from "./space-media-preview";
import { useSpaceMediaEdit, useSpaceMediaEditDraft } from "../space-media-edit-provider";
import { isDirectEditPort } from "@/shared/media-assets/direct-media-edit";
import { SpaceNodeFrame } from "./space-node-frame";
import styles from "./space-node-media.module.css";

function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

/** Canonical media input presenter. All durable writes and transfers belong to the controller. */
export function SpaceMediaInputNode({ nodeId }: { nodeId: string }) {
  const mediaEdit = useSpaceMediaEdit();
  const editing = useSpaceMediaEditDraft()?.nodeId === nodeId;
  const scope = useSpaceEditor(), controller = useSpaceInputMedia(), tc = useCanvasTranslation(), t = useTranslations("nodeStudio.mediaNodes");
  const node = useSpaceSelector(state => state.nodeById.get(nodeId));
  const writable = useSpaceSelector(state => state.writable), selected = useSpaceSelector(state => state.selectedNodeIds.includes(nodeId));
  const hovered = useSpaceSelector(state => state.hoveredNodeId === nodeId), runtime = useSpaceSelector(state => state.runtimeByNode.get(nodeId));
  const zoom = useSpaceSelector(state => node?.kind === "input.image" ? state.viewport.zoom : 1), inputRevision = useSpaceInputRevision(nodeId);
  const { fit } = useSpaceImageFit(nodeId);
  const config = record(node?.config), resultSource = record(config.resultSource), presentation = record(config.presentation);
  const sourceExecution = useSpaceSelector(state => typeof resultSource.nodeId === "string" ? state.runtimeByNode.get(resultSource.nodeId)?.execution : undefined);
  const mediaType = node?.kind === "input.audio" ? "audio" : node?.kind === "input.video" ? "video" : "image";
  const assetId = useSpaceResolvedInput(nodeId, inputs => inputs.sourceAssetIds(nodeId, mediaType)[0] ?? null);
  const assetQuery = useMediaAsset(assetId), asset = assetQuery.data;
  const resultInput = typeof resultSource.nodeId === "string";
  const pending = resultInput && (resultSource.state === "pending" || (sourceExecution?.executionId === resultSource.executionId
    && ["pending", "processing", "uploading"].includes(sourceExecution?.status ?? "")));
  // A result binding is displayed from its own asset, rather than relayed from
  // the producer's representative output. Ordinary input wires remain authoritative.
  const connected = useSpaceResolvedInput(nodeId, inputs => !resultInput && inputs.isConnected(nodeId, mediaType === "image" ? "reference" : mediaType));
  const uploading = runtime?.uploadProgress !== undefined;
  const canReplace = writable && !connected && !pending;
  const canChoose = canReplace && !uploading;
  const fileInput = useRef<HTMLInputElement>(null), trigger = useRef<HTMLButtonElement>(null), body = useRef<HTMLDivElement>(null);
  const video = useSpaceVideoPreview(nodeId, mediaType === "video", asset?.id === assetId && asset.type === "video" ? asset : undefined);
  const pickerExpectation = useRef<SpaceInputExpectation | null>(null), lastFile = useRef<File | null>(null);
  const [choice, setChoice] = useState<{ scope: typeof scope; revision: number; open: boolean; expected: SpaceInputExpectation } | null>(null);
  const [loaded, setLoaded] = useState<{ source: string; dimensions: SpaceMediaDimensions } | null>(null);
  const sourceKey = asset ? JSON.stringify([asset.id, asset.version, asset.updatedAt, asset.url]) : "";
  const onLoadedDimensions = useCallback((dimensions: SpaceMediaDimensions) => {
    setLoaded(previous => previous?.source === sourceKey && previous.dimensions.width === dimensions.width && previous.dimensions.height === dimensions.height
      ? previous : { source: sourceKey, dimensions });
  }, [sourceKey]);
  const restoreFocus = useCallback(() => {
    if (trigger.current?.isConnected && !trigger.current.disabled) trigger.current.focus();
    else body.current?.focus();
  }, []);
  useEffect(() => {
    const input = fileInput.current;
    if (!input) return;
    input.addEventListener("cancel", restoreFocus, { passive: true });
    return () => input.removeEventListener("cancel", restoreFocus);
  }, [restoreFocus]);
  const activeChoice = choice?.scope === scope && choice.revision === inputRevision && controller.matches(choice.expected, nodeId);
  const pickerOpen = Boolean(activeChoice && choice.open && canChoose), pickerWasOpen = useRef(false);
  useEffect(() => {
    const closing = pickerWasOpen.current && !pickerOpen;
    pickerWasOpen.current = pickerOpen;
    if (!closing) return;
    // Selection can remove the action button. Restore focus after that commit.
    const frame = requestAnimationFrame(restoreFocus);
    return () => cancelAnimationFrame(frame);
  }, [pickerOpen, restoreFocus]);
  const choose = (event: MouseEvent<HTMLButtonElement>, action: "upload" | "assets") => {
    if (!canChoose || assetId || asset) return;
    const expected = controller.capture(nodeId);
    if (!expected) return;
    trigger.current = event.currentTarget;
    if (action === "upload") {
      // Capture before opening the OS picker; its callback can outlive this input.
      pickerExpectation.current = expected;
      fileInput.current?.click();
    } else setChoice({ scope, revision: inputRevision, open: true, expected });
  };
  const changeChooserOpen = (open: boolean) => {
    setChoice(previous => previous && previous.expected === choice?.expected ? { ...previous, open } : previous);
  };
  const uploadFile = (file: File | undefined) => {
    if (!file || !canReplace) return;
    lastFile.current = file;
    void controller.upload(nodeId, file).then(success => { if (success && lastFile.current === file) lastFile.current = null; });
  };
  const aspectFit = () => {
    if (!node || !writable || !asset) return;
    const dimensions = asset.width && asset.height ? { width: asset.width, height: asset.height } : loaded?.source === sourceKey ? loaded.dimensions : null;
    if (!dimensions?.width || !dimensions.height) return;
    const current = spaceNodeSize(node, scope.session.getSnapshot());
    scope.resize(nodeId, { width: current.width, height: Math.max(100, current.width * dimensions.height / dimensions.width) }, true);
  };
  if (!node || !["input.image", "input.audio", "input.video"].includes(node.kind)) return null;
  const Icon = mediaType === "image" ? ImagePlus : mediaType === "audio" ? FileAudio : Video;
  const clearLabel = tc(mediaType === "image" ? "Remove image" : mediaType === "audio" ? "Remove audio" : "Remove video");
  const emptyStatus = assetId ? t("loading") : presentation.isOptional === true ? tc("Optional") : null;
  return <SpaceNodeFrame nodeId={nodeId} fullBleed contentClassName={styles.content}
    onAspectFit={mediaType === "image" && asset ? aspectFit : undefined}>
    <div ref={body} tabIndex={-1} className={styles.body} data-space-media-input={mediaType} data-connected={connected} data-pending={pending} data-uploading={uploading}
      onDragOver={event => { if (event.dataTransfer.types.includes("Files")) { event.preventDefault(); event.stopPropagation(); } }}
      onDrop={event => {
        if (!event.dataTransfer.files.length) return;
        event.preventDefault(); event.stopPropagation();
        if (canReplace) uploadFile(event.dataTransfer.files[0]);
      }}>
      <input ref={fileInput} hidden type="file" accept={allowedMediaMimeTypes[mediaType].join(",")}
        aria-label={tc("Upload file")} disabled={!canChoose}
        onChange={event => {
          const file = event.currentTarget.files?.[0]; event.currentTarget.value = "";
          if (file && canReplace) {
            lastFile.current = file;
            void controller.upload(nodeId, file, pickerExpectation.current).then(success => { if (success && lastFile.current === file) lastFile.current = null; });
          }
          restoreFocus();
        }} />
      {asset ? <>
        <SpaceMediaPreview asset={asset} selected={selected} hovered={hovered} active={editing ? false : undefined} zoom={zoom} imageFit={mediaType === "image" ? fit : undefined}
          onOpen={(asset, trigger, onClosed) => scope.view.getState().services.openMediaDetail?.(nodeId, asset, trigger, onClosed)}
          videoRef={video}
          videoInlineOnly={mediaType === "video"} onLoadedDimensions={onLoadedDimensions} />
      </> : !pending && <div className={styles.empty} data-disabled={!canChoose || Boolean(assetId)}>
        <Icon aria-hidden="true" />
        {emptyStatus && <span>{emptyStatus}</span>}
        <div className={cn(styles.emptyActions, "nodrag nopan")} onPointerDown={event => event.stopPropagation()}
          onKeyDown={event => event.stopPropagation()} onClick={event => event.stopPropagation()}>
          <AppMediaActionButton disabled={!canChoose || Boolean(assetId)} onClick={event => choose(event, "upload")}><Plus aria-hidden="true" />{tc("Upload")}</AppMediaActionButton>
          <AppMediaActionButton disabled={!canChoose || Boolean(assetId)} onClick={event => choose(event, "assets")}><FolderOpen aria-hidden="true" />{tc("Assets")}</AppMediaActionButton>
        </div>
      </div>}
      {(asset || assetId || connected || resultInput) && <button type="button" className={cn(styles.clear, "nodrag nopan")} title={clearLabel} aria-label={clearLabel}
        disabled={!writable || pending} onPointerDown={event => event.stopPropagation()} onKeyDown={event => event.stopPropagation()}
        onClick={event => { event.stopPropagation(); if (controller.clear(nodeId)) body.current?.closest<HTMLElement>("[data-space-node-body]")?.focus({ preventScroll: true }); }}><X /></button>}
      {presentation.isOptional === true && asset && <span className={styles.badge}>{tc("Optional")}</span>}
      {connected && asset && mediaType === "image" && <span className={styles.badge}>{tc("Connected image")}</span>}
      {pending && <div className={styles.pending}><GenerationPending status={sourceExecution?.executionId === resultSource.executionId ? sourceExecution?.status ?? "processing" : "processing"} />
        {mediaEdit && typeof resultSource.portId === "string" && isDirectEditPort(resultSource.portId) && <button type="button"
          className="nodrag nopan absolute bottom-3 rounded-md bg-white/10 px-3 py-1 text-xs text-white hover:bg-white/20"
          disabled={!writable} onPointerDown={event => event.stopPropagation()} onKeyDown={event => event.stopPropagation()}
          onClick={() => mediaEdit.cancelResult(nodeId)}>{tc("Cancel")}</button>}
      </div>}
      {uploading && <div className={cn(styles.status, "nodrag nopan")} role="status" aria-busy="true">
        <LoaderCircle className={styles.spinner} aria-hidden="true" />{t("uploading")}
        <button type="button" onClick={() => controller.cancel(nodeId)}>{tc("Cancel")}</button>
      </div>}
      {runtime?.uploadError && <div className={cn(styles.error, "nodrag nopan")} role="alert">{runtime.uploadError}
        <button type="button" disabled={!canChoose} onClick={() => {
          if (lastFile.current) uploadFile(lastFile.current);
          else { pickerExpectation.current = controller.capture(nodeId); if (pickerExpectation.current) fileInput.current?.click(); }
        }}>{tc("Retry")}</button>
      </div>}
      {assetId && assetQuery.isError && <div className={cn(styles.error, "nodrag nopan")} role="alert">{t("loadError")}
        <button type="button" onClick={() => void assetQuery.refetch()}>{tc("Retry")}</button>
      </div>}
      {!pending && resultSource.state === "failed" && <div className={styles.error} role="alert">{t("resultFailed")}</div>}
      {!pending && resultSource.state === "cancelled" && <div className={styles.status} role="status">{t("resultCancelled")}</div>}
      <MediaAssetPicker key={`${nodeId}:${inputRevision}:${canChoose}`} mediaType={mediaType} selectedAssetId={assetId}
        writable={canChoose} open={pickerOpen} onOpenChange={changeChooserOpen}
        onSelect={chosen => {
          if (!canChoose || !choice || !controller.matches(choice.expected, nodeId)) return;
          controller.select(nodeId, chosen, choice.expected); changeChooserOpen(false);
        }} />
    </div>
  </SpaceNodeFrame>;
}
