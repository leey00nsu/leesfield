"use client";
import { CanvasDialog, CanvasSelect } from "../../leesfield/inputs";


import { useCanvasTranslation } from "../../leesfield/localization";

import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { createPortal } from "react-dom";
import {
  useWorkflowStore,
} from "../../leesfield/upstream-node-host";
import type {
  ModelCapability,
  ProviderModel,
  ProviderType,
} from "../../leesfield/upstream-node-host";

const ReplicateIcon = () => (
  <svg className="w-3.5 h-3.5" viewBox="0 0 1000 1000" fill="currentColor">
    <polygon points="1000,427.6 1000,540.6 603.4,540.6 603.4,1000 477,1000 477,427.6" />
    <polygon points="1000,213.8 1000,327 364.8,327 364.8,1000 238.4,1000 238.4,213.8" />
    <polygon points="1000,0 1000,113.2 126.4,113.2 126.4,1000 0,1000 0,0" />
  </svg>
);

const FalIcon = () => (
  <svg className="w-3.5 h-3.5" viewBox="0 0 1855 1855" fill="currentColor">
    <path fillRule="evenodd" clipRule="evenodd" d="M1181.65 78C1212.05 78 1236.42 101.947 1239.32 131.261C1265.25 392.744 1480.07 600.836 1750.02 625.948C1780.28 628.764 1805 652.366 1805 681.816V1174.18C1805 1203.63 1780.28 1227.24 1750.02 1230.05C1480.07 1255.16 1265.25 1463.26 1239.32 1724.74C1236.42 1754.05 1212.05 1778 1181.65 1778H673.354C642.951 1778 618.585 1754.05 615.678 1724.74C589.754 1463.26 374.927 1255.16 104.984 1230.05C74.7212 1227.24 50 1203.63 50 1174.18V681.816C50 652.366 74.7213 628.764 104.984 625.948C374.927 600.836 589.754 392.744 615.678 131.261C618.585 101.946 642.951 78 673.353 78H1181.65ZM402.377 926.561C402.377 1209.41 638.826 1438.71 930.501 1438.71C1222.18 1438.71 1458.63 1209.41 1458.63 926.561C1458.63 643.709 1222.18 414.412 930.501 414.412C638.826 414.412 402.377 643.709 402.377 926.561Z" />
  </svg>
);

const GeminiIcon = () => (
  <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor">
    <path d="M12 2L14.5 9.5L22 12L14.5 14.5L12 22L9.5 14.5L2 12L9.5 9.5L12 2Z" />
  </svg>
);

const KieIcon = () => (
  <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor">
    <path d="M6 3h3.5v7L17 3h4l-8 8.5L21 21h-4l-7.5-8.5V21H6V3z" />
  </svg>
);

const WaveSpeedIcon = () => (
  <svg className="w-3.5 h-3.5" viewBox="95 140 350 230" fill="currentColor">
    <path d="M308.946 153.758C314.185 153.758 318.268 158.321 317.516 163.506C306.856 237.02 270.334 302.155 217.471 349.386C211.398 354.812 203.458 357.586 195.315 357.586H127.562C117.863 357.586 110.001 349.724 110.001 340.025V333.552C110.001 326.82 113.882 320.731 119.792 317.505C176.087 286.779 217.883 232.832 232.32 168.537C234.216 160.09 241.509 153.758 250.167 153.758H308.946Z" />
    <path d="M183.573 153.758C188.576 153.758 192.592 157.94 192.069 162.916C187.11 210.12 160.549 250.886 122.45 275.151C116.916 278.676 110 274.489 110 267.928V171.318C110 161.62 117.862 153.758 127.56 153.758H183.573Z" />
    <path d="M414.815 153.758C425.503 153.758 433.734 163.232 431.799 173.743C420.697 234.038 398.943 290.601 368.564 341.414C362.464 351.617 351.307 357.586 339.419 357.586H274.228C266.726 357.586 262.611 348.727 267.233 342.819C306.591 292.513 334.86 233.113 348.361 168.295C350.104 159.925 357.372 153.758 365.922 153.758H414.815Z" />
  </svg>
);

