"use client";

import { useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useQueries } from "@tanstack/react-query";
import { Copy, Video } from "lucide-react";
import type { CanonicalJsonValue } from "@/shared/generation-graph/canonical-graph";
import { VariantImage } from "@/shared/media-assets/variant-image";
import { getMediaAsset } from "@/features/media-assets/api/media-asset-api";
import { mediaAssetKeys } from "@/features/media-assets/hook/use-media-assets";
import { AppTextarea } from "@/shared/ui/app-form-control";
import { appToast } from "@/shared/ui/app-toast";
import { useCanvasTranslation } from "@/shared/i18n/use-canvas-translation";
import { useCancelNodeExecution, useNodeExecutions, useStartNodeExecution } from "../../hook/use-node-executions";
import { useNodeAuthoring } from "../../model/node-authoring-context";
import type { NodeBananaNodeData } from "../../runtime/node-banana/node-banana-runtime-adapter";
import { AssistantModelPicker } from "./assistant-model-picker";
import { NodeBananaExecutionHeader } from "./node-banana-execution-header";
import { NodeViewTabs } from "./node-view-tabs";

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function errorMessage(code: string | null) {
  if (!code) return null;
  const messages: Record<string, string> = {
    ASSISTANT_PROVIDER_REJECTED: "모델 제공자가 요청을 거부했습니다.",
    ASSISTANT_PROVIDER_UNAVAILABLE: "모델 제공자에 연결할 수 없습니다.",
    ASSISTANT_MODEL_UNAVAILABLE: "선택한 모델을 사용할 수 없습니다.",
    ASSISTANT_VISUAL_UNSUPPORTED: "선택한 모델은 이미지·비디오 입력을 지원하지 않습니다.",
    ASSISTANT_INPUT_UNAVAILABLE: "연결된 참고자료를 읽을 수 없습니다.",
    ASSISTANT_FRAME_EXTRACTION_FAILED: "비디오의 대표 프레임을 추출하지 못했습니다.",
    ASSISTANT_LEASE_EXPIRED: "실행 시간이 초과됐습니다. 다시 실행해 주세요.",
  };
  return messages[code] ?? `생성에 실패했습니다. (${code})`;
}

