"use client";

import { useCallback, useState, useEffect, useMemo, useRef } from "react";
import { Handle, Position, NodeProps, Node } from "@xyflow/react";
import { BaseNode } from "./BaseNode";
import { useWorkflowStore } from "@/store/workflowStore";
import { SplitGridNodeData } from "@/types";
import { SplitGridTemplateModal } from "../splitgrid/SplitGridTemplateModal";
import {
  clampGridDimension,
  getSplitGridCells,
  getSplitGridTemplate,
  needsMaterialization,
  resolveGridOffsets,
  gridFractions,
  MIN_GRID_DIMENSION,
  MAX_GRID_DIMENSION,
  MIN_SLICE_GAP,
} from "@/store/utils/splitGridTemplate";
import { useAdaptiveImageSrc } from "@/hooks/useAdaptiveImageSrc";
import { useShowHandleLabels } from "@/hooks/useShowHandleLabels";
import { HandleLabel } from "./HandleLabel";

type SplitGridNodeType = Node<SplitGridNodeData, "splitGrid">;

interface GridDimFieldProps {
  label: string;
  value: number;
  onChange: (value: number) => void;
  disabled?: boolean;
}

function GridDimField({ label, value, onChange, disabled }: GridDimFieldProps) {
  const [draft, setDraft] = useState<string | null>(null);

  const commit = useCallback(
    (raw: string) => {
      setDraft(null);
      const parsed = parseInt(raw, 10);
      if (!Number.isNaN(parsed)) onChange(clampGridDimension(parsed));
    },
    [onChange]
  );

  return (
    <div>
      <label className="block text-[10px] uppercase tracking-wider text-neutral-500 mb-1">
        {label}
      </label>
      <div className="flex items-stretch bg-neutral-900 border border-neutral-700 rounded-md overflow-hidden focus-within:border-neutral-500 transition-colors">
        <button
          onClick={() => onChange(clampGridDimension(value - 1))}
          disabled={disabled || value <= MIN_GRID_DIMENSION}
          className="nodrag nopan px-2 text-neutral-400 hover:text-neutral-100 hover:bg-neutral-800 disabled:text-neutral-700 disabled:hover:bg-transparent transition-colors"
          aria-label={`Decrease ${label.toLowerCase()}`}
        >
          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14" />
          </svg>
        </button>
        <input
          type="text"
          inputMode="numeric"
          value={draft ?? String(value)}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={(event) => commit(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") (event.target as HTMLInputElement).blur();
          }}
          disabled={disabled}
          className="nodrag nopan w-full min-w-0 py-1.5 bg-transparent text-center text-sm font-medium text-neutral-100 focus:outline-none disabled:text-neutral-600"
          aria-label={label}
        />
        <button
          onClick={() => onChange(clampGridDimension(value + 1))}
          disabled={disabled || value >= MAX_GRID_DIMENSION}
          className="nodrag nopan px-2 text-neutral-400 hover:text-neutral-100 hover:bg-neutral-800 disabled:text-neutral-700 disabled:hover:bg-transparent transition-colors"
          aria-label={`Increase ${label.toLowerCase()}`}
        >
          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 5v14M5 12h14" />
          </svg>
        </button>
      </div>
    </div>
  );
}

