"use client";

import { AppVideoPlayer } from "@/shared/ui/app-video-player";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Copy, Loader2, Video } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useMediaAssetList } from "@/features/media-assets/hook/use-media-assets";
import { useCanvasTranslation } from "@/shared/i18n/use-canvas-translation";
import { cn } from "@/shared/lib/utils";
import type { MediaAssetDto } from "@/shared/media-assets/media-asset-contract";
import { VariantImage } from "@/shared/media-assets/variant-image";
import { AppTextarea } from "@/shared/ui/app-form-control";
import { appToast } from "@/shared/ui/app-toast";
import { NodeTextEditor } from "@/shared/ui/node-text-editor";
import { useClipboardCopy } from "@/shared/ui/use-clipboard-copy";
import { nodeExecutionKeys, useNodeExecutions, useSelectAssistantItem } from "../../hook/use-node-executions";
import type { NodeExecutionDto } from "../../model/node-execution-types";
import { useSpaceEditor, useSpaceResolvedInput, useSpaceSelector, useSpaceViewSelector, type SpaceEditorScope } from "../space-editor-provider";
import { NodeViewTabs } from "./node-view-tabs";
import { SpaceNodeFrame } from "./space-node-frame";
import styles from "./space-node-assistant.module.css";

function promptOf(config: unknown): string {
  return config && typeof config === "object" && "prompt" in config && typeof config.prompt === "string" ? config.prompt : "";
}
function active(execution: NodeExecutionDto) { return ["pending", "processing", "uploading"].includes(execution.status); }

/** Runtime can lead history after SSE; history can lead runtime after an item selection. */
function assistantRecords(history: readonly NodeExecutionDto[] | undefined, runtime: NodeExecutionDto | undefined, nodeId: string) {
  const records = (history ?? []).filter(row => row.executionKind === "assistant" && row.graphNodeId === nodeId);
  if (runtime?.executionKind === "assistant" && runtime.graphNodeId === nodeId) {
    const index = records.findIndex(row => row.executionId === runtime.executionId), cached = records[index];
    if (!cached) records.unshift(runtime);
    else if ((active(cached) && !active(runtime)) || (cached.status === runtime.status && (runtime.selectionVersion ?? 0) > (cached.selectionVersion ?? 0))) records[index] = runtime;
  }
  return records.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
}
function completedResult(records: readonly NodeExecutionDto[]) {
  return records.find(row => row.status === "completed" && (row.outputText || row.outputItems?.length));
}

function AssistantPending({ overlay = false }: { overlay?: boolean }) {
  const t = useTranslations("generation.canvas");
  return <div role="status" aria-live="polite" aria-label={t("generating")}
    className={cn(styles.pending, overlay && styles.pendingOverlay)} data-space-assistant-pending="">
    <Loader2 className="size-6 animate-spin motion-reduce:animate-none" aria-hidden="true" />
    <span>{t("generating")}</span>
  </div>;
}

// Invalidations are synchronous, including delete/undo and reset A→B→A between
// React renders. No delayed action writes a captured graph or runtime snapshot.
function useActionGuard(scope: SpaceEditorScope, graphId: string, nodeId: string) {
  const guard = useMemo(() => {
    let mounted = false, epoch = 0, promptRevision = 0;
    return {
      capture: () => ({ epoch, promptRevision }),
      current(token: { epoch: number }, write = false) {
        const state = scope.session.getSnapshot();
        return mounted && epoch === token.epoch && !state.disposed && state.id === graphId
          && state.nodeById.get(nodeId)?.kind === "generate.assistant" && (!write || state.writable);
      },
      start() {
        mounted = true;
        const stop = scope.session.store.subscribe((state, previous) => {
          if (state.id !== previous.id || state.disposed || (!state.writable && previous.writable)
            || (!state.nodeById.has(nodeId) && previous.nodeById.has(nodeId))
            || (state.revision === 0 && state.history !== previous.history)) epoch++;
          if (promptOf(state.nodeById.get(nodeId)?.config) !== promptOf(previous.nodeById.get(nodeId)?.config)) promptRevision++;
        });
        return () => { mounted = false; epoch++; stop(); };
      },
    };
  }, [scope, graphId, nodeId]);
  useLayoutEffect(() => guard.start(), [guard]);
  return guard;
}

