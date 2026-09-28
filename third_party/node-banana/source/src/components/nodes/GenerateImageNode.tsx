"use client";
import { CanvasSelect, CanvasInput } from "../../leesfield/inputs";


import { useCanvasTranslation } from "../../leesfield/localization";
import { Handle } from "../../leesfield/port-handle";

import React, { useCallback, useState, useEffect, useMemo, useRef } from "react";
import { Position, NodeProps, Node, useReactFlow, useUpdateNodeInternals } from "@xyflow/react";
import { BaseNode } from "./BaseNode";
import { ModelParameters } from "./ModelParameters";
import { ModelSearchDialog } from "../modals/ModelSearchDialog";
import { ProviderBadge } from "./ProviderBadge";
import { InlineParameterPanel } from "./InlineParameterPanel";
import { SettingsTabBar } from "./SettingsTabBar";
import { HandleLabel } from "./HandleLabel";
import { getImageDimensions } from "../../utils/nodeDimensions";
import { downloadMedia } from "../../utils/downloadMedia";
import {
  AspectRatio,
  GEMINI_IMAGE_MODELS,
  HostedGenerationPrompt,
  ModelCapability,
  ModelInputDef,
  MODEL_DISPLAY_NAMES,
  ModelType,
  NanoBananaNodeData,
  ProviderModel,
  ProviderType,
  Resolution,
  SelectedModel,
  browseRegistry,
  deduplicatedFetch,
  saveNanoBananaDefaults,
  useAdaptiveImageSrc,
  useAutoResizeOnMedia,
  useErrorToast,
  useGenerationCarousel,
  useInlineParameters,
  useLoadGenerationById,
  useProviderApiKeys,
  useShowHandleLabels,
  useWorkflowStore,
} from "../../leesfield/upstream-node-host";

/** Reorder items so they read column-first in a row-based CSS grid.
 *  e.g. [1,2,3,4,5,6,7,8] with 2 cols → [1,5,2,6,3,7,4,8] */
function reorderColumnFirst<T>(items: T[], cols: number): T[] {
  const rows = Math.ceil(items.length / cols);
  const result: T[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const idx = c * rows + r;
      if (idx < items.length) result.push(items[idx]);
    }
  }
  return result;
}

// Base 10 aspect ratios (all Gemini image models)
const BASE_ASPECT_RATIOS: AspectRatio[] = ["1:1", "2:3", "3:2", "3:4", "4:3", "4:5", "5:4", "9:16", "16:9", "21:9"];

// Extended 14 aspect ratios (Nano Banana 2 adds extreme ratios)
const EXTENDED_ASPECT_RATIOS: AspectRatio[] = ["1:1", "1:4", "1:8", "2:3", "3:2", "3:4", "4:1", "4:3", "4:5", "5:4", "8:1", "9:16", "16:9", "21:9"];

// Resolutions per model (nano-banana-pro: 1K-4K, nano-banana-2: 512-4K)
const RESOLUTIONS_PRO: Resolution[] = ["1K", "2K", "4K"];
const RESOLUTIONS_NB2: Resolution[] = ["512", "1K", "2K", "4K"];

// Image generation capabilities
const IMAGE_CAPABILITIES: ModelCapability[] = ["text-to-image", "image-to-image"];

function geminiImageModelId(value: unknown): ModelType {
  const candidate = typeof value === "string" ? value : "";
  return GEMINI_IMAGE_MODELS.some((model) => model.value === candidate)
    ? candidate
    : "nano-banana-pro";
}

type NanoBananaNodeType = Node<NanoBananaNodeData, "nanoBanana">;

