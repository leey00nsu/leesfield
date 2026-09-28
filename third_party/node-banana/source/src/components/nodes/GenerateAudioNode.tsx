"use client";

import { useCanvasTranslation } from "../../leesfield/localization";
import { Handle } from "../../leesfield/port-handle";

import React, { useCallback, useState, useEffect, useMemo } from "react";
import { Position, NodeProps, Node, useReactFlow } from "@xyflow/react";
import { BaseNode } from "./BaseNode";
import { HandleLabel } from "./HandleLabel";
import { InlineParameterPanel } from "./InlineParameterPanel";
import { ModelParameters } from "./ModelParameters";
import { ModelSearchDialog } from "../modals/ModelSearchDialog";
import { ProviderBadge } from "./ProviderBadge";
import { SettingsTabBar } from "./SettingsTabBar";
import { downloadMedia } from "../../utils/downloadMedia";
import {
  GenerateAudioNodeData,
  HostedGenerationPrompt,
  ModelInputDef,
  ProviderModel,
  ProviderType,
  SelectedModel,
  browseRegistry,
  useAudioPlayback,
  useAudioVisualization,
  useGenerationCarousel,
  useInlineParameters,
  useLoadGenerationById,
  useShowHandleLabels,
  useWorkflowStore,
} from "../../leesfield/upstream-node-host";

type GenerateAudioNodeType = Node<GenerateAudioNodeData, "generateAudio">;