const failureMessages: Record<string, [string, string]> = {
  ASSISTANT_PROVIDER_REJECTED: ["모델 제공자가 요청을 거부했습니다.", "The model provider rejected the request."],
  ASSISTANT_PROVIDER_UNAVAILABLE: ["모델 제공자에 연결할 수 없습니다.", "Could not connect to the model provider."],
  ASSISTANT_MODEL_UNAVAILABLE: ["선택한 모델을 사용할 수 없습니다.", "The selected model is unavailable."],
  ASSISTANT_VISUAL_UNSUPPORTED: ["선택한 모델은 이미지·비디오 입력을 지원하지 않습니다.", "The selected model does not support image or video inputs."],
  ASSISTANT_INPUT_UNAVAILABLE: ["연결된 참고자료를 읽을 수 없습니다.", "Could not read the connected references."],
  ASSISTANT_FRAME_EXTRACTION_FAILED: ["비디오의 대표 프레임을 추출하지 못했습니다.", "Could not extract a preview frame from the video."],
  ASSISTANT_LEASE_EXPIRED: ["실행 시간이 초과됐습니다. 다시 실행해 주세요.", "The request timed out. Try again."],
  ASSISTANT_LIST_INVALID: ["모델이 올바른 목록을 반환하지 않았습니다. 지시문을 확인하고 다시 실행해 주세요.", "The model returned an invalid list. Check the instructions and try again."],
};

/** Complete native presenter; Frame owns the single header, services and ports. */
export function SpaceAssistantNode({ nodeId }: { nodeId: string }) {
  const node = useSpaceSelector(state => state.nodeById.get(nodeId));
  const graphId = useSpaceSelector(state => state.id);
  const epoch = useSpaceViewSelector(state => state.epoch);
  if (node?.kind !== "generate.assistant") return null;
  return <SpaceNodeFrame nodeId={nodeId}>
    <AssistantBody key={JSON.stringify([graphId, nodeId, epoch])} nodeId={nodeId} graphId={graphId} savedPrompt={promptOf(node.config)} />
  </SpaceNodeFrame>;
}