export function GenerateImageNode({ id, data, selected }: NodeProps<NanoBananaNodeType>) {
  const tc = useCanvasTranslation();
  const nodeData = data;
  const providerInputSignature=JSON.stringify(nodeData.providerInputSchema);
  const updateNodeInternals = useUpdateNodeInternals();
  useEffect(() => {
    // The model catalog arrives after the first handle measurement.
    // Refresh geometry when the image port appears or disappears.
    updateNodeInternals(id);
  }, [id, nodeData.supportsImageInput, providerInputSignature, updateNodeInternals]);
  const adaptiveOutputImage = useAdaptiveImageSrc(data.outputImage, id);
  const updateNodeData = useWorkflowStore((state) => state.updateNodeData);
  // Use stable selector for API keys to prevent unnecessary re-fetches
  const { replicateApiKey, falApiKey, kieApiKey, openaiApiKey, replicateEnabled, kieEnabled, openaiEnabled } = useProviderApiKeys();
  const [externalModels, setExternalModels] = useState<ProviderModel[]>([]);
  const [isLoadingModels, setIsLoadingModels] = useState(false);
  const [modelsFetchError, setModelsFetchError] = useState<string | null>(null);
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

  // Get the current selected provider (default to gemini)
  const currentProvider: ProviderType = nodeData.selectedModel?.provider || "gemini";

  // Get enabled providers
  const enabledProviders = useMemo(() => {
    const providers: { id: ProviderType; name: string }[] = [];
    // Gemini is always available
    providers.push({ id: "gemini", name: "Gemini" });
    // fal.ai is always available (works without key but rate limited)
    providers.push({ id: "fal", name: "fal.ai" });
    // Add Replicate if configured
    if (replicateEnabled && replicateApiKey) {
      providers.push({ id: "replicate", name: "Replicate" });
    }
    // Add Kie.ai if configured
    if (kieEnabled && kieApiKey) {
      providers.push({ id: "kie", name: "Kie.ai" });
    }
    // Add OpenAI if configured
    if (openaiEnabled && openaiApiKey) {
      providers.push({ id: "openai", name: "OpenAI" });
    }
    return providers;
  }, [replicateEnabled, replicateApiKey, kieEnabled, kieApiKey, openaiEnabled, openaiApiKey]);

  // Migrate legacy data: derive selectedModel from model field if missing
  useEffect(() => {
    if (nodeData.model && !nodeData.selectedModel) {
      const displayName = MODEL_DISPLAY_NAMES[nodeData.model] || nodeData.model;
      const newSelectedModel: SelectedModel = {
        provider: "gemini",
        modelId: nodeData.model,
        displayName,
      };
      updateNodeData(id, { selectedModel: newSelectedModel });
    }
  }, [id, nodeData.model, nodeData.selectedModel, updateNodeData]);

  // Fetch models from external providers when provider changes
  const fetchModels = useCallback(async () => {
    if (currentProvider === "gemini") {
      setExternalModels([]);
      setModelsFetchError(null);
      return;
    }

    setIsLoadingModels(true);
    setModelsFetchError(null);
    try {
      const capabilities = IMAGE_CAPABILITIES.join(",");
      const headers: HeadersInit = {};
      if (replicateApiKey) {
        headers["X-Replicate-Key"] = replicateApiKey;
      }
      if (falApiKey) {
        headers["X-Fal-Key"] = falApiKey;
      }
      if (kieApiKey) {
        headers["X-Kie-Key"] = kieApiKey;
      }
      if (openaiApiKey) {
        headers["X-OpenAI-API-Key"] = openaiApiKey;
      }
      const response = await deduplicatedFetch(`/api/models?provider=${currentProvider}&capabilities=${capabilities}`, { headers });
      if (response.ok) {
        const data = await response.json();
        setExternalModels(data.models || []);
        setModelsFetchError(null);
      } else {
        const errorData = await response.json().catch(() => ({}));
        const errorMsg = errorData.error || `Failed to load models (${response.status})`;
        setExternalModels([]);
        setModelsFetchError(
          currentProvider === "replicate" && response.status === 401
            ? "Invalid Replicate API key. Check your settings."
            : errorMsg
        );
      }
    } catch (error) {
      console.error("Failed to fetch models:", error);
      setExternalModels([]);
      setModelsFetchError("Failed to load models. Check your connection.");
    } finally {
      setIsLoadingModels(false);
    }
  }, [currentProvider, replicateApiKey, falApiKey, kieApiKey, openaiApiKey]);

  useEffect(() => {
    fetchModels();
  }, [fetchModels]);

  // Inline parameters: compute collapse state and toggle handler
  const isParamsExpanded = nodeData.parametersExpanded ?? false;

  const handleToggleParams = useCallback(() => {
    updateNodeData(id, { parametersExpanded: !isParamsExpanded });
  }, [id, isParamsExpanded, updateNodeData]);

  // Handle provider change
  const handleProviderChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      const provider = e.target.value as ProviderType;

      if (provider === "gemini") {
        // External model IDs also live in the legacy `model` field. Only carry
        // forward a model that is actually part of Gemini's image catalog.
        const modelId = currentProvider === "gemini"
          ? geminiImageModelId(nodeData.selectedModel?.modelId || nodeData.model)
          : geminiImageModelId(undefined);
        const newSelectedModel: SelectedModel = {
          provider: "gemini",
          modelId,
          displayName: GEMINI_IMAGE_MODELS.find((model) => model.value === modelId)?.label || "Nano Banana Pro",
        };
        // Clear parameters when switching providers (different providers have different schemas)
        updateNodeData(id, { model: modelId, selectedModel: newSelectedModel, parameters: {}, inputSchema: undefined });
      } else {
        // Set placeholder for external provider
        const newSelectedModel: SelectedModel = {
          provider,
          modelId: "",
          displayName: "Select model...",
        };
        // Clear parameters when switching providers
        updateNodeData(id, { model: "", selectedModel: newSelectedModel, parameters: {}, inputSchema: undefined });
      }
    },
    [currentProvider, id, nodeData.model, nodeData.selectedModel?.modelId, updateNodeData]
  );

  // Handle model change for external providers
  const handleExternalModelChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      const modelId = e.target.value;
      const model = externalModels.find(m => m.id === modelId);
      if (model) {
        const newSelectedModel: SelectedModel = {
          provider: currentProvider,
          modelId: model.id,
          displayName: model.name,
          capabilities: model.capabilities,
        };
        // Clear parameters when changing models (different models have different schemas)
        updateNodeData(id, { model: model.id, selectedModel: newSelectedModel, parameters: {}, inputSchema: undefined });
      }
    },
    [id, currentProvider, externalModels, updateNodeData]
  );

  const handleAspectRatioChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      const aspectRatio = e.target.value as AspectRatio;
      updateNodeData(id, { aspectRatio });
      saveNanoBananaDefaults({ aspectRatio });
    },
    [id, updateNodeData]
  );

  const handleResolutionChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      const resolution = e.target.value as Resolution;
      updateNodeData(id, { resolution });
      saveNanoBananaDefaults({ resolution });
    },
    [id, updateNodeData]
  );

  const handleModelChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      const model = e.target.value as ModelType;
      saveNanoBananaDefaults({ model });

      // Also update selectedModel for consistency
      const newSelectedModel: SelectedModel = {
        provider: "gemini",
        modelId: model,
        displayName: GEMINI_IMAGE_MODELS.find(m => m.value === model)?.label || model,
      };
      // Replace the model-specific snapshot and schema in one host patch. A
      // pair of shallow updates lets the previous model's parameters survive
      // between renders and be persisted again by the canonical bridge.
      updateNodeData(id, { model, selectedModel: newSelectedModel, parameters: {}, inputSchema: undefined });
    },
    [id, updateNodeData]
  );

  const handleGoogleSearchToggle = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const useGoogleSearch = e.target.checked;
      updateNodeData(id, { useGoogleSearch });
      saveNanoBananaDefaults({ useGoogleSearch });
    },
    [id, updateNodeData]
  );

  const handleImageSearchToggle = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const useImageSearch = e.target.checked;
      updateNodeData(id, { useImageSearch });
      saveNanoBananaDefaults({ useImageSearch });
    },
    [id, updateNodeData]
  );

  const handleParametersChange = useCallback(
    (parameters: Record<string, unknown>) => {
      updateNodeData(id, { parameters });
    },
    [id, updateNodeData]
  );

  // Handle inputs loaded from schema
  const handleInputsLoaded = useCallback(
    (inputs: ModelInputDef[]) => {
      updateNodeData(id, { inputSchema: inputs });
    },
    [id, updateNodeData]
  );

  // Handle parameters expand/collapse - resize node height
  const { setNodes } = useReactFlow();
  const handleParametersExpandChange = useCallback(
    (expanded: boolean, parameterCount: number) => {
      // Each parameter row is ~24px, plus some padding
      const parameterHeight = expanded ? Math.max(parameterCount * 28 + 16, 60) : 0;
      const baseHeight = 300; // Default node height
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

  const handleClearImage = useCallback(() => {
    updateNodeData(id, { outputImage: null, selectedOutputAssetId: null, status: "idle", error: null });
  }, [id, updateNodeData]);

  const regenerateNode = useWorkflowStore((state) => state.regenerateNode);
  const isRunning = useWorkflowStore((state) => state.isRunning);

  const handleRegenerate = useCallback(() => {
    regenerateNode(id);
  }, [id, regenerateNode]);

  const loadImageById = useLoadGenerationById("image", "Image");

  const {
    isLoading: isLoadingCarouselImage,
    handlePrevious: handleCarouselPrevious,
    handleNext: handleCarouselNext,
  } = useGenerationCarousel({
    nodeId: id,
    history: nodeData.imageHistory,
    currentIndex: nodeData.selectedHistoryIndex,
    loadFn: loadImageById,
    buildUpdate: (image, newIndex) => ({
      outputImage: image,
      selectedOutputAssetId: typeof nodeData.imageHistory?.[newIndex]?.id === "string"
        ? nodeData.imageHistory[newIndex].id
        : null,
      selectedHistoryIndex: newIndex,
      status: "idle",
      error: null,
    }),
  });

  // Handle model selection from browse dialog
  const handleBrowseModelSelect = useCallback((model: ProviderModel) => {
    // The browser can switch providers in one interaction. Keep Gemini image
    // selections inside its known model catalog instead of carrying an
    // external provider ID into the Gemini controls.
    const modelId = model.provider === "gemini" ? geminiImageModelId(model.id) : model.id;
    const newSelectedModel: SelectedModel = {
      provider: model.provider,
      modelId,
      displayName: model.provider === "gemini"
        ? GEMINI_IMAGE_MODELS.find((entry) => entry.value === modelId)?.label || "Nano Banana Pro"
        : model.name,
      capabilities: model.capabilities,
    };
    updateNodeData(id, { model: modelId, selectedModel: newSelectedModel, parameters: {}, inputSchema: undefined });
    setIsBrowseDialogOpen(false);
  }, [id, updateNodeData]);

  const isGeminiProvider = currentProvider === "gemini";

  // Dynamic title based on selected model - just the model name
  const displayTitle = useMemo(() => {
    if (nodeData.selectedModel?.displayName && nodeData.selectedModel.modelId) {
      return nodeData.selectedModel.displayName;
    }
    // Fallback for legacy data or no model selected
    if (nodeData.model) {
      return GEMINI_IMAGE_MODELS.find(m => m.value === nodeData.model)?.label || nodeData.model;
    }
    return "Select model...";
  }, [nodeData.selectedModel?.displayName, nodeData.selectedModel?.modelId, nodeData.model]);

  // Provider badge as title prefix
  const titlePrefix = useMemo(() => (
    <ProviderBadge provider={currentProvider} />
  ), [currentProvider]);

  // Use selectedModel.modelId for Gemini models, fallback to legacy model field
  const currentModelId = isGeminiProvider ? (nodeData.selectedModel?.modelId || nodeData.model) : null;
  const supportsResolution = currentModelId === "nano-banana-pro" || currentModelId === "nano-banana-2";
  const aspectRatios = currentModelId === "nano-banana-2" ? EXTENDED_ASPECT_RATIOS : BASE_ASPECT_RATIOS;
  const resolutions = currentModelId === "nano-banana-2" ? RESOLUTIONS_NB2 : RESOLUTIONS_PRO;
  const hasCarouselImages = (nodeData.imageHistory || []).length > 1;

  // Count visible Gemini controls to match ModelParameters grid/max-width rules
  const geminiControlCount = 2 // Model + Aspect Ratio (always)
    + (supportsResolution ? 1 : 0)
    + (currentModelId === "nano-banana-pro" || currentModelId === "nano-banana-2" ? 1 : 0)
    + (currentModelId === "nano-banana-2" ? 1 : 0);
  const useGeminiGrid = geminiControlCount > 4;
  const geminiGridRef = useRef<HTMLDivElement>(null);
  const [geminiColCount, setGeminiColCount] = useState(1);

  useEffect(() => {
    const el = geminiGridRef.current;
    if (!el || !useGeminiGrid) { setGeminiColCount(1); return; }
    let rafId: number;
    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        const cols = getComputedStyle(el).gridTemplateColumns.split(" ").length;
        setGeminiColCount(prev => prev === cols ? prev : cols);
      });
    });
    observer.observe(el);
    return () => {
      cancelAnimationFrame(rafId);
      observer.disconnect();
    };
  }, [useGeminiGrid]);

  // Show toast when generation fails
  useErrorToast(nodeData.status, nodeData.error, "Generation failed");

  // Auto-resize node when output image changes
  useAutoResizeOnMedia(id, nodeData.outputImage, getImageDimensions);

  return (
    <>
    <BaseNode
      id={id}
      selected={selected}
      isExecuting={isRunning}
      hasError={nodeData.status === "error"}
      fullBleed
      contentClassName="flex flex-col flex-1 min-h-0 relative"
      settingsExpanded={inlineParametersEnabled && isParamsExpanded}
      aspectFitMedia={nodeData.outputImage}
      dataTutorial="generate-image-node"
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
              {/* Gemini-specific controls */}
              {isGeminiProvider && currentModelId && (() => {
                const controls: React.ReactNode[] = [
                  <div key="model" className="flex items-center gap-2">
                    <label className="text-[11px] text-neutral-400 shrink-0">{tc("Model")}</label>
                    <CanvasSelect
                      value={currentModelId}
                      onChange={handleModelChange}
                      data-tutorial="generate-model-selector"
                      className="nodrag nopan flex-1 min-w-0 text-[11px] py-1 px-2 bg-[#1a1a1a] rounded-md focus:outline-none focus:ring-1 focus:ring-neutral-600 text-white"
                    >
                      {GEMINI_IMAGE_MODELS.map((m) => (
                        <option key={m.value} value={m.value}>
                          {m.label}
                        </option>
                      ))}
                    </CanvasSelect>
                  </div>,
                  <div key="aspect-ratio" className="flex items-center gap-2">
                    <label className="text-[11px] text-neutral-400 shrink-0">{tc("Aspect Ratio")}</label>
                    <CanvasSelect
                      value={nodeData.aspectRatio || "1:1"}
                      onChange={handleAspectRatioChange}
                      className="nodrag nopan flex-1 min-w-0 text-[11px] py-1 px-2 bg-[#1a1a1a] rounded-md focus:outline-none focus:ring-1 focus:ring-neutral-600 text-white"
                    >
                      {aspectRatios.map((ratio) => (
                        <option key={ratio} value={ratio}>
                          {ratio}
                        </option>
                      ))}
                    </CanvasSelect>
                  </div>,
                ];

                if (supportsResolution) {
                  controls.push(
                    <div key="resolution" className="flex items-center gap-2">
                      <label className="text-[11px] text-neutral-400 shrink-0">{tc("Resolution")}</label>
                      <CanvasSelect
                        value={nodeData.resolution || "2K"}
                        onChange={handleResolutionChange}
                        className="nodrag nopan flex-1 min-w-0 text-[11px] py-1 px-2 bg-[#1a1a1a] rounded-md focus:outline-none focus:ring-1 focus:ring-neutral-600 text-white"
                      >
                        {resolutions.map((res) => (
                          <option key={res} value={res}>
                            {res}
                          </option>
                        ))}
                      </CanvasSelect>
                    </div>
                  );
                }

                if (currentModelId === "nano-banana-pro" || currentModelId === "nano-banana-2") {
                  controls.push(
                    <label key="google-search" className="flex items-center gap-1.5 text-[11px] text-neutral-300 cursor-pointer">
                      <CanvasInput
                        type="checkbox"
                        checked={nodeData.useGoogleSearch || false}
                        onChange={handleGoogleSearchToggle}
                        className="nodrag nopan w-3 h-3 rounded bg-[#1a1a1a] text-neutral-600 focus:ring-1 focus:ring-neutral-600 focus:ring-offset-0"
                      />{tc("Google Search")}</label>
                  );
                }

                if (currentModelId === "nano-banana-2") {
                  controls.push(
                    <label key="image-search" className="flex items-center gap-1.5 text-[11px] text-neutral-300 cursor-pointer">
                      <CanvasInput
                        type="checkbox"
                        checked={nodeData.useImageSearch || false}
                        onChange={handleImageSearchToggle}
                        className="nodrag nopan w-3 h-3 rounded bg-[#1a1a1a] text-neutral-600 focus:ring-1 focus:ring-neutral-600 focus:ring-offset-0"
                      />{tc("Image Search")}</label>
                  );
                }

                const display = useGeminiGrid && geminiColCount > 1
                  ? reorderColumnFirst(controls, geminiColCount)
                  : controls;

                return (
                  <div
                    ref={geminiGridRef}
                    className={useGeminiGrid
                      ? "grid grid-cols-[repeat(auto-fill,minmax(min(180px,100%),1fr))] max-w-[420px] gap-x-6 gap-y-1.5"
                      : "space-y-1.5 max-w-[280px]"
                    }
                  >
                    {display}
                  </div>
                );
              })()}

              {/* External provider parameters - reuse ModelParameters component */}
              {!isGeminiProvider && nodeData.selectedModel?.modelId && (
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
      {(nodeData as unknown as {providerInputSchema?:ModelInputDef[]}).providerInputSchema?.map((input,index,all)=>(
        <React.Fragment key={input.name}>
          <Handle type="target" position={Position.Left} id={input.name} data-handletype={input.type} style={{top: `${15+index*45/Math.max(1,all.length)}%`,zIndex:10}} isConnectable={true}/>
          <HandleLabel label={input.label} side="target" color={`var(--handle-color-${input.type})`} top={`calc(${15+index*45/Math.max(1,all.length)}% - 18px)`} visible={showLabels}/>
        </React.Fragment>
      ))}
      {nodeData.supportsImageInput && !(nodeData as unknown as {providerInputSchema?:ModelInputDef[]}).providerInputSchema && (
        <><Handle type="target" position={Position.Left} id="image" style={{top:"35%",zIndex:10}} data-handletype="image" isConnectable={true}/><HandleLabel label={tc("Image")} side="target" color="var(--handle-color-image)" top="calc(35% - 18px)" visible={showLabels}/></>
      )}
      <Handle
        type="target"
        position={Position.Left}
        id="text"
        style={{ top: "65%", zIndex: 10 }}
        data-handletype="text"
        data-tutorial="generate-text-input-handle"
        isConnectable={true}
      />
      {/* Prompt label */}
      <HandleLabel label={tc("Prompt")} side="target" color="var(--handle-color-text)" top="calc(65% - 18px)" visible={showLabels} />
      {/* Output handle */}
      <Handle
        type="source"
        position={Position.Right}
        id="image"
        style={{ top: "50%", zIndex: 10 }}
        data-handletype="image"
      />
      {/* Output label */}
      <HandleLabel label={tc("Image")} side="source" color="var(--handle-color-image)" visible={showLabels} />

      <HostedGenerationPrompt
        nodeId={id}
        value={nodeData.internalPrompt}
        connectedValue={nodeData.prompt}
        connected={nodeData.promptConnected === true}
      />

      <div
        className="relative w-full flex-1 min-h-0 overflow-hidden rounded-lg"
        data-tutorial="generate-output-area"
      >
        {/* Preview area */}
        {nodeData.outputImage ? (
          <>
            <img
              src={adaptiveOutputImage ?? undefined}
              alt={tc("Generated")}
              className="w-full h-full object-cover"
            />
            {nodeData.__usedFallback && (
              <div
                className="absolute top-1 left-1 px-1.5 py-0.5 rounded bg-emerald-900/70 text-emerald-300 text-[9px] font-medium pointer-events-auto z-10"
                title={`Primary failed: ${nodeData.__primaryError ?? "unknown"}\nUsed fallback: ${nodeData.__fallbackModelUsed ?? ""}`}
              >{tc("Fallback used")}</div>
            )}
            {/* Loading overlay for generation */}
            {nodeData.status === "loading" && (
              <div className="absolute inset-0 bg-neutral-900/70 flex items-center justify-center">
                <svg
                  className="w-6 h-6 animate-spin text-white"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="3"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  />
                </svg>
              </div>
            )}
            {/* Error overlay when generation failed */}
            {nodeData.status === "error" && (
              <div className="absolute inset-0 bg-red-900/40 flex flex-col items-center justify-center gap-1">
                <svg
                  className="w-6 h-6 text-white"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span className="text-white text-xs font-medium">{tc("Generation failed")}</span>
                <span className="text-white/70 text-[10px]">{tc("See toast for details")}</span>
              </div>
            )}
            {/* Loading overlay for carousel navigation */}
            {isLoadingCarouselImage && (
              <div className="absolute inset-0 bg-neutral-900/50 flex items-center justify-center">
                <svg
                  className="w-4 h-4 animate-spin text-white"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="3"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  />
                </svg>
              </div>
            )}
            {/* Download + Clear buttons */}
            <div className="absolute top-1 right-1 flex items-center gap-0.5">
              <button
                onClick={() => downloadMedia(nodeData.outputImage!, "image").catch(() => {})}
                className="w-5 h-5 bg-neutral-900/80 hover:bg-neutral-700 rounded flex items-center justify-center text-neutral-400 hover:text-white transition-colors"
                title={tc("Download image")}
              >
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
              </button>
              <button
                onClick={handleClearImage}
                className="w-5 h-5 bg-neutral-900/80 hover:bg-red-600/80 rounded flex items-center justify-center text-neutral-400 hover:text-white transition-colors"
                title={tc("Clear image")}
              >
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Carousel controls - overlaid on image bottom */}
            {hasCarouselImages && (
              <div className="absolute bottom-0 left-0 right-0 flex items-center justify-center gap-2 py-1.5 bg-neutral-900/80">
                <button
                  onClick={handleCarouselPrevious}
                  disabled={isLoadingCarouselImage}
                  className="w-5 h-5 rounded hover:bg-white/10 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center text-white/70 hover:text-white transition-colors"
                  title={tc("Previous image")}
                >
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                  </svg>
                </button>
                <span className="text-[10px] text-white/70 min-w-[32px] text-center">
                  {(nodeData.selectedHistoryIndex || 0) + 1} / {(nodeData.imageHistory || []).length}
                </span>
                <button
                  onClick={handleCarouselNext}
                  disabled={isLoadingCarouselImage}
                  className="w-5 h-5 rounded hover:bg-white/10 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center text-white/70 hover:text-white transition-colors"
                  title={tc("Next image")}
                >
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                  </svg>
                </button>
              </div>
            )}
          </>
        ) : (
          <div className="w-full h-full min-h-[112px] bg-neutral-900/40 flex flex-col items-center justify-center">
            {nodeData.status === "loading" ? (
              <svg
                className="w-4 h-4 animate-spin text-neutral-400"
                fill="none"
                viewBox="0 0 24 24"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="3"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                />
              </svg>
            ) : nodeData.status === "error" ? (
              <span className="text-[10px] text-red-400 text-center px-2">
                {nodeData.error || "Failed"}
              </span>
            ) : (
              <span className="text-neutral-500 text-[10px]">{tc("Run to generate")}</span>
            )}
          </div>
        )}
      </div>

    </BaseNode>

    {/* Model browse dialog */}
    {isBrowseDialogOpen && (
      <ModelSearchDialog
        isOpen={isBrowseDialogOpen}
        onClose={() => setIsBrowseDialogOpen(false)}
        onModelSelected={handleBrowseModelSelect}
        initialCapabilityFilter="image"
      />
    )}
    </>
  );
}

/**
 * @deprecated Use `GenerateImageNode` instead. This alias is kept for backward compatibility
 * with existing workflows but will be removed in a future version.
 */
export { GenerateImageNode as NanoBananaNode };