export function AssistantNodeControls({ id, data, selected = false, title = "AI 어시스턴트" }: { id: string; data: NodeBananaNodeData; selected?: boolean; title?: string }) {
  const tc = useCanvasTranslation();
  const authoring = useNodeAuthoring();
  const [browseOpen, setBrowseOpen] = useState(false);
  const config = record(data.config);
  const savedPrompt = typeof config.prompt === "string" ? config.prompt : "";
  const modelKey = typeof config.modelKey === "string" ? config.modelKey : null;
  const [viewState, setViewState] = useState<{ tab: "original" | "result"; seenResultId: string | null }>({ tab: "original", seenResultId: null });
  const [draftState, setDraftState] = useState({ source: savedPrompt, value: savedPrompt });
  const draft = draftState.source === savedPrompt ? draftState.value : savedPrompt;
  const composing = useRef(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const persisted = authoring.isNodePersisted?.(id) ?? true;
  const executions = useNodeExecutions(authoring.graphId, id, persisted, 2_000);
  const start = useStartNodeExecution();
  const cancel = useCancelNodeExecution();
  const records = (executions.data ?? []).filter((item) => item.executionKind === "assistant");
  const latest = records[0];
  const result = records.find((item) => item.status === "completed" && item.outputText);
  const active = records.find((item) => item.status === "pending" || item.status === "processing");
  const tab = result?.executionId && result.executionId !== viewState.seenResultId ? "result" : viewState.tab;

  const imageIds = authoring.getNodeInputAssetIds?.(id, "images") ?? [];
  const videoIds = authoring.getNodeInputAssetIds?.(id, "videos") ?? [];
  const inputIds = [...imageIds, ...videoIds];
  const assets = useQueries({ queries: inputIds.map((assetId) => ({
    queryKey: mediaAssetKeys.detail(assetId), queryFn: () => getMediaAsset(assetId), staleTime: 60_000,
  })) });
  const connectedText = authoring.getNodePromptInput?.(id) ?? { connected: false, text: null };
  const models = authoring.llmModels ?? [];
  const selectedModel = models.find((model) => model.key === modelKey);
  const writable = authoring.writable !== false && Boolean(authoring.updateCanonicalNodeConfig);
  const readiness = authoring.getNodeRunReadiness?.(id);
  const ready = writable && Boolean(modelKey) && readiness?.ready !== false;
  const canRun = ready && !active && !start.isPending && !submitting;

  const publishPrompt = (prompt: string) => authoring.updateCanonicalNodeConfig?.(id, { ...config, prompt } as CanonicalJsonValue);
  const run = async () => {
    if (!canRun) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const version = await (authoring.prepareNodeExecution ?? authoring.prepareImageNodeExecution)();
      await start.mutateAsync({ graphId: authoring.graphId, nodeId: id, expectedGraphVersion: version });
      await executions.refetch();
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : "ASSISTANT_FAILED");
    } finally {
      setSubmitting(false);
    }
  };
  const stop = async () => {
    if (!active) return;
    await cancel.mutateAsync({ graphId: authoring.graphId, nodeId: id, executionId: active.executionId }).catch((error) => {
      setSubmitError(error instanceof Error ? error.message : "ASSISTANT_CANCEL_FAILED");
    });
  };
  const copyText = tab === "original" ? draft : result?.outputText;
  const copy = async () => {
    if (!copyText) return;
    try { await navigator.clipboard.writeText(copyText); appToast.copied("복사했습니다."); }
    catch { appToast.error("복사하지 못했습니다."); }
  };

  return <div className="nodrag nowheel flex min-h-0 flex-1 flex-col gap-3" data-leesfield-component="AssistantNode">
    <NodeBananaExecutionHeader id={id} title={title} config={data.config} selected={selected}
      ready={ready} executing={Boolean(active) || submitting || start.isPending}
      disabledReason={!modelKey ? "모델을 선택해 주세요" : readiness?.ready === false ? "This node is not ready to run." : null}
      onRun={() => void run()} onCancel={active ? () => void stop() : undefined} cancelling={cancel.isPending}
      browseAction={<button type="button" onClick={() => setBrowseOpen(true)} disabled={!writable} className="nodrag nopan rounded border border-neutral-600 bg-neutral-700 px-1.5 py-0.5 text-[10px] text-neutral-300 transition-colors hover:bg-neutral-600 disabled:cursor-not-allowed disabled:opacity-50">찾아보기</button>} />
    {selected && typeof document !== "undefined" ? createPortal(<aside role="region" aria-label="AI 어시스턴트 설정" className="fixed right-3 top-0 z-[2000] flex h-screen items-center pointer-events-none sm:right-6"
      onPointerDown={event => event.stopPropagation()}>
      <div className="nodrag nopan nowheel pointer-events-auto max-h-[80vh] w-80 max-w-[calc(100vw-24px)] overflow-y-auto rounded-xl border border-neutral-700 bg-neutral-800 p-4 shadow-lg">
      <h3 className="mb-4 text-sm font-medium text-neutral-200">AI 어시스턴트 설정</h3>
      <label className="mb-1 block text-xs text-neutral-400" htmlFor={`${id}-model`}>모델</label>
      <button id={`${id}-model`} type="button" aria-label="Assistant 모델 선택" disabled={!writable} onClick={() => setBrowseOpen(true)}
        className="w-full truncate rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-left text-xs text-white hover:border-neutral-500 disabled:opacity-40">
        {selectedModel?.label ?? (modelKey ? "사용할 수 없는 모델" : "모델 선택...")}
      </button>
      </div>
    </aside>, document.body) : null}
    <AssistantModelPicker models={models} selectedKey={modelKey} disabled={!writable} loading={authoring.isLoading} error={authoring.error}
      open={browseOpen} onOpenChange={setBrowseOpen}
      onSelect={key => authoring.updateCanonicalNodeConfig?.(id, { ...config, modelKey: key } as CanonicalJsonValue)} onRefresh={authoring.retry} />
    <div className="flex w-full shrink-0 items-center justify-between gap-2" data-leesfield-component="AssistantViewHeader">
      <NodeViewTabs id={id} label="Assistant 보기" value={tab}
        tabs={[{ value: "original", label: tc("Source") }, { value: "result", label: tc("Result") }]}
        onChange={next => setViewState({ tab: next, seenResultId: result?.executionId ?? null })} />
      {tab === "original" ? <div className="flex min-w-0 flex-1 gap-1 overflow-x-auto" aria-label="연결된 참고자료">
        {assets.map((query, index) => {
          const asset = query.data;
          return <div key={inputIds[index]} className="relative grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-lg border border-white/15 bg-neutral-800" title={`참고자료 ${index + 1}`}>
            {asset?.type === "image" ? <VariantImage asset={asset} purpose="list" alt={`이미지 참고자료 ${index + 1}`} className="h-full w-full object-cover" />
              : asset?.type === "video" ? <><video src={asset.url} muted playsInline preload="metadata" aria-label={`비디오 참고자료 ${index + 1}`} className="h-full w-full object-cover" /><span className="absolute bottom-0.5 right-0.5 rounded bg-black/75 p-0.5"><Video className="h-2.5 w-2.5 text-white" aria-hidden="true" /></span></>
                : <Video className="h-4 w-4 text-white/35" aria-hidden="true" />}
          </div>;
        })}
      </div> : null}
      <button type="button" disabled={!copyText} onClick={() => void copy()}
        onPointerDown={event => event.stopPropagation()} aria-label={tab === "original" ? "원본 복사" : "결과 복사"}
        title={copyText ? "복사" : "복사할 텍스트가 없습니다."}
        className="nodrag nopan ml-auto grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-white/15 bg-white/5 text-white/85 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-not-allowed disabled:opacity-40">
        <Copy className="h-5 w-5" aria-hidden="true" />
      </button>
    </div>

    {tab === "original" ? <div role="tabpanel" id={`${id}-original-panel`} aria-labelledby={`${id}-original-tab`} className="flex min-h-0 flex-1 flex-col gap-2">
      {connectedText.connected ? <span className="max-w-full truncate rounded bg-white/5 px-2 py-1 text-[10px] text-white/50" title={connectedText.text ?? ""}>텍스트 입력: {connectedText.text || "결과를 기다리는 중"}</span> : null}
      <AppTextarea surface="transparent" value={draft} maxLength={20_000} disabled={!writable} aria-label="Assistant 지시문" placeholder="무엇을 도와드릴까요?"
        className="nodrag nowheel min-h-44 w-full flex-1 resize-none border-0 bg-transparent px-1 py-3 text-sm leading-relaxed text-white outline-none placeholder:text-white/35"
        onPointerDown={(event) => event.stopPropagation()}
        onCompositionStart={() => { composing.current = true; }}
        onCompositionEnd={(event) => { composing.current = false; publishPrompt(event.currentTarget.value); }}
        onChange={(event) => { setDraftState({ source: savedPrompt, value: event.target.value }); if (!composing.current) publishPrompt(event.target.value); }} />
    </div> : <div role="tabpanel" id={`${id}-result-panel`} aria-labelledby={`${id}-result-tab`} className="nowheel min-h-0 flex-1 overflow-y-auto whitespace-pre-wrap break-words px-1 py-3 text-sm leading-relaxed text-white"
      >{result?.outputText ?? (active ? "생성 중입니다…" : "아직 생성된 결과가 없습니다.")}</div>}

    {latest?.status === "failed" ? <span role="alert" className="text-[11px] text-red-300">{errorMessage(latest.errorCode)}</span> : null}
    {submitError ? <span role="alert" className="text-[11px] text-red-300">{submitError}</span> : null}
  </div>;
}
