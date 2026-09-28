"use client";
import { CanvasTextarea } from "../../leesfield/inputs";


import { useCanvasTranslation } from "../../leesfield/localization";
import { Handle } from "../../leesfield/port-handle";

import { useCallback, useState, useEffect, useMemo, useRef } from "react";
import { createPortal } from "react-dom";
import { Position, NodeProps, Node } from "@xyflow/react";
import { BaseNode } from "./BaseNode";
import { HandleLabel } from "./HandleLabel";
import {
  PromptNodeData,
  useShowHandleLabels,
  useWorkflowStore,
} from "../../leesfield/upstream-node-host";

type PromptNodeType = Node<PromptNodeData, "prompt">;

export function PromptNode({ id, data, selected }: NodeProps<PromptNodeType>) {
  const tc = useCanvasTranslation();
  const nodeData = data;
  const updateNodeData = useWorkflowStore((state) => state.updateNodeData);
  const writable = useWorkflowStore((state) => state.writable);
  const getConnectedInputs = useWorkflowStore((state) => state.getConnectedInputs);
  const edges = useWorkflowStore((state) => state.edges);
  const showLabels = useShowHandleLabels(selected);

  // Local state for prompt to prevent cursor jumping during typing
  const [localPrompt, setLocalPrompt] = useState(nodeData.prompt);
  const [isEditing, setIsEditing] = useState(false);

  // Variable naming dialog state
  const [showVarDialog, setShowVarDialog] = useState(false);
  const [varNameInput, setVarNameInput] = useState(nodeData.variableName || "");
  const variableDialogRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!showVarDialog) return;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const dialog = variableDialogRef.current;
    const controls = () => Array.from(dialog?.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled])') ?? []);
    controls()[0]?.focus();
    const keydown = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); setShowVarDialog(false); }
      if (event.key === "Tab") {
        const items = controls(), first = items[0], last = items.at(-1);
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }
    };
    const focus = (event: FocusEvent) => { if (event.target instanceof globalThis.Node && dialog && !dialog.contains(event.target)) controls()[0]?.focus(); };
    window.addEventListener("keydown", keydown, true);
    document.addEventListener("focusin", focus);
    return () => { window.removeEventListener("keydown", keydown, true); document.removeEventListener("focusin", focus); if (previous?.isConnected) previous.focus(); };
  }, [showVarDialog]);

  // Check if this node has any incoming text connections
  const hasIncomingTextConnection = useMemo(() => {
    return edges.some((edge) => edge.target === id && edge.targetHandle === "text" && !edge.data?.hasPause);
  }, [edges, id]);

  // A connected prompt is a projection, not an edit of the authored prompt.
  const connectedText = hasIncomingTextConnection ? getConnectedInputs(id).text : null;

  // Sync from props when not actively editing
  useEffect(() => {
    if (!isEditing) {
      setLocalPrompt(nodeData.prompt);
    }
  }, [nodeData.prompt, isEditing]);

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      setLocalPrompt(e.target.value);
    },
    []
  );

  const handleFocus = useCallback(() => {
    setIsEditing(true);
  }, []);

  const handleBlur = useCallback(() => {
    setIsEditing(false);
    if (writable && !hasIncomingTextConnection && localPrompt !== nodeData.prompt) {
      updateNodeData(id, { prompt: localPrompt });
    }
  }, [id, localPrompt, nodeData.prompt, updateNodeData, writable, hasIncomingTextConnection]);

  const handleSaveVariableName = useCallback(() => {
    if (!writable) return;
    updateNodeData(id, { variableName: varNameInput || undefined });
    setShowVarDialog(false);
  }, [id, varNameInput, updateNodeData, writable]);

  const handleClearVariableName = useCallback(() => {
    if (!writable) return;
    setVarNameInput("");
    updateNodeData(id, { variableName: undefined });
    setShowVarDialog(false);
  }, [id, updateNodeData, writable]);

  const handleVariableNameChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    // Allow only alphanumeric and underscore, max 30 chars
    const sanitized = e.target.value.replace(/[^a-zA-Z0-9_]/g, "").slice(0, 30);
    setVarNameInput(sanitized);
  }, []);

  return (
    <>
      <BaseNode
        id={id}
        selected={selected}
        fullBleed
      >
        {/* Text input handle - for receiving text from LLM nodes */}
        <Handle
          type="target"
          position={Position.Left}
          id="text"
          data-handletype="text"
          style={{ zIndex: 10 }}
        />
        <HandleLabel label={tc("Text")} side="target" color="var(--handle-color-text)" visible={showLabels} />

        <CanvasTextarea
          value={hasIncomingTextConnection ? connectedText ?? "" : localPrompt}
          disabled={!writable || hasIncomingTextConnection}
          onChange={handleChange}
          onFocus={handleFocus}
          onBlur={handleBlur}
          placeholder={hasIncomingTextConnection ? tc("Text from connected Prompt node...") : nodeData.isOptional ? tc("Optional prompt (leave empty to skip)...") : tc("Describe what to generate...")}
          className="nodrag nopan nowheel w-full h-full p-3 pb-7 text-xs leading-relaxed text-neutral-100 bg-neutral-800 rounded-t-lg resize-none focus:outline-none placeholder:text-neutral-500 disabled:cursor-not-allowed disabled:text-neutral-500 disabled:bg-neutral-900"
        />
        <div className="absolute bottom-0 left-0 right-0 z-10 px-3 py-1.5 bg-neutral-900/90 rounded-b-lg">
          <button
            onClick={() => { if (writable) setShowVarDialog(true); }}
            disabled={!writable}
            className="nodrag nopan text-[10px] text-blue-400 hover:text-blue-300 transition-colors"
            title={tc("Set variable name")}
          >
            {nodeData.variableName ? `@${nodeData.variableName}` : tc("Add variable")}
          </button>
        </div>

        {/* Text output handle */}
        <Handle
          type="source"
          position={Position.Right}
          id="text"
          data-handletype="text"
          data-tutorial="prompt-output-handle"
          style={{ zIndex: 10 }}
        />
        <HandleLabel label={tc("Text")} side="source" color="var(--handle-color-text)" visible={showLabels} />
      </BaseNode>

      {/* Variable Naming Dialog - rendered via portal */}
      {showVarDialog && createPortal(
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[9999]" role="dialog" aria-modal="true" aria-label={tc("Set Variable Name")} onClick={(event) => { if (event.target === event.currentTarget) setShowVarDialog(false); }}>
          <div ref={variableDialogRef} className="bg-neutral-800 border border-neutral-600 rounded-lg shadow-xl p-4 w-96 max-w-[calc(100vw-32px)]">
            <h3 className="text-sm font-semibold text-neutral-100 mb-3">{tc("Set Variable Name")}</h3>
            <p className="text-xs text-neutral-400 mb-3">{tc("Use this prompt as a variable in PromptConstructor nodes")}</p>
            <div className="mb-4">
              <label className="block text-xs text-neutral-300 mb-1">{tc("Variable name")}</label>
              <input
                type="text"
                disabled={!writable}
                value={varNameInput}
                onChange={handleVariableNameChange}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && varNameInput) {
                    handleSaveVariableName();
                  }
                }}
                placeholder={tc("e.g. color, style, subject")}
                className="w-full px-3 py-2 text-sm text-neutral-100 bg-neutral-900 border border-neutral-700 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                autoFocus
              />
              {varNameInput && (
                <div className="mt-2 text-xs text-blue-400">{tc("Preview:")}<span className="font-mono">@{varNameInput}</span>
                </div>
              )}
            </div>
            <div className="flex gap-2 justify-end">
              {nodeData.variableName && (
                <button
                  onClick={handleClearVariableName}
                  disabled={!writable}
                  className="px-3 py-1.5 text-xs font-medium text-red-400 hover:text-red-300 hover:bg-red-900/30 rounded transition-colors"
                >{tc("Clear")}</button>
              )}
              <button
                onClick={() => setShowVarDialog(false)}
                className="px-3 py-1.5 text-xs font-medium text-neutral-400 hover:text-neutral-300 hover:bg-neutral-700 rounded transition-colors"
              >{tc("Cancel")}</button>
              <button
                onClick={handleSaveVariableName}
                disabled={!writable || !varNameInput}
                className="px-3 py-1.5 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 rounded disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >{tc("Save")}</button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