export function GenerateAudioNode({ id, data, selected }: NodeProps<GenerateAudioNodeType>) {
  const tc = useCanvasTranslation();
  const nodeData = data;
  const updateNodeData = useWorkflowStore((state) => state.updateNodeData);
  const [isBrowseDialogOpen, setIsBrowseDialogOpen] = useState(false);
  const [settingsTab, setSettingsTab] = useState<"primary" | "fallback">("primary");

  useEffect(() => {
    if (!nodeData.fallbackModel && settingsTab === "fallback") {
      setSettingsTab("primary");
    }
  }, [nodeData.fallbackModel, settingsTab]);

  // Inline parameters infrastructure
  const { inlineParametersEnabled } = useInlineParameters();
  const showLabels = useShowHandleLabels(selected);

  // Register browse callback for floating header button
  useEffect(() => {
    browseRegistry.register(id, () => setIsBrowseDialogOpen(true));
    return () => { browseRegistry.unregister(id); };
  }, [id]);

  // Get the current selected provider (default to fal)
  const currentProvider: ProviderType = nodeData.selectedModel?.provider || "fal";

  // Convert base64 data URL to Blob for visualization
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const { waveformData, isLoading: isLoadingWaveform } = useAudioVisualization(audioBlob);

  useEffect(() => {
    if (nodeData.outputAudio) {
      fetch(nodeData.outputAudio)
        .then((r) => r.blob())
        .then(setAudioBlob)
        .catch(() => setAudioBlob(null));
    } else {
      setAudioBlob(null);
    }
  }, [nodeData.outputAudio]);

  const {
    audioRef,
    canvasRef,
    waveformContainerRef,
    isPlaying,
    currentTime,
    handlePlayPause,
    handleSeek,
    formatTime,
  } = useAudioPlayback({
    audioSrc: nodeData.outputAudio ?? null,
    waveformData,
    isLoadingWaveform,
  });

  const handleClearAudio = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    setAudioBlob(null);
    updateNodeData(id, { outputAudio: null, selectedOutputAssetId: null, status: "idle", error: null, duration: null, format: null });
  }, [id, updateNodeData, audioRef]);

  const handleParametersChange = useCallback(
    (parameters: Record<string, unknown>) => {
      updateNodeData(id, { parameters });
    },
    [id, updateNodeData]
  );

  const handleInputsLoaded = useCallback(
    (inputs: ModelInputDef[]) => {
      updateNodeData(id, { inputSchema: inputs });
    },
    [id, updateNodeData]
  );

  const { setNodes } = useReactFlow();
  const handleParametersExpandChange = useCallback(
    (expanded: boolean, parameterCount: number) => {
      const parameterHeight = expanded ? Math.max(parameterCount * 28 + 16, 60) : 0;
      const baseHeight = 300;
      const newHeight = baseHeight + parameterHeight;

      setNodes((nodes) =>
        nodes.map((node) =>
          node.id === id
            ? { ...node, style: { ...node.style, height: newHeight } }
            : node
        )
      );
    },
    [id, setNodes]
  );

  const regenerateNode = useWorkflowStore((state) => state.regenerateNode);
  const isRunning = useWorkflowStore((state) => state.isRunning);

  const handleRegenerate = useCallback(() => {
    regenerateNode(id);
  }, [id, regenerateNode]);

  // Load audio by ID from generations folder
  const loadAudioById = useLoadGenerationById("audio", "Audio");

  // Carousel navigation handlers
  const {
    isLoading: isLoadingCarouselAudio,
    handlePrevious: handleCarouselPrevious,
    handleNext: handleCarouselNext,
  } = useGenerationCarousel({
    nodeId: id,
    history: nodeData.audioHistory,
    currentIndex: nodeData.selectedAudioHistoryIndex,
    loadFn: loadAudioById,
    buildUpdate: (audio, newIndex) => ({
      outputAudio: audio,
      selectedOutputAssetId: typeof nodeData.audioHistory?.[newIndex]?.id === "string"
        ? nodeData.audioHistory[newIndex].id
        : null,
      selectedAudioHistoryIndex: newIndex,
      status: "idle",
      error: null,
    }),
  });

  const handleBrowseModelSelect = useCallback((model: ProviderModel) => {
    const newSelectedModel: SelectedModel = {
      provider: model.provider,
      modelId: model.id,
      displayName: model.name,
    };
    updateNodeData(id, { selectedModel: newSelectedModel, parameters: {}, inputSchema: undefined });
    setIsBrowseDialogOpen(false);
  }, [id, updateNodeData]);

  const displayTitle = useMemo(() => {
    if (nodeData.selectedModel?.displayName && nodeData.selectedModel.modelId) {
      return nodeData.selectedModel.displayName;
    }
    return "Generate Audio";
  }, [nodeData.selectedModel?.displayName, nodeData.selectedModel?.modelId]);

  // Inline parameters: compute collapse state and toggle handler
  const isParamsExpanded = nodeData.parametersExpanded ?? false;

  const handleToggleParams = useCallback(() => {
    updateNodeData(id, { parametersExpanded: !isParamsExpanded });
  }, [id, isParamsExpanded, updateNodeData]);

  // Dynamic handles based on inputSchema
  const dynamicHandles = useMemo(() => (
    <>
      <Handle
        type="target"
        position={Position.Left}
        id="text"
        data-handletype="text"
        style={{ top: "50%" }}
        title={tc("Prompt")}
      />
      <HandleLabel label={tc("Prompt")} side="target" color="var(--handle-color-text)" top="calc(50% - 18px)" visible={showLabels} />
    </>
  ), [showLabels]);

  return (
    <>
      <BaseNode
        id={id}
        selected={selected}
        settingsExpanded={inlineParametersEnabled && isParamsExpanded}
        isExecuting={isRunning}
        hasError={nodeData.status === "error"}
        minWidth={300}
        minHeight={250}
        settingsPanel={inlineParametersEnabled ? (
          <InlineParameterPanel
            expanded={isParamsExpanded}
            onToggle={handleToggleParams}
            nodeId={id}
          >
            {/* Tab bar for primary/fallback settings */}
            {nodeData.fallbackModel && (
              <SettingsTabBar
                activeTab={settingsTab}
                onTabChange={setSettingsTab}
                primaryLabel={nodeData.selectedModel?.displayName || "Primary"}
                fallbackLabel={nodeData.fallbackModel.displayName}
              />
            )}

            {/* Primary tab content */}
            {settingsTab === "primary" && (
              <>
                {/* Model selector: Browse button + current model display */}
                <div className="flex items-center justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="text-[11px] text-neutral-200 truncate">
                      {displayTitle}
                    </div>
                    <div className="text-[9px] text-neutral-500">
                      {currentProvider}
                    </div>
                  </div>
                  <button
                    onClick={() => setIsBrowseDialogOpen(true)}
                    className="nodrag nopan shrink-0 px-2 py-1 text-[10px] bg-neutral-700 hover:bg-neutral-600 border border-neutral-600 rounded text-neutral-300 transition-colors"
                  >{tc("Browse")}</button>
                </div>

                {/* External provider parameters */}
                {nodeData.selectedModel?.modelId && (
                  <ModelParameters
                    modelId={nodeData.selectedModel.modelId}
                    provider={currentProvider}
                    parameters={nodeData.parameters || {}}
                    onParametersChange={handleParametersChange}
                    onInputsLoaded={handleInputsLoaded}
                  />
                )}
              </>
            )}

            {/* Fallback tab content */}
            {settingsTab === "fallback" && nodeData.fallbackModel && (
              <ModelParameters
                modelId={nodeData.fallbackModel.modelId}
                provider={nodeData.fallbackModel.provider}
                parameters={nodeData.fallbackParameters || {}}
                onParametersChange={(p) => updateNodeData(id, { fallbackParameters: p })}
              />
            )}
          </InlineParameterPanel>
        ) : undefined}
      >
        {/* Model parameters (hidden when inline enabled - shown in panel below) */}
        {!inlineParametersEnabled && nodeData.selectedModel?.modelId && (
          <ModelParameters
            provider={currentProvider}
            modelId={nodeData.selectedModel.modelId}
            parameters={nodeData.parameters || {}}
            onParametersChange={handleParametersChange}
            onInputsLoaded={handleInputsLoaded}
            onExpandChange={handleParametersExpandChange}
          />
        )}

        <HostedGenerationPrompt
          nodeId={id}
          value={nodeData.internalPrompt}
          connectedValue={nodeData.prompt}
          connected={nodeData.promptConnected === true}
        />

        {/* Output audio player */}
        {nodeData.outputAudio && (
          <div className="relative group mt-2">
            {nodeData.__usedFallback && (
              <div
                className="absolute top-1 left-1 px-1.5 py-0.5 rounded bg-emerald-900/70 text-emerald-300 text-[9px] font-medium pointer-events-auto z-10"
                title={`Primary failed: ${nodeData.__primaryError ?? "unknown"}\nUsed fallback: ${nodeData.__fallbackModelUsed ?? ""}`}
              >{tc("Fallback used")}</div>
            )}
            {/* Waveform visualization */}
            {isLoadingWaveform ? (
              <div className="flex items-center justify-center bg-neutral-900/50 rounded h-16">
                <span className="text-xs text-neutral-500">{tc("Loading waveform...")}</span>
              </div>
            ) : waveformData ? (
              <div
                ref={waveformContainerRef}
                className="h-16 bg-neutral-900/50 rounded cursor-pointer relative"
                onClick={handleSeek}
              >
                <canvas ref={canvasRef} className="w-full h-full" />
              </div>
            ) : (
              <div className="flex items-center justify-center bg-neutral-900/50 rounded h-16">
                <span className="text-xs text-neutral-500">{tc("Processing...")}</span>
              </div>
            )}

            {/* Controls */}
            <div className="flex items-center gap-2 mt-2">
              <button
                onClick={handlePlayPause}
                className="w-7 h-7 flex items-center justify-center bg-violet-600 hover:bg-violet-500 rounded transition-colors shrink-0"
                title={isPlaying ? tc("Pause") : tc("Play")}
              >
                {isPlaying ? (
                  <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" />
                  </svg>
                ) : (
                  <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M8 5v14l11-7z" />
                  </svg>
                )}
              </button>

              {/* Progress bar */}
              <div className="flex-1 h-1 bg-neutral-700 rounded-full overflow-hidden relative">
                {!!audioRef.current?.duration && isFinite(audioRef.current.duration) && (
                  <div
                    className="h-full bg-violet-500 transition-all"
                    style={{ width: `${(currentTime / audioRef.current.duration) * 100}%` }}
                  />
                )}
              </div>

              {/* Time */}
              <span className="text-[10px] text-neutral-500 min-w-[32px] text-right">
                {formatTime(currentTime)}
              </span>

              {/* Carousel navigation */}
              {(nodeData.audioHistory?.length || 0) > 1 && (
                <>
                  <button
                    onClick={handleCarouselPrevious}
                    className="w-5 h-5 flex items-center justify-center bg-neutral-700 hover:bg-neutral-600 rounded transition-colors shrink-0"
                    disabled={isLoadingCarouselAudio}
                    title={tc("Previous")}
                  >
                    <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z" />
                    </svg>
                  </button>
                  <span className="text-[10px] text-neutral-500">
                    {(nodeData.selectedAudioHistoryIndex || 0) + 1}/{nodeData.audioHistory?.length}
                  </span>
                  <button
                    onClick={handleCarouselNext}
                    className="w-5 h-5 flex items-center justify-center bg-neutral-700 hover:bg-neutral-600 rounded transition-colors shrink-0"
                    disabled={isLoadingCarouselAudio}
                    title={tc("Next")}
                  >
                    <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z" />
                    </svg>
                  </button>
                </>
              )}
            </div>

            {/* Download button */}
            <button
              onClick={() => downloadMedia(nodeData.outputAudio!, "audio").catch(() => {})}
              className="absolute top-1 right-7 w-5 h-5 bg-black/60 hover:bg-black/80 text-white rounded text-xs opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
              title={tc("Download audio")}
            >
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
            </button>
            {/* Clear button */}
            <button
              onClick={handleClearAudio}
              className="absolute top-1 right-1 w-5 h-5 bg-black/60 text-white rounded text-xs opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
              title={tc("Clear audio")}
            >
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        )}

        {/* Status indicators */}
        {nodeData.status === "loading" && (
          <div className="flex items-center gap-2 mt-2">
            <div className="animate-spin w-3 h-3 border-2 border-violet-500 border-t-transparent rounded-full" />
            <span className="text-xs text-neutral-400">{tc("Generating audio...")}</span>
          </div>
        )}

        {nodeData.status === "error" && nodeData.error && (
          <div className="mt-2 p-2 bg-red-500/10 border border-red-500/30 rounded text-xs text-red-400">
            {nodeData.error}
          </div>
        )}

        {/* Dynamic handles from schema */}
        {dynamicHandles}

        {/* Output audio handle */}
        <Handle
          type="source"
          position={Position.Right}
          id="audio"
          data-handletype="audio"
          style={{ background: "rgb(167, 139, 250)" }}
        />
        <HandleLabel label={tc("Audio")} side="source" color="var(--handle-color-audio)" visible={showLabels} />

      </BaseNode>

      {/* Browse dialog */}
      {isBrowseDialogOpen && (
        <ModelSearchDialog
          isOpen={isBrowseDialogOpen}
          onClose={() => setIsBrowseDialogOpen(false)}
          onModelSelected={handleBrowseModelSelect}
          initialProvider={currentProvider}
          initialCapabilityFilter="audio"
        />
      )}
    </>
  );
}
