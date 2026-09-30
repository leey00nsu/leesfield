"use client";

import { type ReactNode } from "react";
import { FloatingNodeHeader } from "@node-banana-runtime/runtime-entry";
import { Square } from "lucide-react";
import type { CanonicalJsonValue } from "@/shared/generation-graph/canonical-graph";
import { useCanvasTranslation } from "@/shared/i18n/use-canvas-translation";
import { useNodeAuthoring } from "../../model/node-authoring-context";

/** Reuses the generation header's actual Run button for Leesfield executions. */
export function NodeBananaExecutionHeader({
  id, title, config, selected, ready, executing, disabledReason, onRun, onCancel,
  cancelling = false, browseAction,
}: {
  id: string;
  title: string;
  config: CanonicalJsonValue;
  selected: boolean;
  ready: boolean;
  executing: boolean;
  disabledReason?: string | null;
  onRun: () => void;
  onCancel?: () => void;
  cancelling?: boolean;
  browseAction?: ReactNode;
}) {
  const authoring = useNodeAuthoring();
  const tc = useCanvasTranslation();
  const writable = authoring.writable !== false && Boolean(authoring.updateCanonicalNodeConfig);
  const values = config && typeof config === "object" && !Array.isArray(config) ? config : {};
  const presentation = values.presentation && typeof values.presentation === "object" && !Array.isArray(values.presentation)
    ? values.presentation : {};
  const updatePresentation = (key: "customTitle" | "comment", value: string) => {
    if (!writable) return;
    const next = { ...presentation, [key]: value.trim() };
    if (!value.trim()) delete next[key];
    authoring.updateCanonicalNodeConfig?.(id, { ...values, presentation: next });
  };

  return <div className="pointer-events-none absolute inset-x-0 top-0 z-20 [&>div]:!w-full [&>div]:!z-20"
    data-leesfield-component="ExecutionHeader">
    <FloatingNodeHeader
      id={id}
      // This selects runnable, non-expandable header affordances only.
      // Canonical kinds, ports and execution routing remain Leesfield-owned.
      type="llmGenerate"
      position={{ x: 0, y: 0 }}
      width={0}
      title={title}
      selected={selected}
      isExecuting={executing}
      runReady={writable && ready}
      runDisabledReason={!writable ? "This workflow is read-only." : disabledReason}
      customTitle={typeof presentation.customTitle === "string" ? presentation.customTitle : undefined}
      comment={typeof presentation.comment === "string" ? presentation.comment : undefined}
      onCustomTitleChange={(_id, value) => updatePresentation("customTitle", value)}
      onCommentChange={(_id, value) => updatePresentation("comment", value)}
      onRunNode={() => { if (writable && ready && !executing) onRun(); }}
      headerAction={browseAction}
      headerButtons={onCancel ? <button type="button" aria-label={tc("Cancel operation")} title={tc("Cancel operation")}
        disabled={!writable || cancelling} onClick={(event) => { event.stopPropagation(); onCancel(); }}
        className="nodrag nopan flex items-center rounded border border-neutral-600 p-0.5 text-neutral-500 transition-colors hover:text-neutral-200 disabled:cursor-not-allowed disabled:opacity-50">
        <Square className="h-3.5 w-3.5" aria-hidden="true" />
      </button> : undefined}
    />
  </div>;
}