function AssistantBody({ nodeId, graphId, savedPrompt }: { nodeId: string; graphId: string; savedPrompt: string }) {
  const scope = useSpaceEditor(), tc = useCanvasTranslation(), t = useTranslations("assistantList"), ko = useLocale().startsWith("ko");
  const writable = useSpaceSelector(state => state.writable), persisted = useSpaceSelector(state => state.persistedNodeIds.has(nodeId));
  const disposed = useSpaceSelector(state => state.disposed), runtime = useSpaceSelector(state => state.runtimeByNode.get(nodeId)?.execution);
  const submissionPending = useSpaceSelector(state => state.runtimeByNode.get(nodeId)?.submissionPending === true);
  const queryClient = useQueryClient();
  const executions = useNodeExecutions(graphId, nodeId, persisted && !disposed);
  const selectItem = useSelectAssistantItem(), copyToClipboard = useClipboardCopy();
  const guard = useActionGuard(scope, graphId, nodeId);
  const composing = useRef<ReturnType<typeof guard.capture> | null>(null), choosing = useRef(false);
  const pendingSelection = useRef<object | null>(null);
  useEffect(() => () => {
    if (pendingSelection.current && scope.session.getSnapshot().runtimeByNode.get(nodeId)?.selectionPending === pendingSelection.current)
      scope.session.patchRuntime(nodeId, { selectionPending: undefined });
  }, [scope, nodeId]);
  const [draftState, setDraftState] = useState<{ scope: SpaceEditorScope; source: string; value: string } | null>(null);
  const draft = draftState?.scope === scope && draftState.source === savedPrompt ? draftState.value : savedPrompt;
  const [viewState, setViewState] = useState<{ scope: SpaceEditorScope; tab: "original" | "result"; seenResultId: string | null }>({ scope, tab: "original", seenResultId: null });
  const records = assistantRecords(executions.data, runtime, nodeId), latest = records[0], result = completedResult(records);
  const pending = !disposed && (submissionPending || Boolean(latest && active(latest)));
  const tab = viewState.scope !== scope ? result ? "result" : "original"
    : result && result.executionId !== viewState.seenResultId ? "result" : viewState.tab;
  const references = useSpaceResolvedInput(nodeId, inputs => inputs.incomingEdges(nodeId).filter(edge => ["images", "videos"].includes(edge.targetPortId))
    .flatMap(edge => inputs.edgeAssetIds(edge).map((assetId, index) => ({ assetId, key: JSON.stringify([edge.id, index]) }))));
  const assetIds = useMemo(() => [...new Set(references.map(reference => reference.assetId))], [references]);
  const assets = useMediaAssetList(assetIds), assetsById = new Map(assetIds.map((id, index) => [id, assets[index]?.data]));
  const connectedText = useSpaceResolvedInput(nodeId, inputs => inputs.promptInput(nodeId));
  const copyText = tab === "original" ? draft : result?.outputText;
  const freshResult = () => completedResult(assistantRecords(queryClient.getQueryData<NodeExecutionDto[]>(nodeExecutionKeys.list(graphId, nodeId)),
    scope.session.getSnapshot().runtimeByNode.get(nodeId)?.execution, nodeId));
  const copy = (text: string | null | undefined = copyText) => {
    const token = guard.capture();
    if (!text?.trim() || !guard.current(token)) return;
    void copyToClipboard(text, { isCurrent: () => guard.current(token) });
  };
  const publishPrompt = (value: string, token = guard.capture()) => {
    if (!guard.current(token, true) || token.promptRevision !== guard.capture().promptRevision) return;
    scope.session.dispatch({ type: "node.config.patch", nodeId, patch: { prompt: value } });
  };
  const chooseItem = async (itemId: string) => {
    const token = guard.capture(), current = freshResult();
    if (!guard.current(token, true) || !scope.session.getSnapshot().persistedNodeIds.has(nodeId) || choosing.current || selectItem.isPending
      || !result || !current || current.executionId !== result.executionId || (current.selectionVersion ?? 0) !== (result.selectionVersion ?? 0)
      || current.selectedItemId === itemId || !current.outputItems?.some(item => item.id === itemId)) return;
    choosing.current = true;
    const pending = Object.freeze({}); pendingSelection.current = pending;
    scope.session.patchRuntime(nodeId, { selectionPending: pending });
    try {
      await selectItem.mutateAsync({ graphId, nodeId, executionId: current.executionId, itemId, expectedSelectionVersion: current.selectionVersion ?? 0 });
    } catch (error) {
      if (guard.current(token, true) && freshResult()?.executionId === current.executionId) {
        appToast.error(error instanceof Error && error.message === "ASSISTANT_SELECTION_CONFLICT" ? t("selectionConflict") : t("selectionFailed"));
      }
    } finally {
      choosing.current = false;
      if (scope.session.getSnapshot().runtimeByNode.get(nodeId)?.selectionPending === pending) scope.session.patchRuntime(nodeId, { selectionPending: undefined });
      if (pendingSelection.current === pending) pendingSelection.current = null;
    }
  };
  return <div className={styles.body} data-space-assistant="" onKeyDownCapture={event => {
    if (composing.current || event.nativeEvent.isComposing || event.keyCode === 229) event.stopPropagation();
  }}>
    <div className={styles.viewHeader}>
      <NodeViewTabs id={nodeId} label={ko ? "Assistant 보기" : "Assistant view"} value={tab}
        tabs={[{ value: "original", label: tc("Source") }, { value: "result", label: tc("Result") }]}
        onChange={next => setViewState({ scope, tab: next, seenResultId: result?.executionId ?? null })} />
      {tab === "original" && <ol className={cn(styles.references, "nowheel")} aria-label={ko ? "연결된 참고자료" : "Connected references"}>
        {references.map((reference, index) => <ReferencePreview key={reference.key} asset={assetsById.get(reference.assetId)} index={index} ko={ko} />)}
      </ol>}
      <button type="button" disabled={!copyText?.trim()} onClick={() => copy()} onPointerDown={event => event.stopPropagation()}
        aria-label={tab === "original" ? ko ? "원본 복사" : "Copy source" : ko ? "결과 복사" : "Copy result"}
        title={copyText?.trim() ? ko ? "복사" : "Copy" : ko ? "복사할 텍스트가 없습니다." : "No text to copy."}
        className={cn(styles.copy, "nodrag nopan")}><Copy aria-hidden="true" /></button>
    </div>
    {tab === "original" ? <div role="tabpanel" id={`${nodeId}-original-panel`} aria-labelledby={`${nodeId}-original-tab`} className={cn(styles.source, "nowheel")} data-pending={pending}>
      {connectedText.connected && <span className={styles.context} title={connectedText.text ?? ""}>
        {ko ? "텍스트 입력: " : "Text input: "}{connectedText.text || (ko ? "결과를 기다리는 중" : "Waiting for a result")}
      </span>}
      <NodeTextEditor label={ko ? "Assistant 지시문 편집" : "Edit Assistant instructions"} disabled={!writable} className={styles.editor}>
        {editing => <AppTextarea surface="transparent" value={draft} maxLength={20_000} disabled={!writable} readOnly={!editing} tabIndex={editing ? 0 : -1}
          aria-label={ko ? "Assistant 지시문" : "Assistant instructions"} placeholder={ko ? "무엇을 도와드릴까요?" : "How can I help?"}
          className={cn(styles.textarea, "nodrag nowheel")} onPointerDown={event => { if (editing) event.stopPropagation(); }}
          onCompositionStart={() => { const token = guard.capture(); if (guard.current(token, true)) composing.current = token; }}
          onCompositionEnd={event => {
            const token = composing.current; composing.current = null;
            if (!token || !guard.current(token, true) || token.promptRevision !== guard.capture().promptRevision) {
              setDraftState(null);
              return;
            }
            const value = event.currentTarget.value;
            setDraftState(null); publishPrompt(value, token);
          }}
          onChange={event => {
            const token = guard.capture();
            if (!guard.current(token, true)) return;
            if ((event.nativeEvent as InputEvent).isComposing && !composing.current) composing.current = token;
            const value = event.target.value;
            if (composing.current) setDraftState({ scope, source: savedPrompt, value });
            else { setDraftState(null); publishPrompt(value, token); }
          }} />}
      </NodeTextEditor>
      {pending && <AssistantPending overlay />}
    </div> : <div role="tabpanel" id={`${nodeId}-result-panel`} aria-labelledby={`${nodeId}-result-tab`} className={cn(styles.result, "nowheel")}>
      {pending && <AssistantPending overlay={Boolean(result)} />}
      {(result || !pending) && <div className={styles.resultContent}>{result?.outputMode === "list" && result.outputItems?.length ? <ol className={styles.results} aria-label={t("results")}>
        {result.outputItems.map((item, index) => <li key={item.id} className={styles.item} data-selected={result.selectedItemId === item.id}>
          <div className={styles.itemHeader}>
            <button type="button" aria-label={t("selectItem", { number: index + 1 })} aria-pressed={result.selectedItemId === item.id}
              disabled={!writable || !persisted || selectItem.isPending} onClick={() => void chooseItem(item.id)} className={cn(styles.select, "nodrag nopan")}>
              {index + 1}. {result.selectedItemId === item.id ? t("selected") : t("select")}
            </button>
            <button type="button" aria-label={t("copyItem", { number: index + 1 })} onClick={() => copy(item.text)} className={cn(styles.itemCopy, "nodrag nopan")}>
              <Copy aria-hidden="true" />
            </button>
          </div><p>{item.text}</p>
        </li>)}
      </ol> : result?.outputText ?? (ko ? "아직 생성된 결과가 없습니다." : "No generated result yet.")}</div>}
    </div>}
    {latest?.status === "failed" && <span role="alert" className={styles.error}>
      {(latest.errorCode && Object.hasOwn(failureMessages, latest.errorCode) ? failureMessages[latest.errorCode] : ["생성에 실패했습니다. 다시 실행해 주세요.", "Generation failed. Try again."])[ko ? 0 : 1]}
    </span>}
  </div>;
}

