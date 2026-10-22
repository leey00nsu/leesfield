"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useLocale } from "next-intl";
import { uploadMediaAsset } from "@/features/media-assets/api/media-asset-api";
import { mediaAssetKeys } from "@/features/media-assets/hook/use-media-assets";
import { MediaAssetPicker } from "@/features/media-assets/ui/media-asset-picker";
import { MediaAssetDetail } from "@/features/media-assets/ui/media-asset-detail";
import { mediaUploadErrorMessage } from "@/shared/api/reference-file-upload";
import { allowedMediaMimeTypes } from "@/shared/media-assets/media-asset-contract";
import { normalizeDroppedMediaFile } from "@/shared/media-assets/media-file-drop";
import { createSpaceInputMediaController, type SpaceInputMediaController, type SpacePortMediaExpectation } from "../model/space-editor-media";
import { captureSpaceVideoFrame, type SpaceVideoCapturePosition } from "../lib/space-video-capture";
import type { MediaAssetDto } from "@/shared/media-assets/media-asset-contract";
import { useSpaceInputRevision, useSpaceSelector, useSpaceViewSelector, type SpaceEditorScope, type SpaceEditorServices } from "./space-editor-provider";

export interface SpaceMediaRequest {
  expected: SpacePortMediaExpectation;
  action: "upload" | "assets";
  position: { x: number; y: number };
}

interface MediaDetailRequest {
  scope: SpaceEditorScope; nodeId: string; epoch: number; revision: number;
  asset: MediaAssetDto; returnFocus: HTMLElement; canvas: HTMLElement | null; onClosed?: () => void;
}
function validDetail(scope: SpaceEditorScope, request: MediaDetailRequest) {
  const state = scope.session.getSnapshot();
  return request.scope === scope && !state.disposed && state.nodeById.has(request.nodeId)
    && scope.view.getState().epoch === request.epoch && scope.inputs.inputRevision(request.nodeId) === request.revision;
}

/** Shared binary/asset entry points for drop, paste and typed port menus. */
export function useSpaceMediaServices(scope: SpaceEditorScope) {
  const queryClient = useQueryClient(), locale = useLocale();
  const [request, setRequest] = useState<SpaceMediaRequest | null>(null);
  const [detail, setDetail] = useState<MediaDetailRequest | null>(null);
  const closeDetail = useCallback(() => setDetail(null), []);
  const openMediaDetail = useCallback<NonNullable<SpaceEditorServices["openMediaDetail"]>>((nodeId, asset, returnFocus, onClosed) => {
    const state = scope.session.getSnapshot();
    if (state.disposed || !state.nodeById.has(nodeId) || asset.status !== "completed") { onClosed?.(); return; }
    setDetail({ scope, nodeId, epoch: scope.view.getState().epoch, revision: scope.inputs.inputRevision(nodeId),
      asset, returnFocus, canvas: returnFocus.closest<HTMLElement>("[data-space-canvas]"), onClosed });
  }, [scope]);
  useEffect(() => {
    if (!detail) return;
    const invalidate = () => { if (!validDetail(scope, detail)) setDetail(current => current === detail ? null : current); };
    const stopSession = scope.session.store.subscribe(invalidate), stopView = scope.view.subscribe(invalidate);
    invalidate();
    return () => { stopSession(); stopView(); detail.onClosed?.(); };
  }, [scope, detail]);
  const controller = useMemo(() => createSpaceInputMediaController({ session: scope.session, inputs: scope.inputs,
    upload: (file, type, signal, videoCapture) => uploadMediaAsset(file, type, undefined, signal, videoCapture),
    rememberAsset: asset => { queryClient.setQueryData(mediaAssetKeys.detail(asset.id), asset); void queryClient.invalidateQueries({ queryKey: mediaAssetKeys.list(asset.type) }); },
    errorMessage: error => mediaUploadErrorMessage(error, locale === "ko"),
    onError: error => scope.view.getState().services.onError?.(error), getCatalog: () => scope.view.getState().catalog, getInputRuntime: scope.getInputRuntime,
  }), [scope, queryClient, locale]);
  const portMediaRequest = useCallback<NonNullable<SpaceEditorServices["portMediaRequest"]>>(input => {
    const expected = controller.capturePort(input.port);
    if (expected) setRequest({ expected, action: input.action, position: input.position });
  }, [controller]);
  const close = useCallback(() => setRequest(null), []);
  const captureVideoFrame = useCallback((sourceId: string, asset: MediaAssetDto, position: SpaceVideoCapturePosition) =>
    controller.captureFrame(sourceId, asset.id, signal => captureSpaceVideoFrame(asset, position, signal)), [controller]);
  return { controller, filesDrop: controller.filesDrop, captureVideoFrame, openMediaDetail, portMediaRequest,
    tools: <><SpaceMediaTools controller={controller} request={request} onClose={close} />
      {detail && <SpaceMediaDetail scope={scope} request={detail} onClose={closeDetail} />}</> };
}

