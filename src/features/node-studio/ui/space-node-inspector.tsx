"use client";

import { createPortal } from "react-dom";
import { useLocale, useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { AppButton } from "@/shared/ui/app-button";
import { AppChoiceSelect } from "@/shared/ui/app-choice-select";
import { AppTabs } from "@/shared/ui/app-tabs";
import { CinemaStudioControls } from "@/shared/ui/cinema/cinema-studio-controls";
import { cinemaPromptField } from "@/shared/cinema/cinema-model-support";
import type { CanonicalJsonValue } from "@/shared/generation-graph/canonical-graph";
import { isTemporarilyHiddenEditNodeKind } from "@/shared/generation-graph/node-availability";
import { useSpacePreferences } from "../hook/use-space-preferences";
import { updateSpaceNodeAuthoringConfig } from "../model/space-editor-authoring";
import { useSpaceEditor, useSpaceSelector, useSpaceViewSelector } from "./space-editor-provider";
import { spaceNodeModelType } from "./space-model-tools";
import { GenerationNodeParameterControls } from "./nodes/generation-node-parameter-controls";
import { useSpaceImageFit } from "./space-image-view-settings";
import { SpaceMemoInspector } from "./space-memo-inspector";
import { SpaceMediaEditInspector } from "./space-media-edit-inspector";
import { useSpaceMediaEditDraft } from "./space-media-edit-provider";

function record(value: unknown): Record<string, unknown> { return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}; }
export function SpaceNodeInspector() {
  const editing = useSpaceMediaEditDraft();
  const id = useSpaceSelector(state => state.selectedNodeIds.length === 1 ? state.selectedNodeIds[0] : null);
  return id && !editing ? <SpaceNodeInspectorContent key={id} nodeId={id} /> : null;
}
function SpaceNodeInspectorContent({ nodeId }: { nodeId: string }) {
  const scope = useSpaceEditor(), ko = useLocale() === "ko", t = useTranslations("assistantList"), preferences = useSpacePreferences();
  const node = useSpaceSelector(state => state.nodeById.get(nodeId)), writable = useSpaceSelector(state => state.writable);
  const runtime = useSpaceSelector(state => state.runtimeByNode.get(nodeId)), catalog = useSpaceViewSelector(state => state.catalog);
  const modality = spaceNodeModelType(node?.kind), config = record(node?.config);
  const models = modality === "image" ? catalog.imageModels : modality === "video" ? catalog.videoModels ?? [] : modality === "audio" ? catalog.audioModels ?? [] : catalog.llmModels ?? [];
  const selected = models.find(model => model.key === config.modelKey);
  const model = selected?.type !== "llm" ? selected : undefined;
  if (node && isTemporarilyHiddenEditNodeKind(node.kind)) return null;
  if (node?.kind === "note.memo") return <SpaceInspectorPanel title={ko ? "메모 설정" : "Memo settings"}><SpaceMemoInspector nodeId={nodeId} /></SpaceInspectorPanel>;
  if (node && ["edit.video.stitch", "edit.video.extractFrames"].includes(node.kind)) {
    const title = node.kind === "edit.video.stitch" ? ko ? "비디오 이어 붙이기 설정" : "Video Stitch settings"
        : ko ? "비디오 프레임 설정" : "Video Frames settings";
    return <SpaceInspectorPanel title={title}><SpaceMediaEditInspector nodeId={nodeId} /></SpaceInspectorPanel>;
  }
  if (node?.kind === "input.image") return <SpaceImageViewInspector nodeId={nodeId} disabled={!writable} ko={ko} />;
  if (!node || !modality || !writable || (modality !== "llm" && preferences?.inlineParametersEnabled)) return null;
  const running = Boolean(runtime?.execution && ["pending", "processing", "uploading"].includes(runtime.execution.status));
  const title = ko ? modality === "llm" ? "AI 어시스턴트 설정" : modality === "image" ? "이미지 생성 설정" : modality === "video" ? "비디오 생성 설정" : "오디오 생성 설정"
    : modality === "llm" ? "AI Assistant settings" : `Generate ${modality} settings`;
  const publish = (next: Record<string, unknown>) => {
    if (!scope.session.getSnapshot().writable) return;
    const result = scope.session.transact(document => updateSpaceNodeAuthoringConfig(document, nodeId, node.config, next as CanonicalJsonValue, scope.view.getState().catalog), { origin: "user", label: "node.settings" });
    if (!result.ok) scope.view.getState().services.onError?.(new Error(result.message));
  };
  return <SpaceInspectorPanel title={title}>
      {modality !== "audio" && modality !== "llm" && <CinemaStudioControls media={modality} settings={config.cinema} supportsPrompt={cinemaPromptField(model ?? {}).supported}
        presetKey={typeof record(config.promptPreset).key === "string" ? String(record(config.promptPreset).key) : undefined} disabled={running} onChange={cinema => publish({ ...config, cinema })} />}
      <div className="space-y-2"><label className="block text-xs text-neutral-400" htmlFor={`space-${nodeId}-model`}>{ko ? "모델" : "Model"}</label>
        <AppButton id={`space-${nodeId}-model`} type="button" variant="surface" className="w-full justify-start truncate text-xs" onClick={() => scope.view.getState().services.browseModel?.(nodeId)}>
          {selected?.label ?? (config.modelKey ? ko ? "사용할 수 없는 모델" : "Unavailable model" : ko ? "모델 선택..." : "Choose a model...")}
        </AppButton>
      </div>
      {modality === "llm" ? <div className="space-y-2" role="group" aria-label={t("outputFormat")}>
        <span className="block text-xs text-neutral-400">{t("outputFormat")}</span>
        <AppChoiceSelect label={t("outputFormat")} value={config.outputMode === "list" ? "list" : "text"}
          options={[{ value: "text", label: t("text") }, { value: "list", label: t("list") }]} onValueChange={outputMode => publish({ ...config, outputMode })} />
      </div>
        : model && <GenerationNodeParameterControls model={model} values={record(config.parameters)} disabled={!writable} onChange={parameters => publish({ ...config, parameters })} />}
  </SpaceInspectorPanel>;
}