const OpenAIIcon = () => (
  <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor">
    <path d="M22.282 9.821a5.985 5.985 0 0 0-.516-4.91 6.046 6.046 0 0 0-6.51-2.9A6.065 6.065 0 0 0 4.981 4.18a5.985 5.985 0 0 0-3.998 2.9 6.046 6.046 0 0 0 .743 7.097 5.98 5.98 0 0 0 .51 4.911 6.051 6.051 0 0 0 6.515 2.9A5.985 5.985 0 0 0 13.26 24a6.056 6.056 0 0 0 5.772-4.206 5.99 5.99 0 0 0 3.997-2.9 6.056 6.056 0 0 0-.747-7.073zM13.26 22.43a4.476 4.476 0 0 1-2.876-1.04l.141-.081 4.779-2.758a.795.795 0 0 0 .392-.681v-6.737l2.02 1.168a.071.071 0 0 1 .038.052v5.583a4.504 4.504 0 0 1-4.494 4.494zM3.6 18.304a4.47 4.47 0 0 1-.535-3.014l.142.085 4.783 2.759a.771.771 0 0 0 .78 0l5.843-3.369v2.332a.08.08 0 0 1-.033.062L9.74 19.95a4.5 4.5 0 0 1-6.14-1.646zM2.34 7.896a4.485 4.485 0 0 1 2.366-1.973V11.6a.766.766 0 0 0 .388.676l5.815 3.355-2.02 1.168a.076.076 0 0 1-.071 0l-4.83-2.786A4.504 4.504 0 0 1 2.34 7.896zm16.597 3.855l-5.833-3.387L15.119 7.2a.076.076 0 0 1 .071 0l4.83 2.791a4.494 4.494 0 0 1-.676 8.105v-5.678a.79.79 0 0 0-.407-.667zm2.01-3.023l-.141-.085-4.774-2.782a.776.776 0 0 0-.785 0L9.409 9.23V6.897a.066.066 0 0 1 .028-.061l4.83-2.787a4.5 4.5 0 0 1 6.68 4.66zm-12.64 4.135l-2.02-1.164a.08.08 0 0 1-.038-.057V6.075a4.5 4.5 0 0 1 7.375-3.453l-.142.08L8.704 5.46a.795.795 0 0 0-.393.681zm1.097-2.365l2.602-1.5 2.607 1.5v2.999l-2.597 1.5-2.607-1.5z" />
  </svg>
);

type CapabilityFilter = "all" | "image" | "video" | "audio";

export type ModelSearchDialogHostedProps = {
  /** Models supplied by the embedding application; no provider/API fetches are made. */
  hostedModels: readonly ProviderModel[];
  onHostedModelSelected: (model: ProviderModel) => void;
  isLoading?: boolean;
  error?: string | null;
  onRefresh?: () => Promise<void>;
};

interface ModelSearchDialogProps {
  isOpen: boolean;
  onClose: () => void;
  initialProvider?: ProviderType | null;
  /** When provided, calls this callback instead of creating a new node */
  onModelSelected?: (model: ProviderModel) => void;
  /** Initial capability filter - 'image' for image nodes, 'video' for video nodes */
  initialCapabilityFilter?: CapabilityFilter;
  /** Show a "Remove fallback" row above the results list (fallback-selection mode) */
  showClearOption?: boolean;
  /** Callback when the "Remove fallback" row is clicked */
  onClearSelection?: () => void;
  /** Custom dialog title (defaults to "Browse Models") */
  title?: string;
  /** Explicit hosted inventory and selection callback. */
  hosted?: ModelSearchDialogHostedProps;
}

