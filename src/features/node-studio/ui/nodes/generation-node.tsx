"use client";
import { contractAuthoringDefaults } from "@/shared/model-catalog/gradio-contract";
import { AppTextarea } from "@/shared/ui/app-form-control";

import { useCanvasTranslation } from "@/shared/i18n/use-canvas-translation";

import { memo, useRef, useState } from "react";
import { Handle, NodeResizer, Position, type Node, type NodeProps } from "@xyflow/react";
import { AlertCircle, AudioLines, Image as ImageIcon, LoaderCircle, RotateCcw, SlidersHorizontal, Video } from "lucide-react";
import { useTranslations } from "next-intl";

import type { CanonicalJsonValue } from "@/shared/generation-graph/canonical-graph";
import {
  authoringValuesToImageConfig,
  resolveImageAuthoringDefaults,
} from "@/shared/generation/image-authoring";
import { cn } from "@/shared/lib/utils";
import {
  resolveRuntimeAudioDefaults,
  resolveRuntimeImageMaxInputImages,
  resolveRuntimeVideoDefaults,
  resolveRuntimeVideoSupportsInitImage,
  type RuntimeAudioModel,
  type RuntimeImageModel,
  type RuntimeVideoModel,
} from "@/shared/model-catalog/runtime-utils";
import { AppButton } from "@/shared/ui/app-button";
import { GenerationModelSection } from "@/shared/ui/generation-model-section";
import { GenerationSettingsPopover } from "@/shared/ui/generation-settings-popover";

import { useNodeAuthoring } from "../../model/node-authoring-context";
import { nodeBananaNodeGeometry, nodeBananaNodeInventory } from "../../model/node-banana-node-inventory";
import type { NodeExecutionMediaType } from "../../model/node-execution-types";
import type { NodeBananaNodeData } from "../../runtime/node-banana/node-banana-runtime-adapter";
import { GenerationNodeExecution } from "./generation-node-execution";
import {
  GenerationNodeParameterControls,
  resolveGenerationNodeParameterDefaults,
  type GenerationRuntimeModel,
} from "./generation-node-parameter-controls";
import { NodeBananaFloatingNodeHeader } from "./node-banana-floating-node-header";

type GenerationRuntimeNode = Node<NodeBananaNodeData, "generationNode">;

