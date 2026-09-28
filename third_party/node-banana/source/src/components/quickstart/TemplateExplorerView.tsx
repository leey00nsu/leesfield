"use client";
import { CanvasSelect } from "../../leesfield/inputs";


import { useCanvasTranslation } from "../../leesfield/localization";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import type { HostedPresetWorkflow as WorkflowFile } from "../../leesfield/hosted-preset-types";
import { getAllPresets, PRESET_TEMPLATES, getPresetTemplate } from "../../lib/quickstart/templates";
import { QuickstartBackButton } from "./QuickstartBackButton";
import { TemplateCard } from "./TemplateCard";
import { TemplateCategory, TemplateMetadata } from "../../types/quickstart";

interface TemplateExplorerViewProps {
  onBack: () => void;
  onWorkflowSelected: (workflow: WorkflowFile) => void | Promise<void>;
}

type CategoryFilter = "all" | TemplateCategory;

const CATEGORY_OPTIONS: { id: CategoryFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "simple", label: "Simple" },
  { id: "advanced", label: "Advanced" },
];

// Static preset list (getAllPresets is pure/deterministic) — hoisted so its
// identity is stable across renders and downstream useMemos stay cached.
// Models are selected from the hosted catalog after creation; upstream provider tags do not apply.
const PRESETS = getAllPresets().map((preset) => ({ ...preset, tags: [] as string[] }));

