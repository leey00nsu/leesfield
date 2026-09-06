"use client";

import { useEffect, useMemo } from "react";
import { Handle, Position, NodeProps, Node } from "@xyflow/react";
import { BaseNode } from "./BaseNode";
import { useWorkflowStore } from "@/store/workflowStore";
import type { ImageResizeNodeData, ImageResizeFit, ImageResizeFormat, ImageResizeMode } from "@/types";
import { useAdaptiveImageSrc } from "@/hooks/useAdaptiveImageSrc";
import { useShowHandleLabels } from "@/hooks/useShowHandleLabels";
import { HandleLabel } from "./HandleLabel";

type ImageResizeNodeType = Node<ImageResizeNodeData, "imageResize">;

function formatBytes(bytes: number | null): string {
  if (bytes === null) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export function ImageResizeNode({ id, data, selected }: NodeProps<ImageResizeNodeType>) {
  const nodeData = data;
  const adaptiveOutput = useAdaptiveImageSrc(nodeData.outputImage, id);
  const updateNodeData = useWorkflowStore((state) => state.updateNodeData);
  const regenerateNode = useWorkflowStore((state) => state.regenerateNode);
  const isRunning = useWorkflowStore((state) => state.isRunning);
  const getConnectedInputs = useWorkflowStore((state) => state.getConnectedInputs);
  const edges = useWorkflowStore((state) => state.edges);
  const nodes = useWorkflowStore((state) => state.nodes);
  const showLabels = useShowHandleLabels(selected);

  // Sync upstream image into sourceImage so the executor + UI both see it
  const hasIncomingImage = useMemo(
    () => edges.some((e) => e.target === id && e.targetHandle === "image"),
    [edges, id],
  );

  const upstreamImage = useMemo(() => {
    if (!hasIncomingImage) return null;
    const { images } = getConnectedInputs(id);
    return images[0] ?? null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasIncomingImage, id, getConnectedInputs, nodes]);

  useEffect(() => {
    if (upstreamImage !== nodeData.sourceImage) {
      updateNodeData(id, { sourceImage: upstreamImage });
    }
  }, [upstreamImage, id, updateNodeData, nodeData.sourceImage]);

  const formatLabel = (f: ImageResizeFormat) =>
    f === "keep" ? "Keep" : f.toUpperCase();

  return (
    <BaseNode
      id={id}
      selected={selected}
      isExecuting={isRunning}
      hasError={nodeData.status === "error"}
      minWidth={300}
      minHeight={340}
      aspectFitMedia={nodeData.outputImage ?? nodeData.sourceImage}
    >
      <Handle
        type="target"
        position={Position.Left}
        id="image"
        data-handletype="image"
        style={{ top: "50%" }}
      />
      <HandleLabel label="Image In" side="target" color="var(--handle-color-image)" top="calc(50% - 7px)" visible={showLabels} />

      <Handle
        type="source"
        position={Position.Right}
        id="image"
        data-handletype="image"
        style={{ top: "50%" }}
      />
      <HandleLabel label="Image Out" side="source" color="var(--handle-color-image)" top="calc(50% - 7px)" visible={showLabels} />

      <div className="flex-1 flex flex-col min-h-0 gap-2">
        {/* Preview */}
        <div className="relative flex-1 min-h-0 bg-neutral-900/40 rounded">
          {nodeData.outputImage || nodeData.sourceImage ? (
            <img
              src={adaptiveOutput ?? nodeData.sourceImage ?? undefined}
              alt="Resize preview"
              className="absolute inset-0 w-full h-full object-contain rounded"
            />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-[10px] text-neutral-500">Connect an image</span>
            </div>
          )}
          {nodeData.status === "loading" && (
            <div className="absolute inset-0 bg-neutral-900/70 rounded flex items-center justify-center">
              <svg className="w-5 h-5 animate-spin text-white" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
            </div>
          )}
        </div>

        {/* Settings */}
        <div className="nodrag nowheel shrink-0 flex flex-col gap-1.5 text-[10px] text-neutral-300">
          {/* Mode tabs */}
          <div className="flex gap-1">
            {(["exact", "maxEdge", "scale"] as ImageResizeMode[]).map((m) => (
              <button
                key={m}
                onClick={() => updateNodeData(id, { mode: m })}
                className={`flex-1 px-1.5 py-1 rounded text-[10px] font-medium transition-colors ${
                  nodeData.mode === m
                    ? "bg-blue-600 text-white"
                    : "bg-neutral-800 text-neutral-400 hover:text-neutral-200"
                }`}
              >
                {m === "exact" ? "Exact" : m === "maxEdge" ? "Max Edge" : "Scale %"}
              </button>
            ))}
          </div>

          {/* Mode-specific inputs */}
          {nodeData.mode === "exact" && (
            <div className="flex items-center gap-1">
              <label className="text-neutral-400">W</label>
              <input
                type="number"
                min={1}
                value={nodeData.width}
                onChange={(e) => updateNodeData(id, { width: Number(e.target.value) || 1 })}
                className="flex-1 px-1.5 py-0.5 bg-neutral-800 rounded text-neutral-200"
              />
              <label className="text-neutral-400">H</label>
              <input
                type="number"
                min={1}
                value={nodeData.height}
                onChange={(e) => updateNodeData(id, { height: Number(e.target.value) || 1 })}
                className="flex-1 px-1.5 py-0.5 bg-neutral-800 rounded text-neutral-200"
              />
            </div>
          )}
          {nodeData.mode === "maxEdge" && (
            <div className="flex items-center gap-1">
              <label className="text-neutral-400">Max edge</label>
              <input
                type="number"
                min={1}
                value={nodeData.maxEdge}
                onChange={(e) => updateNodeData(id, { maxEdge: Number(e.target.value) || 1 })}
                className="flex-1 px-1.5 py-0.5 bg-neutral-800 rounded text-neutral-200"
              />
              <span className="text-neutral-500">px</span>
            </div>
          )}
          {nodeData.mode === "scale" && (
            <div className="flex items-center gap-1">
              <label className="text-neutral-400">Scale</label>
              <input
                type="number"
                min={1}
                max={400}
                value={nodeData.scalePct}
                onChange={(e) =>
                  updateNodeData(id, {
                    scalePct: Math.min(400, Math.max(1, Number(e.target.value) || 1)),
                  })
                }
                className="flex-1 px-1.5 py-0.5 bg-neutral-800 rounded text-neutral-200"
              />
              <span className="text-neutral-500">%</span>
            </div>
          )}

          {/* Fit (only when exact) */}
          {nodeData.mode === "exact" && (
            <div className="flex gap-1">
              {(["contain", "cover", "stretch"] as ImageResizeFit[]).map((f) => (
                <button
                  key={f}
                  onClick={() => updateNodeData(id, { fit: f })}
                  className={`flex-1 px-1.5 py-0.5 rounded text-[10px] capitalize transition-colors ${
                    nodeData.fit === f
                      ? "bg-blue-600 text-white"
                      : "bg-neutral-800 text-neutral-400 hover:text-neutral-200"
                  }`}
                >
                  {f}
                </button>
              ))}
            </div>
          )}

          {/* Format + quality */}
          <div className="flex items-center gap-1">
            <select
              value={nodeData.format}
              onChange={(e) => updateNodeData(id, { format: e.target.value as ImageResizeFormat })}
              className="px-1.5 py-0.5 bg-neutral-800 rounded text-neutral-200"
            >
              {(["keep", "png", "jpeg", "webp"] as ImageResizeFormat[]).map((f) => (
                <option key={f} value={f}>{formatLabel(f)}</option>
              ))}
            </select>
            {(nodeData.format === "jpeg" || nodeData.format === "webp") && (
              <>
                <label className="text-neutral-400">Q</label>
                <input
                  type="range"
                  min={0.1}
                  max={1}
                  step={0.05}
                  value={nodeData.quality}
                  onChange={(e) => updateNodeData(id, { quality: Number(e.target.value) })}
                  className="flex-1"
                />
                <span className="text-neutral-500 w-7 text-right">{nodeData.quality.toFixed(2)}</span>
              </>
            )}
          </div>
        </div>

        {/* Output info + run */}
        <div className="shrink-0 flex items-center justify-between gap-2">
          <div className="text-[10px] text-neutral-500">
            {nodeData.outputDimensions
              ? `${nodeData.outputDimensions.width}×${nodeData.outputDimensions.height} · ${formatBytes(nodeData.outputBytes)}`
              : ""}
          </div>
          <button
            onClick={() => regenerateNode(id)}
            disabled={!nodeData.sourceImage || nodeData.status === "loading" || isRunning}
            className="px-3 py-1 bg-blue-600 hover:bg-blue-500 disabled:bg-neutral-700 disabled:text-neutral-500 disabled:cursor-not-allowed rounded text-white text-xs font-medium transition-colors"
          >
            {nodeData.status === "loading" ? "Resizing..." : "Resize"}
          </button>
        </div>

        {nodeData.status === "error" && nodeData.error && (
          <div className="shrink-0 px-2 py-1.5 bg-red-900/30 border border-red-700/50 rounded">
            <p className="text-[10px] text-red-400 break-words">{nodeData.error}</p>
          </div>
        )}
      </div>
    </BaseNode>
  );
}