function SpaceImageViewInspector({ nodeId, disabled, ko }: { nodeId: string; disabled: boolean; ko: boolean }) {
  const { fit, setFit } = useSpaceImageFit(nodeId);
  const label = ko ? "이미지 표시" : "Image fit";
  return <SpaceInspectorPanel title={ko ? "이미지 보기 설정" : "Image view settings"}>
    <div className="space-y-2" role="group" aria-label={label}>
      <span className="block text-xs text-neutral-400">{label}</span>
      <AppTabs selectionOnly ariaLabel={label} value={fit} listClassName="h-auto min-h-10 w-full overflow-x-auto overflow-y-hidden"
        triggerClassName="h-auto min-h-8" onValueChange={next => { if (!disabled && (next === "cover" || next === "contain")) setFit(next); }}
        items={[{ value: "cover", label: ko ? "채우기" : "Cover", disabled }, { value: "contain", label: ko ? "원본 맞춤" : "Contain", disabled }]} />
    </div>
  </SpaceInspectorPanel>;
}

function SpaceInspectorPanel({ title, children }: { title: string; children: ReactNode }) {
  return typeof document === "undefined" ? null : createPortal(<aside data-space-node-inspector="" role="region" aria-label={title}
    className="pointer-events-none fixed right-3 top-0 z-[1000] flex h-screen items-center max-sm:bottom-16 max-sm:top-auto max-sm:h-auto sm:right-6" onPointerDown={event => event.stopPropagation()} onKeyDown={event => event.stopPropagation()}>
    <div className="nodrag nopan nowheel pointer-events-auto max-h-[80vh] w-80 max-w-[calc(100vw-24px)] space-y-4 overflow-y-auto rounded-xl border border-neutral-700 bg-neutral-800 p-4 text-neutral-200 shadow-lg max-sm:max-h-[30vh]">
      <h3 className="text-sm font-medium">{title}</h3>
      {children}
    </div>
  </aside>, document.body);
}