function record(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function mediaTypeFromKind(kind: string): NodeExecutionMediaType {
  if (kind === "generate.audio") return "audio";
  if (kind === "generate.video") return "video";
  return "image";
}

function MediaIcon({ mediaType }: { mediaType: NodeExecutionMediaType }) {
  if (mediaType === "audio") return <AudioLines className="h-4 w-4" aria-hidden="true" />;
  if (mediaType === "video") return <Video className="h-4 w-4" aria-hidden="true" />;
  return <ImageIcon className="h-4 w-4" aria-hidden="true" />;
}

function modelsForMedia(
  mediaType: NodeExecutionMediaType,
  imageModels: readonly RuntimeImageModel[],
  videoModels: readonly RuntimeVideoModel[],
  audioModels: readonly RuntimeAudioModel[],
): readonly GenerationRuntimeModel[] {
  if (mediaType === "audio") return audioModels;
  if (mediaType === "video") return videoModels;
  return imageModels;
}

function defaultParameters(model: GenerationRuntimeModel, prompt: string) {
  const declared = contractAuthoringDefaults(model);
  if (declared) return declared;
  if (model.type === "image") {
    return authoringValuesToImageConfig(resolveImageAuthoringDefaults(model, prompt), model).parameters;
  }
  const defaults = model.type === "audio"
    ? resolveRuntimeAudioDefaults(model)
    : resolveRuntimeVideoDefaults(model);
  return { ...defaults, ...resolveGenerationNodeParameterDefaults(model) };
}

function GenerationHandle({
  id,
  type,
  position,
  top,
  label,
  selected,
  accent = false,
}: {
  id: string;
  type: "source" | "target";
  position: Position;
  top: string;
  label: string;
  selected: boolean;
  accent?: boolean;
}) {
  const input = type === "target";
  return (
    <>
      <Handle
        id={id}
        type={type}
        position={position}
        style={{ top }}
        className={cn(
          "!h-3 !w-3 !border-2 !border-background-dark",
          accent ? "!bg-primary" : "!bg-white/65",
        )}
        aria-label={label}
      />
      <span
        className={cn(
          "pointer-events-none absolute -translate-y-1/2 whitespace-nowrap text-[10px] font-medium transition-opacity",
          input ? "right-[calc(100%+8px)] text-right" : "left-[calc(100%+8px)]",
          accent ? "text-primary" : "text-neutral-400",
          selected ? "opacity-100" : "opacity-0 group-hover:opacity-100 group-focus-within:opacity-100",
        )}
        style={{ top }}
      >
        {label}
      </span>
    </>
  );
}

export const GenerationNode = memo(function GenerationNode({ id, data, selected }: NodeProps<GenerationRuntimeNode>) {
  const tc = useCanvasTranslation();
  const t = useTranslations("nodeStudio");
  const authoring = useNodeAuthoring();
  const [expanded, setExpanded] = useState(false);
  const config = record(data.config);
  const mediaType = mediaTypeFromKind(data.canonicalKind);
  const title = nodeBananaNodeInventory[data.canonicalKind as "generate.image" | "generate.audio" | "generate.video"].title;
  const geometry = nodeBananaNodeGeometry[data.canonicalKind as "generate.image" | "generate.audio" | "generate.video"];
  const prompt = typeof config.prompt === "string" ? config.prompt : "";
  const modelKey = typeof config.modelKey === "string" ? config.modelKey : null;
  const parameters = record(config.parameters);
  const models = modelsForMedia(
    mediaType,
    authoring.imageModels,
    authoring.videoModels ?? [],
    authoring.audioModels ?? [],
  );
  const activeModel = models.find((model) => model.key === modelKey);
  const defaultModelKey = models.find((model) => model.isDefault)?.key;
  const [promptDraftState, setPromptDraftState] = useState({ source: prompt, value: prompt });
  const promptDraft = promptDraftState.source === prompt ? promptDraftState.value : prompt;
  const composingRef = useRef(false);
  const articleRef = useRef<HTMLElement>(null);
  const writable = authoring.writable !== false && Boolean(authoring.updateCanonicalNodeConfig);
  const runReadiness = authoring.getNodeRunReadiness?.(id);
  const promptInput = authoring.getNodePromptInput?.(id) ?? { connected: false, text: null };
  const effectivePrompt = promptInput.connected ? (promptInput.text ?? "") : promptDraft;
  const showMediaInput = activeModel?.type === "image"
    ? resolveRuntimeImageMaxInputImages(activeModel) > 0
    : activeModel?.type === "video"
      ? resolveRuntimeVideoSupportsInitImage(activeModel)
      : false;

  const updateConfig = (nextConfig: Record<string, unknown>) => {
    authoring.updateCanonicalNodeConfig?.(id, nextConfig as CanonicalJsonValue);
  };

  const publishPrompt = (nextPrompt: string) => {
    updateConfig({ ...config, prompt: nextPrompt, parameters });
  };

  const selectModel = (nextModelKey: string) => {
    const model = models.find((candidate) => candidate.key === nextModelKey);
    if (!model || model.key === modelKey) return;
    updateConfig({
      ...config,
      prompt: promptDraft,
      modelKey: model.key,
      parameters: defaultParameters(model, promptDraft),
    });
  };

  const modelItems = models.map((model) => ({
    id: model.key,
    name: model.label,
    vendor: model.vendor,
  }));
  const selectionLabel = modelKey && !activeModel
    ? t("node.modelUnavailable", { model: modelKey })
    : modelKey
      ? undefined
      : t("node.chooseModel");
  const inputTop = showMediaInput ? "35%" : "50%";
  const promptTop = showMediaInput ? "65%" : "50%";

  return (
    <article
      ref={articleRef}
      className={cn(
        "group relative rounded-lg border border-neutral-700 bg-neutral-800 p-3 text-neutral-100 shadow-lg transition-[border-color,box-shadow] motion-reduce:transition-none",
        selected && "ring-2 ring-primary/40 shadow-primary/20",
        !data.supported && "border-amber-500/60",
      )}
      style={{ width: geometry.width, minHeight: geometry.height }}
      aria-label={title}
      aria-current={selected ? "true" : undefined}
      data-generation-node=""
      data-generation-media={mediaType}
    >
      <NodeResizer
        isVisible={selected}
        minWidth={geometry.minWidth}
        minHeight={geometry.minHeight}
        lineClassName="!border-primary/45"
        handleClassName="!h-2.5 !w-2.5 !border-primary !bg-neutral-900"
      />
      <NodeBananaFloatingNodeHeader
        nodeId={id}
        title={title}
        config={data.config}
        selected={selected}
        expandable
        expanded={expanded}
        onToggleExpanded={() => setExpanded((current) => !current)}
        runnable
        onRun={() => articleRef.current?.querySelector<HTMLButtonElement>("[data-node-run]")?.click()}
      />

      {showMediaInput ? (
        <GenerationHandle
          id="image"
          type="target"
          position={Position.Left}
          top={inputTop}
          label={tc("Image")}
          selected={selected}
          accent
        />
      ) : null}
      <GenerationHandle
        id={mediaType === "image" ? "text" : "prompt"}
        type="target"
        position={Position.Left}
        top={promptTop}
        label={tc("Prompt")}
        selected={selected}
      />
      <GenerationHandle
        id={mediaType}
        type="source"
        position={Position.Right}
        top="50%"
        label={mediaType.charAt(0).toUpperCase() + mediaType.slice(1)}
        selected={selected}
      />

      <div className="flex min-w-0 items-center gap-2 border-b border-neutral-700/70 pb-2" data-generation-section="header">
        <span className="grid h-7 w-7 shrink-0 place-items-center rounded bg-neutral-700 text-primary">
          <MediaIcon mediaType={mediaType} />
        </span>
        <h3 className="truncate text-xs font-medium">{title}</h3>
      </div>

      {!data.supported ? (
        <div className="mt-3 rounded border border-neutral-700 bg-neutral-900/45 px-3 py-2 text-[11px] leading-5 text-neutral-400">
          {t("runtime.unsupportedDescription", { reason: data.supportReason ?? "UNKNOWN" })}
        </div>
      ) : expanded ? (
        <div className="mt-3 grid gap-3" data-generation-section="authoring">
          <label className="grid gap-1 text-[10px] uppercase tracking-[0.12em] text-white/45" data-generation-section="prompt">
            {t("node.promptLabel")}
            <AppTextarea
              value={effectivePrompt}
              rows={3}
              maxLength={20_000}
              disabled={!writable || promptInput.connected}
              aria-label={promptInput.connected ? tc("Prompt from connected Prompt node") : undefined}
              className="nodrag nowheel min-h-24 resize-none rounded-lg border border-white/10 bg-black/25 px-3 py-2 text-xs normal-case leading-5 tracking-normal text-white outline-none focus:border-primary/70 disabled:cursor-not-allowed disabled:border-white/5 disabled:bg-black/40 disabled:text-white/45"
              placeholder={tc("Describe what to generate...")}
              onPointerDown={(event) => event.stopPropagation()}
              onCompositionStart={() => {
                composingRef.current = true;
              }}
              onCompositionEnd={(event) => {
                composingRef.current = false;
                publishPrompt(event.currentTarget.value);
              }}
              onChange={(event) => {
                const nextPrompt = event.target.value;
                setPromptDraftState({ source: prompt, value: nextPrompt });
                if (!composingRef.current) publishPrompt(nextPrompt);
              }}
            />
          </label>

          <div data-generation-section="model">
            {authoring.isLoading ? (
              <div className="flex h-12 items-center gap-2 rounded-xl border border-white/10 bg-black/16 px-3 text-sm text-white/45">
                <LoaderCircle className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
                {t("generationNode.modelLoading")}
              </div>
            ) : authoring.error ? (
              <div className="flex min-h-12 items-center gap-2 rounded-xl border border-red-400/20 bg-red-400/5 px-3 text-sm text-red-100" role="alert">
                <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span className="min-w-0 flex-1">{t("generationNode.modelError")}</span>
                <AppButton type="button" variant="ghost" size="sm" onClick={authoring.retry}>
                  <RotateCcw className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
                  {t("actions.retry")}
                </AppButton>
              </div>
            ) : models.length === 0 ? (
              <div className="flex h-12 items-center rounded-xl border border-amber-300/20 bg-amber-300/5 px-3 text-sm text-amber-100" role="status">
                {t("generationNode.modelEmpty")}
              </div>
            ) : (
              <GenerationModelSection
                modality={mediaType}
                title={t("generationNode.modelLabel")}
                items={modelItems}
                activeId={modelKey}
                defaultId={defaultModelKey}
                selectionLabel={selectionLabel}
                onSelect={selectModel}
                disabled={!writable}
                className="w-full"
              />
            )}
          </div>

          {activeModel ? (
            <div data-generation-section="parameters">
              <GenerationSettingsPopover
                label={t("generationNode.parametersLabel")}
                summary={t("generationNode.parametersLabel")}
                icon={<SlidersHorizontal className="h-4 w-4" aria-hidden="true" />}
                className="w-full justify-between"
              >
                <GenerationNodeParameterControls
                  model={activeModel}
                  values={parameters}
                  disabled={!writable}
                  onChange={(nextParameters) => updateConfig({ ...config, parameters: nextParameters })}
                />
              </GenerationSettingsPopover>
            </div>
          ) : null}

          <GenerationNodeExecution
            nodeId={id}
            mediaType={mediaType}
            prompt={effectivePrompt}
            modelKey={modelKey}
            selectedOutputAssetId={data.selectedOutputAssetId}
            expanded
            runReadiness={runReadiness}
          />
        </div>
      ) : (
        <>
          <p className="mt-3 line-clamp-2 min-h-10 text-[11px] leading-5 text-neutral-400" data-generation-section="summary">
            {effectivePrompt.trim() || t("node.promptEmpty")}
          </p>
          <GenerationNodeExecution
            nodeId={id}
            mediaType={mediaType}
            prompt={effectivePrompt}
            modelKey={modelKey}
            selectedOutputAssetId={data.selectedOutputAssetId}
            runReadiness={runReadiness}
          />
        </>
      )}
    </article>
  );
});
