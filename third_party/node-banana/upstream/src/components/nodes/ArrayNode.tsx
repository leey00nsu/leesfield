"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Handle, Node, NodeProps, Position, useReactFlow } from "@xyflow/react";
import { BaseNode } from "./BaseNode";
import { useWorkflowStore } from "@/store/workflowStore";
import { ArrayNodeData } from "@/types";
import { getConnectedInputsPure } from "@/store/utils/connectedInputs";
import { parseTextToArray } from "@/utils/arrayParser";

type ArrayNodeType = Node<ArrayNodeData, "array">;

function arraysEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

export function ArrayNode({ id, data, selected }: NodeProps<ArrayNodeType>) {
  const updateNodeData = useWorkflowStore((state) => state.updateNodeData);
  const addNode = useWorkflowStore((state) => state.addNode);
  const onConnect = useWorkflowStore((state) => state.onConnect);
  const nodes = useWorkflowStore((state) => state.nodes);
  const edges = useWorkflowStore((state) => state.edges);

  // Derive nodeData from the Zustand store (already subscribed via `nodes`)
  // rather than React Flow props, so settings changes are reflected immediately.
  const nodeData = useMemo(() => {
    const n = nodes.find((nd) => nd.id === id);
    return (n?.data as ArrayNodeData) ?? data;
  }, [nodes, id, data]);
  const { setNodes, getNodes } = useReactFlow();
  const lastSyncedInputRef = useRef<string | null>(null);
  const lastDerivedWriteRef = useRef<string | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const hasIncomingTextConnection = useMemo(
    () =>
      edges.some((edge) => {
        if (edge.target !== id) return false;
        const handle = edge.targetHandle || "text";
        return handle === "text" || handle.startsWith("text-") || handle.includes("prompt");
      }),
    [edges, id]
  );

  const connectedText = useMemo(() => {
    if (!hasIncomingTextConnection) return null;
    return getConnectedInputsPure(id, nodes, edges).text;
  }, [edges, hasIncomingTextConnection, id, nodes]);

  // Pull upstream text into this node whenever the connected input changes.
  useEffect(() => {
    if (!hasIncomingTextConnection) {
      // Array node has no manual input field; clear stale upstream text on disconnect.
      if (nodeData.inputText !== null && nodeData.inputText !== "") {
        lastSyncedInputRef.current = null;
        updateNodeData(id, { inputText: null });
      }
      return;
    }
    const text = connectedText;
    if (
      text !== null &&
      text !== nodeData.inputText &&
      text !== lastSyncedInputRef.current
    ) {
      lastSyncedInputRef.current = text;
      updateNodeData(id, { inputText: text });
    }
  }, [connectedText, hasIncomingTextConnection, id, nodeData.inputText, updateNodeData]);

  const parsed = useMemo(() => {
    return parseTextToArray(nodeData.inputText, {
      splitMode: nodeData.splitMode,
      delimiter: nodeData.delimiter,
      regexPattern: nodeData.regexPattern,
      trimItems: nodeData.trimItems,
      removeEmpty: nodeData.removeEmpty,
    });
  }, [
    nodeData.inputText,
    nodeData.splitMode,
    nodeData.delimiter,
    nodeData.regexPattern,
    nodeData.trimItems,
    nodeData.removeEmpty,
  ]);

  // Keep derived outputs in node data so execution/edges always read the latest values.
  useEffect(() => {
    const nextOutputText = JSON.stringify(parsed.items);
    const writeSignature = `${parsed.error ?? ""}::${nextOutputText}`;
    const needsSync =
      parsed.error !== nodeData.error ||
      nextOutputText !== (nodeData.outputText ?? "[]") ||
      !arraysEqual(parsed.items, nodeData.outputItems || []);

    if (!needsSync) return;
    if (lastDerivedWriteRef.current === writeSignature) return;
    lastDerivedWriteRef.current = writeSignature;

    updateNodeData(id, {
      outputItems: parsed.items,
      outputText: nextOutputText,
      error: parsed.error,
    });
  }, [id, nodeData.error, nodeData.outputItems, nodeData.outputText, parsed.error, parsed.items, updateNodeData]);

  // Helper: reparse and update outputs atomically whenever any split setting changes.
  // Reads fresh data from the Zustand store (not React Flow props) to avoid stale closures.
  const updateSettingsAndReparse = useCallback(
    (partialSettings: Partial<Pick<ArrayNodeData, "splitMode" | "delimiter" | "regexPattern" | "trimItems" | "removeEmpty">>) => {
      const freshNode = useWorkflowStore.getState().nodes.find((n) => n.id === id);
      if (!freshNode) return;
      const fresh = freshNode.data as ArrayNodeData;
      const merged = {
        splitMode: partialSettings.splitMode ?? fresh.splitMode,
        delimiter: partialSettings.delimiter ?? fresh.delimiter,
        regexPattern: partialSettings.regexPattern ?? fresh.regexPattern,
        trimItems: partialSettings.trimItems ?? fresh.trimItems,
        removeEmpty: partialSettings.removeEmpty ?? fresh.removeEmpty,
      };
      const result = parseTextToArray(fresh.inputText, merged);
      updateNodeData(id, {
        ...partialSettings,
        outputItems: result.items,
        outputText: JSON.stringify(result.items),
        error: result.error,
      });
    },
    [id, updateNodeData]
  );

  const handleBasicModeChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      updateSettingsAndReparse({ splitMode: e.target.value as ArrayNodeData["splitMode"] });
    },
    [updateSettingsAndReparse]
  );

  const previewItems = parsed.items;

  const handleAutoRouteToPrompts = useCallback(() => {
    const items = previewItems;
    if (items.length === 0) return;

    const sourceNode = getNodes().find((n) => n.id === id);
    if (!sourceNode) return;

    const sourceWidth = (sourceNode.style?.width as number) || 360;
    const baseX = sourceNode.position.x + sourceWidth + 220;
    const baseY = sourceNode.position.y;
    const promptHeight = 220;
    const verticalGap = 24;

    const promptNodeIds: string[] = [];

    items.forEach((item, index) => {
      const promptNodeId = addNode(
        "prompt",
        { x: baseX, y: baseY + index * (promptHeight + verticalGap) },
        { prompt: item }
      );
      promptNodeIds.push(promptNodeId);

      // Pass the array item index directly as an edge data override
      // instead of mutating selectedOutputIndex in a loop.
      onConnect(
        {
          source: id,
          sourceHandle: "text",
          target: promptNodeId,
          targetHandle: "text",
        },
        { arrayItemIndex: index }
      );
    });

    // Deferred fix-up: the PromptNode text-sync effect may overwrite the
    // individual item text before the edge arrayItemIndex data is fully
    // settled. Re-apply the correct per-item text after effects have run.
    setTimeout(() => {
      items.forEach((item, index) => {
        updateNodeData(promptNodeIds[index], { prompt: item });
      });
    }, 0);
  }, [addNode, getNodes, id, onConnect, previewItems, updateNodeData]);

  // Reset selection if it no longer points to a valid parsed item.
  useEffect(() => {
    const currentSelection = nodeData.selectedOutputIndex;
    if (currentSelection !== null && (currentSelection < 0 || currentSelection >= previewItems.length)) {
      updateNodeData(id, { selectedOutputIndex: null });
    }
  }, [id, nodeData.selectedOutputIndex, previewItems.length, updateNodeData]);

  // Auto-resize node height to fit all parsed lines so users don't need to scroll.
  useEffect(() => {
    const headerHeight = 180;
    const perItemHeight = 28;
    const itemsMinHeight = 60;
    const newHeight = headerHeight + Math.max(itemsMinHeight, previewItems.length * perItemHeight + 8);

    setNodes((nodes) =>
      nodes.map((node) => {
        if (node.id !== id) return node;
        if ((node.style?.height as number) === newHeight) return node;
        return { ...node, style: { ...node.style, height: newHeight } };
      })
    );
  }, [id, previewItems.length, setNodes]);

  return (
    <BaseNode
      id={id}
      selected={selected}
      hasError={!!nodeData.error}
      minWidth={300}
      minHeight={220}
    >
      <Handle type="target" position={Position.Left} id="text" data-handletype="text" />

      {/* Single text output point (each outgoing edge receives a separate item) */}
      <Handle type="source" position={Position.Right} id="text" data-handletype="text" style={{ top: 48 }} />

      <div className="flex flex-col gap-2 pt-3 flex-1 min-h-0">
        <div className="flex items-center gap-2">
          <label className="shrink-0 text-[11px] text-neutral-400">Split</label>
          <select
            value={nodeData.splitMode}
            onChange={handleBasicModeChange}
            className="nodrag nopan flex-1 min-w-0 text-[11px] py-1 px-2 bg-[#1a1a1a] rounded-md focus:outline-none focus:ring-1 focus:ring-neutral-600 text-white"
          >
            <option value="delimiter">Delimiter</option>
            <option value="newline">Newline</option>
            <option value="regex">Regex (Advanced)</option>
          </select>
          {/* Batch mode toggle */}
          <button
            type="button"
            onClick={() => updateNodeData(id, { batchMode: !nodeData.batchMode })}
            className={`nodrag nopan shrink-0 py-1 px-2 rounded-md text-[11px] font-medium transition-colors ${
              nodeData.batchMode
                ? "bg-blue-600/80 text-blue-100"
                : "bg-[#1a1a1a] text-neutral-500 hover:text-neutral-300"
            }`}
            title={nodeData.batchMode ? "Batch mode: all items sent to one downstream node" : "Enable batch mode"}
          >
            Batch
          </button>
          {/* Auto-route button (hidden in batch mode) */}
          {!nodeData.batchMode && (
            <button
              type="button"
              onClick={handleAutoRouteToPrompts}
              disabled={previewItems.length === 0}
              className="nodrag nopan shrink-0 py-1 px-1.5 bg-[#1a1a1a] rounded-md text-neutral-400 hover:text-neutral-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              title="Auto-route to Prompts"
            >
              <svg className="w-3.5 h-3.5 rotate-90" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <path d="M16 3h5v5" />
                <path d="M8 3H3v5" />
                <path d="M12 22v-8.3a4 4 0 0 0-1.172-2.872L3 3" />
                <path d="m15 9 6-6" />
              </svg>
            </button>
          )}
        </div>

        {nodeData.splitMode === "delimiter" && (
          <div className="flex items-center gap-2 max-w-[75%]">
            <label className="shrink-0 text-[11px] text-neutral-400">By</label>
            <input
              value={nodeData.delimiter}
              onChange={(e) => updateSettingsAndReparse({ delimiter: e.target.value })}
              placeholder="*"
              className="nodrag nopan flex-1 min-w-0 text-[11px] py-1 px-2 bg-[#1a1a1a] rounded-md focus:outline-none focus:ring-1 focus:ring-neutral-600 text-white"
            />
          </div>
        )}

        {nodeData.splitMode === "regex" && (
          <div className="flex items-center gap-2 max-w-[75%]">
            <label className="shrink-0 text-[11px] text-neutral-400">By</label>
            <input
              value={nodeData.regexPattern}
              onChange={(e) => updateSettingsAndReparse({ regexPattern: e.target.value })}
              placeholder="/\\n+/"
              className="nodrag nopan flex-1 min-w-0 text-[11px] py-1 px-2 bg-[#1a1a1a] rounded-md focus:outline-none focus:ring-1 focus:ring-neutral-600 text-white"
            />
          </div>
        )}

        <div>
          <button
            type="button"
            onClick={() => setShowAdvanced((v) => !v)}
            className="nodrag nopan flex items-center gap-1 text-[11px] text-neutral-500 hover:text-neutral-300 transition-colors"
          >
            <svg className={`w-3 h-3 transition-transform ${showAdvanced ? "rotate-90" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
            <span>Advanced</span>
          </button>

          {showAdvanced && (
            <div className="px-2 pt-1.5 pb-0.5 flex items-center gap-3">
              <label className="flex items-center gap-1.5 text-[11px] text-neutral-300">
                <input
                  type="checkbox"
                  checked={nodeData.trimItems}
                  onChange={(e) => updateSettingsAndReparse({ trimItems: e.target.checked })}
                  className="nodrag nopan w-3 h-3 rounded bg-[#1a1a1a] text-neutral-600 focus:ring-1 focus:ring-neutral-600 focus:ring-offset-0"
                />
                Trim
              </label>
              <label className="flex items-center gap-1.5 text-[11px] text-neutral-300">
                <input
                  type="checkbox"
                  checked={nodeData.removeEmpty}
                  onChange={(e) => updateSettingsAndReparse({ removeEmpty: e.target.checked })}
                  className="nodrag nopan w-3 h-3 rounded bg-[#1a1a1a] text-neutral-600 focus:ring-1 focus:ring-neutral-600 focus:ring-offset-0"
                />
                Remove empty
              </label>
            </div>
          )}
        </div>

        <div className="mt-1 text-[10px] uppercase tracking-wide text-neutral-500">
          Parsed Items ({previewItems.length})
        </div>
        <div className="relative min-h-[50px] border border-neutral-700/40 rounded-md bg-[#1a1a1a]">
          {nodeData.error ? (
            <div className="p-2 text-[11px] text-red-400">{nodeData.error}</div>
          ) : previewItems.length === 0 ? (
            <div className="p-2 text-[11px] text-neutral-500">No items parsed</div>
          ) : (
            <div className="py-1">
              {previewItems.map((item, index) => {
                const isSelected = nodeData.selectedOutputIndex === index;
                return (
                  <button
                    key={`${index}-${item}`}
                    type="button"
                    onClick={() =>
                      updateNodeData(id, {
                        selectedOutputIndex: isSelected ? null : index,
                      })
                    }
                    className={`nodrag nopan w-[calc(100%-1rem)] mx-2 my-0.5 rounded-md px-2 py-1 text-[11px] text-left truncate transition-colors ${
                      isSelected
                        ? "bg-blue-900/40 text-blue-200 ring-1 ring-blue-500/60"
                        : "bg-neutral-800/60 text-neutral-300 hover:bg-neutral-700/60"
                    }`}
                    title={isSelected ? "Selected for next connection (click to unselect)" : "Click to select for next connection"}
                  >
                    {index + 1}. {item}
                  </button>
                );
              })}
            </div>
          )}
        </div>
        <div className="text-[10px] text-neutral-500">
          {nodeData.batchMode
            ? "Batch: all items sent to downstream node"
            : nodeData.selectedOutputIndex !== null
              ? `Next wire uses item ${nodeData.selectedOutputIndex + 1}`
              : "No selection: wires advance in order from item 1"}
        </div>
      </div>
    </BaseNode>
  );
}