export function ModelSearchDialog({
  isOpen,
  onClose,
  initialProvider,
  onModelSelected,
  initialCapabilityFilter,
  showClearOption,
  onClearSelection,
  title = "Browse Models",
  hosted,
}: ModelSearchDialogProps) {
  const tc = useCanvasTranslation();
  const {
    incrementModalCount,
    decrementModalCount,
    recentModels,
    trackModelUsage,
    hostedModels,
    hostedModelsLoading,
    hostedModelsError,
    refreshHostedModels,
  } = useWorkflowStore();
  const catalog = hosted?.hostedModels ?? hostedModels;
  const refreshCatalog = hosted?.onRefresh ?? refreshHostedModels;
  const selectModel = hosted?.onHostedModelSelected ?? onModelSelected;
  // State
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [providerFilter, setProviderFilter] = useState<ProviderType | "all">(
    initialProvider || "all"
  );
  const [capabilityFilter, setCapabilityFilter] =
    useState<CapabilityFilter>(initialCapabilityFilter || "all");
  const isLoading = hosted?.isLoading ?? hostedModelsLoading ?? false;
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const error = refreshError ?? hosted?.error ?? hostedModelsError ?? null;

  // Refs
  const searchInputRef = useRef<HTMLInputElement>(null);
  // Track request version to ignore stale responses
  const requestVersionRef = useRef(0);

  // Register modal with store
  useEffect(() => {
    if (isOpen) {
      incrementModalCount();
      return () => decrementModalCount();
    }
  }, [isOpen, incrementModalCount, decrementModalCount]);

  // Debounce search query
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchQuery);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  useEffect(() => {
    if (!isOpen) return;
    setProviderFilter(initialProvider ?? "all");
    setCapabilityFilter(initialCapabilityFilter ?? "all");
    setSearchQuery("");
    setDebouncedSearch("");
    setRefreshError(null);
  }, [isOpen, initialProvider, initialCapabilityFilter]);

  // The authenticated host owns catalog loading, caching, and schema refresh.
  // Keep a generation guard so a closed/reopened dialog ignores late failures.
  useEffect(() => {
    requestVersionRef.current += 1;
    return () => { requestVersionRef.current += 1; };
  }, [isOpen, catalog]);

  const handleRefresh = useCallback(async () => {
    if (!refreshCatalog) return;
    const version = requestVersionRef.current;
    setIsRefreshing(true);
    setRefreshError(null);
    try {
      await refreshCatalog();
    } catch (cause) {
      if (version === requestVersionRef.current) {
        setRefreshError(cause instanceof Error ? cause.message : "Failed to refresh models");
      }
    } finally {
      if (version === requestVersionRef.current) setIsRefreshing(false);
    }
  }, [refreshCatalog]);

  useEffect(() => { setIsRefreshing(false); }, [isOpen, catalog]);

  const supportedModels = useMemo(() => catalog.filter((model) =>
    model.capabilities.some((cap) => ["text-to-image", "image-to-image", "text-to-video", "image-to-video", "audio-to-video", "text-to-audio"].includes(cap))
  ), [catalog]);
  const models = useMemo(() => supportedModels.filter((model) => {
    if (providerFilter !== "all" && model.provider !== providerFilter) return false;
    const query = debouncedSearch.trim().toLowerCase();
    if (query && !`${model.name} ${model.id} ${model.provider} ${model.description ?? ""}`.toLowerCase().includes(query)) return false;
    const capabilities = capabilityFilter === "image" ? ["text-to-image", "image-to-image"]
      : capabilityFilter === "video" ? ["text-to-video", "image-to-video", "audio-to-video"]
      : capabilityFilter === "audio" ? ["text-to-audio"] : null;
    return !capabilities || model.capabilities.some((cap) => capabilities.includes(cap));
  }), [supportedModels, providerFilter, capabilityFilter, debouncedSearch]);

  // Focus search input when dialog opens
  useEffect(() => {
    if (isOpen && searchInputRef.current) {
      searchInputRef.current.focus();
    }
  }, [isOpen]);

  // Handle model selection
  const handleSelectModel = useCallback(
    (model: ProviderModel) => {
      // Selection must still belong to this authenticated, active catalog.
      const activeModel = supportedModels.find((item) => item.id === model.id && item.provider === model.provider);
      if (!activeModel || !selectModel) return;
      selectModel(activeModel);
      trackModelUsage({
        provider: activeModel.provider,
        modelId: activeModel.id,
        displayName: activeModel.name,
      });
      onClose();
    },
    [supportedModels, selectModel, onClose, trackModelUsage]
  );

  // Get provider badge color
  const getProviderBadgeColor = (provider: ProviderType) => {
    switch (provider) {
      case "gemini":
        return "bg-green-500/20 text-green-300";
      case "replicate":
        return "bg-blue-500/20 text-blue-300";
      case "fal":
        return "bg-yellow-500/20 text-yellow-300";
      case "kie":
        return "bg-orange-500/20 text-orange-300";
      case "wavespeed":
        return "bg-purple-500/20 text-purple-300";
      case "openai":
        return "bg-teal-500/20 text-teal-300";
      default:
        return "bg-neutral-500/20 text-neutral-300";
    }
  };

  // Get provider display name
  const getProviderDisplayName = (provider: ProviderType) => {
    switch (provider) {
      case "hf_space": return "Hugging Face";
      case "codex_bridge": return "Codex Bridge";
      case "codex_cli": return "Codex CLI";
      case "gemini":
        return "Gemini";
      case "replicate":
        return "Replicate";
      case "fal":
        return "fal.ai";
      case "kie":
        return "Kie.ai";
      case "wavespeed":
        return "WaveSpeed";
      case "openai":
        return "OpenAI";
      default:
        return provider;
    }
  };

  const availableProviders = useMemo(
    () => new Set(supportedModels.map((model) => model.provider)),
    [supportedModels]
  );

  // Reset provider filter if current selection becomes unavailable
  useEffect(() => {
    if (providerFilter !== "all" && !availableProviders.has(providerFilter as ProviderType)) {
      setProviderFilter("all");
    }
  }, [providerFilter, availableProviders]);

  // Only current catalog entries are selectable; never reconstruct stale models.
  const filteredRecentModels = useMemo(() => recentModels.filter((recent) =>
    models.some((model) => model.id === recent.modelId && model.provider === recent.provider)
  ).slice(0, 4), [recentModels, models]);

  // Get display name with suffix for fal.ai models to differentiate variants
  const getDisplayName = (model: ProviderModel): string => {
    if (model.provider === "fal") {
      // Extract the last segment of the ID (e.g., "effects" from "kling-video/v1.6/pro/effects")
      const segments = model.id.split("/");
      const lastSegment = segments[segments.length - 1];

      // Only add suffix if it's not already in the name (case-insensitive)
      if (lastSegment && !model.name.toLowerCase().includes(lastSegment.toLowerCase())) {
        return `${model.name} - ${lastSegment}`;
      }
    }
    return model.name;
  };

  // Get model page URL for the provider's website
  const getModelUrl = (model: ProviderModel): string | null => {
    if (model.pageUrl) return model.pageUrl;
    switch (model.provider) {
      case "replicate":
        return `https://replicate.com/${model.id}`;
      case "fal":
        return `https://fal.ai/models/${model.id}`;
      case "wavespeed":
        return `https://wavespeed.ai`;
      default:
        return null;
    }
  };

  // Get capability badges - show all capabilities to differentiate similar models
  const getCapabilityBadges = (capabilities: ModelCapability[]) => {
    const badges: React.ReactNode[] = [];

    capabilities.forEach((cap) => {
      let color = "";
      let label = "";

      switch (cap) {
        case "text-to-image":
          color = "bg-green-500/20 text-green-300";
          label = "T2I";
          break;
        case "image-to-image":
          color = "bg-cyan-500/20 text-cyan-300";
          label = "I2I";
          break;
        case "text-to-video":
          color = "bg-purple-500/20 text-purple-300";
          label = "T2V";
          break;
        case "image-to-video":
          color = "bg-pink-500/20 text-pink-300";
          label = "I2V";
          break;
        case "text-to-audio":
          color = "bg-fuchsia-500/20 text-fuchsia-300";
          label = "T2A";
          break;
        case "audio-to-video":
          color = "bg-violet-500/20 text-violet-300";
          label = "A2V";
          break;
      }

      if (label) {
        badges.push(
          <span
            key={cap}
            className={`text-[10px] px-1.5 py-0.5 rounded ${color}`}
          >
            {label}
          </span>
        );
      }
    });

    return badges;
  };

  if (!isOpen) return null;

  const dialogContent = (
    <CanvasDialog componentName="ModelSearchDialog" closeLabel={tc("Close models")} title={tc(title)} onClose={onClose} className="w-full max-w-5xl h-[min(760px,calc(100dvh-2rem))] flex flex-col overflow-hidden">
        {/* Filter Bar */}
        <div className="px-6 py-4 border-b border-neutral-700">
          <div className="flex flex-col sm:flex-row gap-3">
            {/* Search Input */}
            <div className="flex-1 relative">
              <svg
                className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                />
              </svg>
              <input
                ref={searchInputRef}
                aria-label={tc("Search models")}
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={tc("Search models...")}
                className="w-full pl-10 pr-4 py-2 text-sm bg-neutral-700 border border-neutral-600 rounded text-neutral-100 placeholder:text-neutral-400 focus:outline-none focus:ring-1 focus:ring-neutral-500"
              />
            </div>

            <CanvasSelect aria-label={tc("Provider")} value={providerFilter} onChange={event=>setProviderFilter(event.target.value as ProviderType | "all")}><option value="all">{tc("All Providers")}</option>{[...availableProviders].map(provider=><option key={provider} value={provider}>{getProviderDisplayName(provider)}</option>)}</CanvasSelect>
            {/* Capability Filter */}
            <CanvasSelect
              aria-label={tc("Model capability")}
              value={capabilityFilter}
              onChange={(e) =>
                setCapabilityFilter(e.target.value as CapabilityFilter)
              }
              className="px-3 py-2 text-sm bg-neutral-700 border border-neutral-600 rounded text-neutral-100 focus:outline-none focus:ring-1 focus:ring-neutral-500"
            >
              <option value="all">{tc("All Types")}</option>
              <option value="image">{tc("Image")}</option>
              <option value="video">{tc("Video")}</option>
              <option value="audio">{tc("Audio")}</option>
            </CanvasSelect>

            {/* Refresh Cache */}
            <button
              onClick={handleRefresh}
              disabled={!refreshCatalog || isRefreshing || isLoading}
              title={tc("Refresh models & schemas")}
              className="p-2 rounded text-neutral-400 hover:text-neutral-200 hover:bg-neutral-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <svg
                className={`w-4 h-4${isRefreshing ? " animate-spin" : ""}`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 4v5h5M20 20v-5h-5M4 9a8 8 0 0113.292-6.036M20 15a8 8 0 01-13.292 6.036"
                />
              </svg>
            </button>
          </div>
        </div>

        {/* Model List */}
        <div className="flex-1 overflow-y-auto p-4">
          {isLoading ? (
            <div className="flex items-center justify-center h-48">
              <div className="flex flex-col items-center gap-3">
                <svg
                  className="w-8 h-8 animate-spin text-neutral-400"
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
                <span className="text-sm text-neutral-400">{tc("Loading models...")}</span>
              </div>
            </div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center h-48 gap-3">
              <svg
                className="w-10 h-10 text-red-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                />
              </svg>
              <p className="text-sm text-neutral-400 text-center max-w-xs">
                {error}
              </p>
              <button
                onClick={handleRefresh}
                disabled={!refreshCatalog || isRefreshing}
                className="px-3 py-1.5 text-sm bg-neutral-700 hover:bg-neutral-600 text-neutral-200 rounded transition-colors"
              >{tc("Try Again")}</button>
            </div>
          ) : models.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-48 gap-2">
              {showClearOption && onClearSelection && (
                <button
                  onClick={() => onClearSelection()}
                  className="w-full flex items-center justify-between px-3 py-2 mb-2 bg-neutral-800/60 hover:bg-neutral-700/60 border border-neutral-700 hover:border-red-500/50 rounded-lg transition-colors text-left group"
                >
                  <div className="flex items-center gap-2">
                    <svg className="w-4 h-4 text-red-400 group-hover:text-red-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                    <span className="text-sm text-neutral-200 group-hover:text-white">{tc("Remove fallback")}</span>
                  </div>
                  <span className="text-xs text-neutral-500">{tc("Clear current selection")}</span>
                </button>
              )}
              <svg
                className="w-10 h-10 text-neutral-500"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
              <p className="text-sm text-neutral-400">{tc("No models found")}</p>
              <p className="text-xs text-neutral-500">{tc("Try adjusting your search or filters")}</p>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Remove fallback row (fallback-selection mode only) */}
              {showClearOption && onClearSelection && (
                <button
                  onClick={() => onClearSelection()}
                  className="w-full flex items-center justify-between px-3 py-2 bg-neutral-800/60 hover:bg-neutral-700/60 border border-neutral-700 hover:border-red-500/50 rounded-lg transition-colors text-left group"
                >
                  <div className="flex items-center gap-2">
                    <svg className="w-4 h-4 text-red-400 group-hover:text-red-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                    <span className="text-sm text-neutral-200 group-hover:text-white">{tc("Remove fallback")}</span>
                  </div>
                  <span className="text-xs text-neutral-500">{tc("Clear current selection")}</span>
                </button>
              )}

              {/* Recently Used Section */}
              {filteredRecentModels.length > 0 && !searchQuery && (
                <div className="bg-neutral-700/30 rounded-lg p-3">
                  <h3 className="text-xs font-medium text-neutral-500 mb-2">{tc("Recently Used")}</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {filteredRecentModels.map((recent) => {
                      const matchingModel = models.find(
                        (m) => m.id === recent.modelId && m.provider === recent.provider
                      );
                      if (!matchingModel) return null;
                      const model = matchingModel;
                      return (
                        <button
                          key={`recent-${recent.provider}-${recent.modelId}`}
                          onClick={() => handleSelectModel(model)}
                          className="flex items-center gap-3 p-3 bg-neutral-700/50 hover:bg-neutral-700 border border-neutral-600/30 hover:border-neutral-500 rounded-lg transition-colors text-left cursor-pointer group"
                        >
                          {/* Small cover image */}
                          <div className="w-10 h-10 rounded bg-neutral-600 overflow-hidden flex-shrink-0">
                            {matchingModel?.coverImage ? (
                              <img
                                src={matchingModel.coverImage}
                                alt={recent.displayName}
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center">
                                <svg
                                  className="w-5 h-5 text-neutral-500"
                                  fill="none"
                                  stroke="currentColor"
                                  viewBox="0 0 24 24"
                                >
                                  <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth={1.5}
                                    d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                                  />
                                </svg>
                              </div>
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="font-medium text-neutral-100 text-sm truncate">
                              {recent.displayName}
                            </div>
                            <span
                              className={`text-[10px] px-1.5 py-0.5 rounded ${getProviderBadgeColor(recent.provider)}`}
                            >
                              {getProviderDisplayName(recent.provider)}
                            </span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Main Model List */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {models.map((model) => (
                <button
                  key={`${model.provider}-${model.id}`}
                  onClick={() => handleSelectModel(model)}
                  className="flex items-start gap-3 p-4 bg-neutral-700/50 hover:bg-neutral-700 border border-neutral-600/50 hover:border-neutral-500 rounded-lg transition-colors text-left cursor-pointer group"
                >
                  {/* Cover Image - larger */}
                  <div className="w-20 h-20 rounded bg-neutral-600 overflow-hidden flex-shrink-0">
                    {model.coverImage ? (
                      <img
                        src={model.coverImage}
                        alt={model.name}
                        className="w-full h-full object-cover"
                        onError={(e) => {
                          // Hide broken images
                          (e.target as HTMLImageElement).style.display = "none";
                        }}
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <svg
                          className="w-8 h-8 text-neutral-500"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={1.5}
                            d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                          />
                        </svg>
                      </div>
                    )}
                  </div>

                  {/* Model Info */}
                  <div className="flex-1 min-w-0">
                    {/* Model name with variant suffix for fal.ai */}
                    <div className="font-medium text-neutral-100 text-sm truncate">
                      {getDisplayName(model)}
                    </div>

                    {/* Model ID with link to provider page */}
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <span className="text-xs text-neutral-500 truncate font-mono">
                        {model.id}
                      </span>
                      {getModelUrl(model) && (
                        <a
                          href={getModelUrl(model)!}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="text-neutral-500 hover:text-neutral-300 transition-colors flex-shrink-0"
                          title={`View on ${getProviderDisplayName(model.provider)}`}
                        >
                          <svg
                            className="w-3 h-3"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                            />
                          </svg>
                        </a>
                      )}
                    </div>

                    {/* Badges row */}
                    <div className="flex items-center gap-1.5 flex-wrap mt-1.5">
                      <span
                        className={`text-[10px] px-1.5 py-0.5 rounded ${getProviderBadgeColor(model.provider)}`}
                      >
                        {getProviderDisplayName(model.provider)}
                      </span>
                      {getCapabilityBadges(model.capabilities)}
                    </div>

                    {/* Description - more lines */}
                    {model.description && (
                      <p className="mt-1.5 text-xs text-neutral-400 line-clamp-3">
                        {model.description}
                      </p>
                    )}
                  </div>

                  {/* Hover indicator */}
                  <div className="opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0 self-center">
                    <svg
                      className="w-5 h-5 text-neutral-400"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M12 4v16m8-8H4"
                      />
                    </svg>
                  </div>
                </button>
              ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer with model count */}
        {!isLoading && !error && models.length > 0 && (
          <div className="px-6 py-3 border-t border-neutral-700 text-xs text-neutral-400">
            {tc("{count} models found").replace("{count}", String(models.length))}</div>
        )}
    </CanvasDialog>
  );

  // Use portal to render outside React Flow stacking context
  return createPortal(dialogContent, document.body);
}
