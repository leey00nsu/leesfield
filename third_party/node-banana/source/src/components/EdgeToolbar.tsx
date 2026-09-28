"use client";

import { useCanvasTranslation } from "../leesfield/localization";

import { useWorkflowStore } from "../leesfield/upstream-node-host";
import type { WorkflowEdgeData } from "../leesfield/upstream-node-host";
import { useMemo, useEffect, useState, useRef } from "react";

export type EdgeToolbarHostedEdge = {
  id: string;
  source?: string;
  target?: string;
  sourceHandle?: string | null;
  targetHandle?: string | null;
  data?: WorkflowEdgeData & Record<string, unknown>;
};

export type EdgeToolbarHostedProps = {
  edge: EdgeToolbarHostedEdge | null;
  position: { x: number; y: number } | null;
  writable?: boolean;
  ariaLabel?: string;
  onTogglePause: (edgeId: string) => void;
  onDelete: (edgeId: string) => void;
  onLoopCountChange?: (edgeId: string, delta: number) => void;
};

export type EdgeToolbarProps = { hosted?: EdgeToolbarHostedProps };

export function EdgeToolbar({ hosted }: EdgeToolbarProps = {}) {
  const tc = useCanvasTranslation();
  const { edges, toggleEdgePause, removeEdge, setLoopCount } = useWorkflowStore();
  const [clickPosition, setClickPosition] = useState<{ x: number; y: number } | null>(null);
  const previousSelectedEdgeId = useRef<string | null>(null);

  const selectedEdge = useMemo(
    () => hosted?.edge ?? edges.find((edge) => edge.selected) ?? null,
    [edges, hosted?.edge]
  );

  // Helper function to compute the image connection sequence number
  const getImageSequenceNumber = (edge: typeof selectedEdge): number | null => {
    if (!edge) return null;

    // Only show for image connections
    const sourceHandle = edge.sourceHandle;
    const targetHandle = edge.targetHandle;
    const isImageConnection =
      (sourceHandle === "image" || sourceHandle?.startsWith("image-")) ||
      (targetHandle === "image" || targetHandle?.startsWith("image-"));

    if (!isImageConnection) return null;

    // Find all image edges going to the same target + target handle
    const siblingEdges = edges.filter(
      (e) => e.target === edge.target && e.targetHandle === edge.targetHandle
    );

    // If only one connection, no need for numbering
    if (siblingEdges.length <= 1) return null;

    // Sort by createdAt timestamp (fallback to edge ID for legacy edges without timestamp)
    const sorted = [...siblingEdges].sort((a, b) => {
      const timeA = (a.data as WorkflowEdgeData)?.createdAt || 0;
      const timeB = (b.data as WorkflowEdgeData)?.createdAt || 0;
      if (timeA !== timeB) return timeA - timeB;
      return a.id.localeCompare(b.id);
    });

    const index = sorted.findIndex((e) => e.id === edge.id);
    return index >= 0 ? index + 1 : null;
  };

  const sequenceNumber = getImageSequenceNumber(selectedEdge);

  // Track mouse position when edge selection changes
  useEffect(() => {
    if (hosted) {
      setClickPosition(hosted.position);
      previousSelectedEdgeId.current = hosted.edge?.id ?? null;
      return;
    }
    const handleMouseDown = (e: MouseEvent) => {
      // Check if clicking on an edge
      const target = e.target as Element;
      if (target.closest('.react-flow__edge')) {
        setClickPosition({ x: e.clientX, y: e.clientY - 40 }); // 40px above click
      }
    };

    document.addEventListener('mousedown', handleMouseDown);
    return () => document.removeEventListener('mousedown', handleMouseDown);
  }, [hosted]);

  // Reset click position when edge is deselected
  useEffect(() => {
    if (hosted) return;
    if (!selectedEdge && previousSelectedEdgeId.current) {
      setClickPosition(null);
    }
    previousSelectedEdgeId.current = selectedEdge?.id || null;
  }, [hosted, selectedEdge]);

  const toolbarPosition = hosted ? hosted.position : clickPosition;

  const handleTogglePause = () => {
    if (selectedEdge) {
      if (hosted) hosted.onTogglePause(selectedEdge.id);
      else toggleEdgePause(selectedEdge.id);
    }
  };

  const handleLoopCountChange = (delta: number) => {
    if (selectedEdge) {
      if (hosted) hosted.onLoopCountChange?.(selectedEdge.id, delta);
      else setLoopCount(selectedEdge.id, loopCount + delta);
    }
  };

  const handleDelete = () => {
    if (selectedEdge) {
      if (hosted) hosted.onDelete(selectedEdge.id);
      else removeEdge(selectedEdge.id);
    }
  };

  if (!toolbarPosition || !selectedEdge) return null;

  const hasPause = selectedEdge.data?.hasPause;
  const isLoop = selectedEdge.data?.isLoop;
  const loopCount = selectedEdge.data?.loopCount ?? 3;

  return (
    <div
      className="fixed z-[100] flex items-center gap-1 bg-neutral-800 border border-neutral-600 rounded-lg shadow-xl p-1 node-banana-runtime__edge-toolbar"
      role="toolbar"
      aria-label={hosted?.ariaLabel ?? "Selected edge"}
      data-node-banana-component="EdgeToolbar"
      style={{
        left: toolbarPosition.x,
        top: toolbarPosition.y,
        transform: "translateX(-50%)",
      }}
    >
      {sequenceNumber !== null && (
        <span className="text-[10px] font-medium text-neutral-300 px-2 border-r border-neutral-600">{tc("Image")}{sequenceNumber}
        </span>
      )}
      {isLoop && (
        <>
          <span className="text-[10px] font-medium text-fuchsia-300 px-1.5">{tc("Loop")}</span>
          <button
            type="button"
            onClick={() => handleLoopCountChange(-1)}
            disabled={loopCount <= 1}
            className="p-1 rounded hover:bg-neutral-700 text-fuchsia-300 hover:text-fuchsia-100 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
            title={tc("Decrease loop count")}
          >
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" d="M5 12h14" />
            </svg>
          </button>
          <span className="text-[11px] font-mono text-fuchsia-100 min-w-[20px] text-center">{loopCount}</span>
          <button
            type="button"
            onClick={() => handleLoopCountChange(1)}
            disabled={loopCount >= 100}
            className="p-1 rounded hover:bg-neutral-700 text-fuchsia-300 hover:text-fuchsia-100 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
            title={tc("Increase loop count")}
          >
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" d="M12 5v14M5 12h14" />
            </svg>
          </button>
          <div className="w-px h-4 bg-neutral-600" />
        </>
      )}
      {!isLoop && (
        <button
          onClick={handleTogglePause}
          type="button"
          disabled={hosted?.writable === false}
          aria-label={hasPause ? tc("Remove pause") : tc("Add pause")}
        className={`p-1.5 rounded hover:bg-neutral-700 transition-colors ${
          hasPause
            ? "text-amber-400 hover:text-amber-300"
            : "text-neutral-400 hover:text-neutral-100"
        }`}
        title={hasPause ? tc("Remove pause") : tc("Add pause")}
      >
        {hasPause ? (
          // Play icon (resume)
          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
            <path d="M8 5v14l11-7z" />
          </svg>
        ) : (
          // Pause icon
          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
            <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
          </svg>
        )}
      </button>
      )}
      <button
        onClick={handleDelete}
        type="button"
        disabled={hosted?.writable === false}
        aria-label={tc("Delete edge")}
        className="p-1.5 rounded hover:bg-neutral-700 text-neutral-400 hover:text-red-400 transition-colors"
        title={tc("Delete")}
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0"
          />
        </svg>
      </button>
    </div>
  );
}