export function TemplateExplorerView({
  onBack,
  onWorkflowSelected,
}: TemplateExplorerViewProps) {
  const tc = useCanvasTranslation();
  const [contentLevel, setContentLevel] = useState<"empty" | "minimal">("minimal");
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const [loadingWorkflowId, setLoadingWorkflowId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Filter state
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>("all");
  const [selectedTags, setSelectedTags] = useState<Set<string>>(new Set());
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Debounce search query
  useEffect(() => {
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }
    searchTimeoutRef.current = setTimeout(() => {
      setDebouncedSearch(searchQuery);
    }, 200);

    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
    };
  }, [searchQuery]);

  // Calculate node counts for each preset
  const presetMetadata = useMemo(() => {
    const metadata: Record<string, TemplateMetadata> = {};
    PRESET_TEMPLATES.forEach((template) => {
      metadata[template.id] = {
        nodeCount: template.workflow.nodes.length,
        category: template.category,
        tags: [],
      };
    });
    return metadata;
  }, []);

  // Filter presets based on search, category, and tags
  const filteredPresets = useMemo(() => {
    return PRESETS.filter((preset) => {
      // Search filter: match name or description
      if (debouncedSearch) {
        const searchLower = debouncedSearch.toLowerCase();
        const matchesSearch =
          (preset.name + " " + tc(preset.name)).toLowerCase().includes(searchLower) ||
          (preset.description + " " + tc(preset.description)).toLowerCase().includes(searchLower);
        if (!matchesSearch) return false;
      }

      // Category filter
      if (categoryFilter !== "all" && categoryFilter !== "community") {
        if (preset.category !== categoryFilter) return false;
      }

      // If "community" is selected, hide preset templates (they're not community)
      if (categoryFilter === "community") {
        return false;
      }

      // Tags filter (OR logic - match ANY selected tag)
      if (selectedTags.size > 0) {
        const hasMatchingTag = preset.tags.some((tag) => selectedTags.has(tag));
        if (!hasMatchingTag) return false;
      }

      return true;
    });
  }, [debouncedSearch, categoryFilter, selectedTags]);

  // Collect all unique tags from presets
  const availableTags = useMemo(() => {
    const tags = new Set<string>();
    PRESETS.forEach((preset) => {
      preset.tags.forEach((tag) => tags.add(tag));
    });
    return Array.from(tags).sort();
  }, []);

  // Toggle tag selection
  const toggleTag = useCallback((tag: string) => {
    setSelectedTags((prev) => {
      const next = new Set(prev);
      if (next.has(tag)) {
        next.delete(tag);
      } else {
        next.add(tag);
      }
      return next;
    });
  }, []);

  // Clear all filters
  const clearFilters = useCallback(() => {
    setSearchQuery("");
    setDebouncedSearch("");
    setCategoryFilter("all");
    setSelectedTags(new Set());
  }, []);

  // Check if any filters are active
  const hasActiveFilters = searchQuery || categoryFilter !== "all" || selectedTags.size > 0;

  // Check if results are empty
  const hasNoResults = filteredPresets.length === 0;

  const handlePresetSelect = useCallback(
    async (templateId: string) => {
      setLoadingWorkflowId(templateId);
      setError(null);

      try {
        await onWorkflowSelected(getPresetTemplate(templateId, contentLevel));
      } catch (err) {
        console.error("Error loading preset:", err);
        if (mounted.current) setError(err instanceof Error ? err.message : "Failed to load template");
      } finally {
        if (mounted.current) setLoadingWorkflowId(null);
      }
    },
    [onWorkflowSelected, contentLevel]
  );

  const isLoading = loadingWorkflowId !== null;

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Header */}
      <div className="flex-shrink-0 px-6 py-4 border-b border-neutral-700 flex items-center gap-4">
        <QuickstartBackButton onClick={onBack} disabled={isLoading} />
        <h2 className="text-lg font-semibold text-neutral-100">{tc("Template Explorer")}</h2>
      </div>

      {/* Content - Sidebar + Main Grid */}
      <div className="flex-1 flex max-sm:flex-col min-h-0 overflow-clip">
        {/* Sidebar */}
        <div className="w-48 max-sm:w-full flex-shrink-0 bg-neutral-900/80 border-r border-neutral-700 p-4 space-y-5 max-sm:space-y-2 overflow-y-auto">
          {/* Search Input */}
          <div className="relative">
            <svg
              className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-500"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z"
              />
            </svg>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={tc("Search templates...")}
              className="w-full pl-8 pr-3 py-2 text-sm bg-neutral-700/50 border border-neutral-600 rounded-lg text-neutral-200 placeholder-neutral-500 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>

          {/* Category Filters */}
          <div className="space-y-2">
            <h3 className="text-xs font-medium text-neutral-500 uppercase tracking-wider">{tc("Category")}</h3>
            <div className="flex flex-col max-sm:flex-row max-sm:flex-wrap gap-1">
              {CATEGORY_OPTIONS.map((option) => (
                <button
                  key={option.id}
                  onClick={() => setCategoryFilter(option.id)}
                  className={`
                    px-3 py-1.5 text-xs font-medium rounded-md text-left transition-colors
                    ${
                      categoryFilter === option.id
                        ? "bg-blue-500/20 border border-blue-500/50 text-blue-300"
                        : "bg-neutral-700/30 border border-transparent text-neutral-400 hover:bg-neutral-700/50 hover:text-neutral-300"
                    }
                  `}
                >
                  {tc(option.label)}
                </button>
              ))}
            </div>
          </div>

          {/* Tags, when available for hosted presets */}
          {availableTags.length > 0 && <div className="space-y-2">
            <h3 className="text-xs font-medium text-neutral-500 uppercase tracking-wider">{tc("Tags")}</h3>
            <div className="flex flex-col max-sm:flex-row max-sm:flex-wrap gap-1">
              {availableTags.map((tag) => (
                <button
                  key={tag}
                  onClick={() => toggleTag(tag)}
                  className={`
                    px-3 py-1.5 text-xs font-medium rounded-md text-left transition-colors
                    ${
                      selectedTags.has(tag)
                        ? "bg-blue-500/20 border border-blue-500/50 text-blue-300"
                        : "bg-neutral-700/30 border border-transparent text-neutral-400 hover:bg-neutral-700/50 hover:text-neutral-300"
                    }
                  `}
                >
                  {tag}
                </button>
              ))}
            </div>
          </div>}

          {/* Clear Filters */}
          {hasActiveFilters && (
            <button
              onClick={clearFilters}
              className="w-full px-3 py-1.5 text-xs font-medium text-neutral-400 hover:text-neutral-300 bg-neutral-700/30 hover:bg-neutral-700/50 rounded-md transition-colors"
            >{tc("Clear filters")}</button>
          )}
        </div>

        {/* Main Content Area */}
        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain p-6 max-sm:p-3 space-y-6">
          {/* Empty State */}
          {hasNoResults && hasActiveFilters && (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <svg
                className="w-12 h-12 text-neutral-600 mb-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={1.5}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z"
                />
              </svg>
              <h3 className="text-sm font-medium text-neutral-300 mb-1">{tc("No templates match your filters")}</h3>
              <p className="text-xs text-neutral-500 mb-4">{tc("Try adjusting your search or filters")}</p>
              <button
                onClick={clearFilters}
                className="px-4 py-2 text-sm font-medium text-blue-400 hover:text-blue-300 bg-blue-500/10 hover:bg-blue-500/20 rounded-lg transition-colors"
              >{tc("Clear all filters")}</button>
            </div>
          )}

          <label className="text-sm text-neutral-300">{tc("Starting content")}<CanvasSelect aria-label={tc("Starting content")} value={contentLevel} onChange={(event) => setContentLevel(event.target.value as "empty" | "minimal")} disabled={isLoading} className="ml-2 bg-neutral-700 rounded p-2">
              <option value="minimal">{tc("Prompt examples")}</option><option value="empty">{tc("Empty inputs")}</option>
            </CanvasSelect>
          </label>
          {/* Quick Start Templates */}
          {filteredPresets.length > 0 && (
            <div className="space-y-3">
              <h3 className="text-xs font-medium text-neutral-400 uppercase tracking-wider">{tc("Quick Start")}</h3>
              <div className="grid grid-cols-2 max-sm:grid-cols-1 gap-3">
                {filteredPresets.map((preset) => (
                  <TemplateCard
                    key={preset.id}
                    template={preset}
                    nodeCount={presetMetadata[preset.id]?.nodeCount ?? 0}
                    previewImage={undefined}
                    hoverImage={undefined}
                    isLoading={loadingWorkflowId === preset.id}
                    onUseWorkflow={() => handlePresetSelect(preset.id)}
                    disabled={isLoading && loadingWorkflowId !== preset.id}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Divider */}
          {/* Error */}
          {error && (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/30">
              <svg
                className="w-4 h-4 text-red-400 mt-0.5 flex-shrink-0"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                />
              </svg>
              <div className="flex-1">
                <p className="text-sm text-red-400">{error}</p>
                <button
                  onClick={() => setError(null)}
                  className="text-xs text-red-400/70 hover:text-red-400 mt-1"
                >{tc("Dismiss")}</button>
              </div>
            </div>
          )}
        </div>
      </div>

    </div>
  );
}
