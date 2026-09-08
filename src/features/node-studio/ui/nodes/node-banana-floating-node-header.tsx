"use client";
import { AppTextarea } from "@/shared/ui/app-form-control";

import { useTranslations } from "next-intl";
import { useRef, useState } from "react";
import { Maximize2, MessageSquare, Minimize2, Play } from "lucide-react";

import type { CanonicalJsonValue } from "@/shared/generation-graph/canonical-graph";
import type { NodePresentation } from "@/shared/generation-graph/node-registry";
import { cn } from "@/shared/lib/utils";

import { useNodeAuthoring } from "../../model/node-authoring-context";

function record(value: CanonicalJsonValue): Record<string, CanonicalJsonValue> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, CanonicalJsonValue>
    : {};
}

function presentationFrom(config: CanonicalJsonValue): NodePresentation {
  const value = record(config).presentation;
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as NodePresentation
    : {};
}

export function NodeBananaFloatingNodeHeader({
  nodeId,
  title,
  config,
  selected,
  requiredToggle = false,
  expandable = false,
  expanded = false,
  onToggleExpanded,
  runnable = false,
  onRun,
}: {
  nodeId: string;
  title: string;
  config: CanonicalJsonValue;
  selected: boolean;
  requiredToggle?: boolean;
  expandable?: boolean;
  expanded?: boolean;
  onToggleExpanded?: () => void;
  runnable?: boolean;
  onRun?: () => void;
}) {
  const t = useTranslations("nodeStudio.host");
  const authoring = useNodeAuthoring();
  const presentation = presentationFrom(config);
  const [commentOpen, setCommentOpen] = useState(false);
  const [comment, setComment] = useState(presentation.comment ?? "");
  const [titleEditing, setTitleEditing] = useState(false);
  const [titleDraftState, setTitleDraftState] = useState({
    source: presentation.customTitle ?? "",
    value: presentation.customTitle ?? "",
  });
  const popoverRef = useRef<HTMLDivElement>(null);
  const writable = authoring.writable !== false && Boolean(authoring.updateCanonicalNodeConfig);
  const customTitle = presentation.customTitle ?? "";
  const titleDraft = titleDraftState.source === customTitle
    ? titleDraftState.value
    : customTitle;

  const updatePresentation = (patch: Partial<NodePresentation>) => {
    if (!writable) return;
    const baseConfig = { ...record(config) };
    delete baseConfig.presentation;
    const nextPresentation = { ...presentation, ...patch };
    for (const key of Object.keys(nextPresentation) as Array<keyof NodePresentation>) {
      if (nextPresentation[key] === undefined || nextPresentation[key] === "") delete nextPresentation[key];
    }
    authoring.updateCanonicalNodeConfig?.(nodeId, {
      ...baseConfig,
      ...(Object.keys(nextPresentation).length ? { presentation: nextPresentation } : {}),
    });
  };

  const saveComment = () => {
    updatePresentation({ comment: comment.trim() || undefined });
    setCommentOpen(false);
  };

  const saveTitle = () => {
    updatePresentation({ customTitle: titleDraft.trim() || undefined });
    setTitleEditing(false);
  };

  return (
    <div
      className="nodrag nopan pointer-events-auto absolute -top-8 left-0 z-20 flex h-7 w-full items-center justify-between px-1 text-[11px]"
      data-node-banana-component="FloatingNodeHeader"
    >
      {titleEditing ? (
        <input
          autoFocus
          value={titleDraft}
          maxLength={120}
          aria-label={t("customTitle")}
          placeholder={t("customTitlePlaceholder")}
          className="nodrag nopan min-w-0 flex-1 bg-transparent pl-1 text-[11px] font-semibold uppercase tracking-wide text-neutral-300 outline-none placeholder:text-neutral-500"
          onChange={(event) => setTitleDraftState({ source: customTitle, value: event.target.value })}
          onBlur={saveTitle}
          onKeyDown={(event) => {
            if (event.key === "Enter") saveTitle();
            if (event.key === "Escape") {
              setTitleDraftState({ source: customTitle, value: customTitle });
              setTitleEditing(false);
            }
          }}
        />
      ) : (
        <button
          type="button"
          disabled={!writable}
          aria-label={t("editTitle")}
          className="nodrag nopan min-w-0 truncate pl-1 text-left font-semibold uppercase tracking-wide text-neutral-400 disabled:cursor-default"
          title={t("editTitle")}
          onClick={() => {
            setTitleDraftState({ source: customTitle, value: customTitle });
            setTitleEditing(true);
          }}
        >
          {customTitle ? `${customTitle} - ${title}` : title}
        </button>
      )}
      <div
        className={cn(
          "flex shrink-0 items-center gap-1 transition-opacity duration-200",
          selected ? "opacity-100" : "opacity-0 group-hover:opacity-100 group-focus-within:opacity-100",
        )}
      >
        {requiredToggle ? (
          <button
            type="button"
            disabled={!writable}
            className={cn(
              "rounded border px-1.5 py-0.5 text-[10px] transition-colors",
              presentation.isOptional
                ? "border-amber-500/50 bg-amber-600/80 text-white hover:bg-amber-500/80"
                : "border-neutral-600 bg-neutral-700 text-neutral-400 hover:bg-neutral-600",
            )}
            title={presentation.isOptional ? t("requiredToggle") : t("optionalToggle")}
            onClick={() => updatePresentation({ isOptional: !presentation.isOptional })}
          >
            {presentation.isOptional ? t("optional") : t("required")}
          </button>
        ) : null}
        <div ref={popoverRef} className="relative">
          <button
            type="button"
            disabled={!writable}
            className={cn(
              "rounded border border-neutral-600 p-0.5 text-neutral-500 transition-colors hover:text-neutral-200",
              presentation.comment && "border-transparent text-blue-400 hover:text-blue-200",
            )}
            aria-label={presentation.comment ? t("editComment") : t("addComment")}
            title={presentation.comment ? presentation.comment : t("addComment")}
            onClick={() => {
              setComment(presentation.comment ?? "");
              setCommentOpen((open) => !open);
            }}
          >
            <MessageSquare className="h-3.5 w-3.5" aria-hidden="true" fill={presentation.comment ? "currentColor" : "none"} />
          </button>
          {commentOpen ? (
            <div className="absolute right-0 top-full z-[60] mt-1 w-64 rounded border border-neutral-600 bg-neutral-800 p-2 shadow-xl">
              <AppTextarea
                autoFocus
                value={comment}
                maxLength={4_000}
                placeholder={t("commentPlaceholder")}
                className="nowheel h-20 w-full resize-none rounded border border-neutral-700 bg-neutral-900/50 p-2 text-xs text-neutral-100 outline-none focus:ring-1 focus:ring-neutral-500"
                onChange={(event) => setComment(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Escape") setCommentOpen(false);
                  if ((event.metaKey || event.ctrlKey) && event.key === "Enter") saveComment();
                }}
              />
              <div className="mt-2 flex justify-end gap-2">
                <button type="button" className="px-2 py-1 text-xs text-neutral-400 hover:text-neutral-200" onClick={() => setCommentOpen(false)}>{t("cancel")}</button>
                <button type="button" className="rounded bg-blue-600 px-2 py-1 text-xs text-white hover:bg-blue-500" onClick={saveComment}>{t("save")}</button>
              </div>
            </div>
          ) : null}
        </div>
        {expandable && onToggleExpanded ? (
          <button
            type="button"
            className="group/expand flex items-center overflow-hidden rounded border border-neutral-600 p-0.5 text-neutral-500 transition-all duration-200 hover:pr-2 hover:text-neutral-200"
            aria-label={expanded ? t("collapseEditor") : t("expandEditor")}
            aria-expanded={expanded}
            title={expanded ? t("collapseEditor") : t("expandEditor")}
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => {
              event.stopPropagation();
              onToggleExpanded();
            }}
          >
            {expanded
              ? <Minimize2 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              : <Maximize2 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />}
            <span className="ml-0 max-w-0 overflow-hidden whitespace-nowrap text-[10px] opacity-0 transition-all duration-200 group-hover/expand:ml-1 group-hover/expand:max-w-[60px] group-hover/expand:opacity-100">
              {expanded ? t("collapse") : t("expand")}
            </span>
          </button>
        ) : null}
        {runnable && onRun ? (
          <button
            type="button"
            disabled={!writable}
            className="group/run flex items-center overflow-hidden rounded border border-neutral-600 p-0.5 text-neutral-500 transition-all duration-200 hover:pr-2 hover:text-neutral-200 disabled:cursor-not-allowed disabled:opacity-50"
            aria-label={t("runNode")}
            data-canvas-action="run" title={t("runThisNode")}
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => {
              event.stopPropagation();
              onRun();
            }}
          >
            <Play className="h-3.5 w-3.5 shrink-0" aria-hidden="true" fill="currentColor" />
            <span className="ml-0 max-w-0 overflow-hidden whitespace-nowrap text-[10px] opacity-0 transition-all duration-200 group-hover/run:ml-1 group-hover/run:max-w-[60px] group-hover/run:opacity-100">
              {t("runNode")}
            </span>
          </button>
        ) : null}
      </div>
    </div>
  );
}