export function SplitGridNode({ id, data, selected }: NodeProps<SplitGridNodeType>) {
  const nodeData = data;
  const adaptiveSourceImage = useAdaptiveImageSrc(nodeData.sourceImage, id);
  const updateNodeData = useWorkflowStore((state) => state.updateNodeData);
  const regenerateNode = useWorkflowStore((state) => state.regenerateNode);
  const isRunning = useWorkflowStore((state) => state.isRunning);
  const getConnectedInputs = useWorkflowStore((state) => state.getConnectedInputs);
  const edges = useWorkflowStore((state) => state.edges);
  const nodes = useWorkflowStore((state) => state.nodes);
  const [showEditor, setShowEditor] = useState(false);
  const showLabels = useShowHandleLabels(selected);

  const gridRows = clampGridDimension(nodeData.gridRows);
  const gridCols = clampGridDimension(nodeData.gridCols);
  const cellCount = gridRows * gridCols;

  // Size the grid overlay to the image's object-contain rectangle so the grid
  // lines track the actual image, not the letterboxed preview container.
  const previewRef = useRef<HTMLDivElement>(null);
  const [imageAspect, setImageAspect] = useState<number | null>(null);
  const [fittedSize, setFittedSize] = useState<{ width: number; height: number } | null>(null);

  // A new source image invalidates the measured aspect until it re-loads.
  useEffect(() => {
    setImageAspect(null);
    setFittedSize(null);
  }, [adaptiveSourceImage]);

  useEffect(() => {
    const el = previewRef.current;
    if (!el || imageAspect == null || typeof ResizeObserver === "undefined") return;
    const measure = () => {
      const cw = el.clientWidth;
      const ch = el.clientHeight;
      if (cw === 0 || ch === 0) return;
      const containerAspect = cw / ch;
      const wide = imageAspect > containerAspect;
      setFittedSize({
        width: wide ? cw : ch * imageAspect,
        height: wide ? cw / imageAspect : ch,
      });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [imageAspect]);

  // Reactively track the connected source image
  const hasIncomingImageConnection = useMemo(() => {
    return edges.some((edge) => edge.target === id && edge.targetHandle === "image");
  }, [edges, id]);

  const connectedSourceImage = useMemo(() => {
    if (!hasIncomingImageConnection) return null;
    const { images } = getConnectedInputs(id);
    return images[0] || null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasIncomingImageConnection, id, getConnectedInputs, nodes]);

  useEffect(() => {
    if (connectedSourceImage !== nodeData.sourceImage) {
      updateNodeData(id, { sourceImage: connectedSourceImage });
    }
  }, [connectedSourceImage, id, updateNodeData, nodeData.sourceImage]);

  const templateNodeCount = getSplitGridTemplate(nodeData).nodes.length;
  const cells = getSplitGridCells(nodeData);
  const cellsAreStale = useMemo(() => {
    const existingIds = new Set(nodes.map((node) => node.id));
    const existingRouterNodeIds = new Set(
      nodes.filter((node) => node.type === "router").map((node) => node.id)
    );
    return needsMaterialization(nodeData, existingIds, { existingRouterNodeIds });
  }, [nodeData, nodes]);

  // Custom interior line positions (from dragging); fall back to uniform.
  const colOffsets = useMemo(
    () => resolveGridOffsets(gridCols, nodeData.colOffsets),
    [gridCols, nodeData.colOffsets]
  );
  const rowOffsets = useMemo(
    () => resolveGridOffsets(gridRows, nodeData.rowOffsets),
    [gridRows, nodeData.rowOffsets]
  );

  // Live positions while dragging a grid line (null when idle).
  const innerRef = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<{ axis: "col" | "row"; offsets: number[] } | null>(null);
  const activeColOffsets = drag?.axis === "col" ? drag.offsets : colOffsets;
  const activeRowOffsets = drag?.axis === "row" ? drag.offsets : rowOffsets;
  const colFractions = gridFractions(gridCols, activeColOffsets);
  const rowFractions = gridFractions(gridRows, activeRowOffsets);

  const startLineDrag = useCallback(
    (axis: "col" | "row", index: number, e: React.PointerEvent) => {
      e.stopPropagation();
      e.preventDefault();
      const inner = innerRef.current;
      if (!inner) return;
      const base = axis === "col" ? colOffsets : rowOffsets;
      let working = [...base];
      setDrag({ axis, offsets: working });

      const onMove = (ev: PointerEvent) => {
        const rect = inner.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) return;
        const norm =
          axis === "col"
            ? (ev.clientX - rect.left) / rect.width
            : (ev.clientY - rect.top) / rect.height;
        const lower = index > 0 ? working[index - 1] : 0;
        const upper = index < working.length - 1 ? working[index + 1] : 1;
        const clamped = Math.min(upper - MIN_SLICE_GAP, Math.max(lower + MIN_SLICE_GAP, norm));
        working = working.map((v, i) => (i === index ? clamped : v));
        setDrag({ axis, offsets: working });
      };
      const onUp = () => {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        setDrag(null);
        updateNodeData(id, axis === "col" ? { colOffsets: working } : { rowOffsets: working });
      };
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
    },
    [colOffsets, rowOffsets, id, updateNodeData]
  );

  const handleRowsChange = useCallback(
    (value: number) => {
      if (value === gridRows) return;
      // Row count changed: custom row lines no longer fit — reset to uniform.
      updateNodeData(id, { gridRows: value, rowOffsets: undefined });
    },
    [id, updateNodeData, gridRows]
  );
  const handleColsChange = useCallback(
    (value: number) => {
      if (value === gridCols) return;
      updateNodeData(id, { gridCols: value, colOffsets: undefined });
    },
    [id, updateNodeData, gridCols]
  );

  const handleSplit = useCallback(() => {
    regenerateNode(id);
  }, [id, regenerateNode]);

  const statusText = nodeData.status === "error"
    ? nodeData.error || "Error"
    : cells.length > 0
      ? cellsAreStale
        ? "Cells out of date — Split rebuilds"
        : `${cells.length} cell group${cells.length === 1 ? "" : "s"}`
      : "Split creates a group per cell";

  return (
    <>
      <BaseNode
        id={id}
        selected={selected}
        hasError={nodeData.status === "error"}
        minWidth={260}
        minHeight={340}
      >
        {/* Image input handle */}
        <Handle
          type="target"
          position={Position.Left}
          id="image"
          data-handletype="image"
          style={{ zIndex: 10 }}
        />
        <HandleLabel label="Image" side="target" color="var(--handle-color-image)" visible={showLabels} />

        {/* Reference output handle for visual links to cell nodes */}
        <Handle
          type="source"
          position={Position.Right}
          id="reference"
          data-handletype="reference"
          className="!bg-gray-500"
          style={{ zIndex: 10 }}
        />
        <HandleLabel label="Ref" side="source" color="#6b7280" visible={showLabels} />

        <div className="flex flex-col gap-2 pt-3 h-full min-h-0">
          {/* Rows / Columns fields */}
          <div className="grid grid-cols-2 gap-2">
            <GridDimField label="Rows" value={gridRows} onChange={handleRowsChange} disabled={isRunning} />
            <GridDimField label="Columns" value={gridCols} onChange={handleColsChange} disabled={isRunning} />
          </div>

          {/* Cell node set editor */}
          <button
            onClick={() => setShowEditor(true)}
            disabled={isRunning}
            title={isRunning ? "Wait for the current run to finish" : undefined}
            className="nodrag nopan w-full flex items-center gap-2 px-2.5 py-2 bg-neutral-900 border border-neutral-700 hover:border-neutral-500 rounded-md text-neutral-300 hover:text-neutral-100 disabled:text-neutral-600 disabled:hover:border-neutral-700 disabled:cursor-not-allowed transition-colors"
          >
            <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 16.875h3.375m0 0h3.375m-3.375 0V13.5m0 3.375v3.375M6 10.5h2.25a2.25 2.25 0 002.25-2.25V6a2.25 2.25 0 00-2.25-2.25H6A2.25 2.25 0 003.75 6v2.25A2.25 2.25 0 006 10.5zm0 9.75h2.25A2.25 2.25 0 0010.5 18v-2.25a2.25 2.25 0 00-2.25-2.25H6a2.25 2.25 0 00-2.25 2.25V18A2.25 2.25 0 006 20.25zm9.75-9.75H18a2.25 2.25 0 002.25-2.25V6A2.25 2.25 0 0018 3.75h-2.25A2.25 2.25 0 0013.5 6v2.25a2.25 2.25 0 002.25 2.25z" />
            </svg>
            <span className="text-xs font-medium">Cell nodes</span>
            <span className="ml-auto text-[10px] px-1.5 py-0.5 rounded bg-neutral-800 border border-neutral-700 text-neutral-400">
              {templateNodeCount} / cell
            </span>
          </button>

          {/* Preview with grid overlay */}
          <div
            ref={previewRef}
            className="relative flex-1 min-h-[96px] rounded-md overflow-hidden bg-neutral-900/40 border border-neutral-700/40 flex items-center justify-center"
          >
            {nodeData.sourceImage ? (
              <div
                ref={innerRef}
                className="relative"
                style={
                  fittedSize
                    ? { width: fittedSize.width, height: fittedSize.height }
                    : { width: "100%", height: "100%" }
                }
              >
                <img
                  src={adaptiveSourceImage ?? undefined}
                  alt="Source grid"
                  className="w-full h-full object-contain block select-none"
                  draggable={false}
                  onLoad={(e) => {
                    const { naturalWidth, naturalHeight } = e.currentTarget;
                    if (naturalWidth > 0 && naturalHeight > 0) {
                      setImageAspect(naturalWidth / naturalHeight);
                    }
                  }}
                />
                {/* Cell outlines (non-uniform when lines have been dragged) */}
                <div
                  className="absolute inset-0 pointer-events-none"
                  style={{
                    display: "grid",
                    gridTemplateColumns: colFractions.map((f) => `${f}fr`).join(" "),
                    gridTemplateRows: rowFractions.map((f) => `${f}fr`).join(" "),
                  }}
                >
                  {Array.from({ length: cellCount }).map((_, index) => (
                    <div key={index} className="border border-blue-400/50" />
                  ))}
                </div>
                {/* Draggable interior grid lines */}
                {!isRunning && (
                  <>
                    {activeColOffsets.map((offset, index) => (
                      <div
                        key={`v-${index}`}
                        className="nodrag nopan group absolute top-0 bottom-0"
                        style={{
                          left: `${offset * 100}%`,
                          width: 12,
                          transform: "translateX(-50%)",
                          cursor: "col-resize",
                        }}
                        onPointerDown={(e) => startLineDrag("col", index, e)}
                      >
                        <div
                          className={`absolute inset-y-0 left-1/2 -translate-x-1/2 transition-all ${
                            drag?.axis === "col"
                              ? "w-[2px] bg-blue-300"
                              : "w-px bg-blue-400/70 group-hover:w-[2px] group-hover:bg-blue-300"
                          }`}
                        />
                      </div>
                    ))}
                    {activeRowOffsets.map((offset, index) => (
                      <div
                        key={`h-${index}`}
                        className="nodrag nopan group absolute left-0 right-0"
                        style={{
                          top: `${offset * 100}%`,
                          height: 12,
                          transform: "translateY(-50%)",
                          cursor: "row-resize",
                        }}
                        onPointerDown={(e) => startLineDrag("row", index, e)}
                      >
                        <div
                          className={`absolute inset-x-0 top-1/2 -translate-y-1/2 transition-all ${
                            drag?.axis === "row"
                              ? "h-[2px] bg-blue-300"
                              : "h-px bg-blue-400/70 group-hover:h-[2px] group-hover:bg-blue-300"
                          }`}
                        />
                      </div>
                    ))}
                  </>
                )}
              </div>
            ) : (
              <div className="w-full h-full flex flex-col items-center justify-center gap-1">
                <svg className="w-5 h-5 text-neutral-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z" />
                </svg>
                <span className="text-neutral-500 text-[10px]">Connect image</span>
              </div>
            )}
            {nodeData.status === "loading" && (
              <div className="absolute inset-0 bg-neutral-900/70 flex items-center justify-center">
                <svg className="w-6 h-6 animate-spin text-white" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
              </div>
            )}
          </div>

          {/* Status + split */}
          <div className="flex items-center justify-between gap-2">
            <span
              className={`text-[10px] truncate ${
                nodeData.status === "error"
                  ? "text-red-400"
                  : cellsAreStale && cells.length > 0
                    ? "text-amber-400"
                    : "text-neutral-500"
              }`}
              title={statusText}
            >
              {statusText}
            </span>
            <button
              onClick={handleSplit}
              disabled={isRunning || !nodeData.sourceImage}
              className="nodrag nopan shrink-0 px-2.5 py-1 text-[10px] border border-white hover:bg-white hover:text-neutral-900 disabled:border-neutral-600 disabled:text-neutral-600 disabled:cursor-not-allowed text-white rounded transition-colors"
              title={!nodeData.sourceImage ? "Connect an image first" : `Split into ${gridRows}×${gridCols}`}
            >
              Split {gridRows}×{gridCols}
            </button>
          </div>
        </div>
      </BaseNode>

      {/* Cell template editor */}
      {showEditor && (
        <SplitGridTemplateModal
          nodeId={id}
          nodeData={nodeData}
          onClose={() => setShowEditor(false)}
        />
      )}
    </>
  );
}