function SpaceMediaDetail({ scope, request, onClose }: { scope: SpaceEditorScope; request: MediaDetailRequest; onClose: () => void }) {
  const writable = useSpaceSelector(state => state.writable);
  useSpaceSelector(state => state.disposed || !state.nodeById.has(request.nodeId));
  useSpaceInputRevision(request.nodeId);
  useSpaceViewSelector(state => state.epoch);
  if (!validDetail(scope, request)) return null;
  return <MediaAssetDetail asset={request.asset} autoPlay writable={writable} onClose={onClose}
    finalFocus={() => request.returnFocus.isConnected ? request.returnFocus : request.canvas?.isConnected ? request.canvas : false} />;
}

export function SpaceMediaTools({ controller, request, onClose }: { controller: SpaceInputMediaController; request: SpaceMediaRequest | null; onClose: () => void }) {
  const fileInput = useRef<HTMLInputElement>(null), opened = useRef<SpaceMediaRequest | null>(null);
  const current = useRef(request);
  const close = useCallback(() => {
    // The port menu is gone when this picker closes. Return to the owning
    // canvas so the next canvas shortcut has a live keyboard target.
    const canvas = fileInput.current?.parentElement?.querySelector<HTMLElement>("[data-space-canvas]");
    onClose();
    requestAnimationFrame(() => { if (canvas?.isConnected) canvas.focus(); });
  }, [onClose]);
  useSpaceInputRevision(request?.expected.target.nodeId ?? "");
  useSpaceSelector(state => state.writable);
  const valid = Boolean(request && controller.matches(request.expected.target, request.expected.target.nodeId));
  useLayoutEffect(() => { current.current = request; }, [request]);
  useEffect(() => {
    if (!request || !valid) return;
    if (request.action === "upload" && opened.current !== request) { opened.current = request; fileInput.current?.click(); }
    const input = fileInput.current, cancel = () => { if (current.current === request) close(); };
    input?.addEventListener("cancel", cancel);
    return () => { input?.removeEventListener("cancel", cancel); controller.cancel(request.expected.target.nodeId); };
  }, [controller, request, close, valid]);
  return <>
    <input ref={fileInput} type="file" hidden aria-label="Upload port media" accept={request ? allowedMediaMimeTypes[request.expected.type].join(",") : undefined}
      onChange={event => {
        const selected = event.target.files?.[0], active = current.current; event.target.value = "";
        if (!active || active.action !== "upload" || !controller.matches(active.expected.target, active.expected.target.nodeId)) return;
        const file = selected && normalizeDroppedMediaFile(selected);
        if (!file || file.type.split("/")[0] !== active.expected.type) { close(); return; }
        void controller.uploadPort(active.expected, file, active.position).finally(() => { if (current.current === active) close(); });
      }} />
    {request?.action === "assets" && valid && <MediaAssetPicker mediaType={request.expected.type} writable selectedAssetId={null} open
      onOpenChange={open => { if (!open) close(); }} onSelect={asset => { if (current.current === request) { controller.selectPort(request.expected, asset, request.position); close(); } }} />}
  </>;
}