function ReferencePreview({ asset, index, ko }: { asset: MediaAssetDto | undefined; index: number; ko: boolean }) {
  const [element, setElement] = useState<HTMLLIElement | null>(null);
  const [visible, setVisible] = useState(() => typeof IntersectionObserver === "undefined");
  useEffect(() => {
    if (!element || asset?.type !== "video" || typeof IntersectionObserver === "undefined") return;
    let disposed = false;
    const observer = new IntersectionObserver(entries => { if (!disposed && entries[0]) setVisible(entries[0].isIntersecting); });
    observer.observe(element);
    return () => { disposed = true; observer.disconnect(); };
  }, [element, asset?.type]);
  const label = ko ? `참고자료 ${index + 1}` : `Reference ${index + 1}`;
  return <li ref={setElement} className={styles.reference} title={label}>
    {asset?.type === "image" ? <VariantImage asset={asset} purpose="list" alt={ko ? `이미지 참고자료 ${index + 1}` : `Image reference ${index + 1}`}
      loading="lazy" decoding="async" draggable={false} className={styles.preview} />
      : asset?.type === "video" ? <><ReferenceVideo url={asset.url} visible={visible} label={ko ? `비디오 참고자료 ${index + 1}` : `Video reference ${index + 1}`} />
        <span className={styles.videoBadge}><Video aria-hidden="true" /></span></>
        : <Video className={styles.placeholder} aria-hidden="true" />}
  </li>;
}

function ReferenceVideo({ url, visible, label }: { url: string; visible: boolean; label: string }) {
  return <AppVideoPlayer src={url} active={visible} releaseWhenInactive controls={false} muted playsInline preload={visible ? "metadata" : "none"} aria-label={label} className={styles.preview} />;
}
