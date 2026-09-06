"use client";

import React, { useCallback, useMemo, useRef, useState } from "react";

import {
  IDENTITY_CURVE,
  addCurvePoint,
  curvePath,
  isIdentityCurve,
  moveCurvePoint,
  normalizeCurve,
  removeCurvePoint,
} from "@/lib/comfy/curve";
import type { ComfyCurve } from "@/lib/comfy/types";

interface ComfyCurveEditorProps {
  label: string;
  value: unknown;
  onChange: (curve: ComfyCurve) => void;
  description?: string;
}

const WIDTH = 240;
const HEIGHT = 160;
/** Grid lines at each quarter — enough to read a curve, few enough to stay quiet. */
const DIVISIONS = 4;

/**
 * A tone-curve control for ComfyUI's `CURVE` widget.
 *
 * Drag a point to move it, click empty graph to add one, double-click or
 * right-click a point to remove it. The two endpoints are x-locked because they
 * anchor the input range.
 *
 * Everything is `nodrag`/`nopan`/`nowheel`: without that React Flow claims the
 * pointer and the canvas pans instead of the point moving.
 */
function ComfyCurveEditorInner({ label, value, onChange, description }: ComfyCurveEditorProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [dragging, setDragging] = useState<number | null>(null);
  const curve = useMemo(() => normalizeCurve(value), [value]);
  const path = useMemo(() => curvePath(curve, WIDTH, HEIGHT), [curve]);

  /** Pointer position in curve space (0–1, y up). */
  const toCurveSpace = useCallback((event: React.PointerEvent | React.MouseEvent) => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0 || rect.height === 0) return null;
    return {
      x: (event.clientX - rect.left) / rect.width,
      y: 1 - (event.clientY - rect.top) / rect.height,
    };
  }, []);

  const handlePointerMove = useCallback(
    (event: React.PointerEvent) => {
      if (dragging === null) return;
      const at = toCurveSpace(event);
      if (!at) return;
      onChange(moveCurvePoint(curve, dragging, at.x, at.y));
    },
    [dragging, curve, onChange, toCurveSpace]
  );

  const endDrag = useCallback((event: React.PointerEvent) => {
    setDragging(null);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }, []);

  const handleBackgroundClick = useCallback(
    (event: React.MouseEvent) => {
      // A click that ends a drag must not also drop a new point.
      if (dragging !== null) return;
      const at = toCurveSpace(event);
      if (!at) return;
      onChange(addCurvePoint(curve, at.x, at.y));
    },
    [dragging, curve, onChange, toCurveSpace]
  );

  const grid = useMemo(
    () =>
      Array.from({ length: DIVISIONS - 1 }, (_, i) => ((i + 1) / DIVISIONS) * 100).map((percent) => ({
        percent,
        x: (percent / 100) * WIDTH,
        y: (percent / 100) * HEIGHT,
      })),
    []
  );

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between gap-2">
        <label className="text-[11px] text-neutral-400" title={description}>
          {label}
        </label>
        <button
          type="button"
          title="Reset this curve"
          disabled={isIdentityCurve(curve)}
          onClick={() => onChange(IDENTITY_CURVE)}
          className="nodrag nopan text-[9px] text-neutral-500 hover:text-neutral-200 disabled:opacity-30 disabled:hover:text-neutral-500 transition-colors"
        >
          Reset
        </button>
      </div>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        width={WIDTH}
        height={HEIGHT}
        className="nodrag nopan nowheel rounded-md bg-[#1a1a1a] touch-none select-none"
        onPointerMove={handlePointerMove}
        onPointerUp={endDrag}
        onPointerLeave={endDrag}
        onClick={handleBackgroundClick}
        onContextMenu={(e) => e.preventDefault()}
      >
        {grid.map((line) => (
          <React.Fragment key={line.percent}>
            <line x1={line.x} y1={0} x2={line.x} y2={HEIGHT} stroke="#2e2e2e" strokeWidth={1} />
            <line x1={0} y1={line.y} x2={WIDTH} y2={line.y} stroke="#2e2e2e" strokeWidth={1} />
          </React.Fragment>
        ))}
        {/* The untouched response, for comparison against the curve. */}
        <line
          x1={0}
          y1={HEIGHT}
          x2={WIDTH}
          y2={0}
          stroke="#3a3a3a"
          strokeWidth={1}
          strokeDasharray="3 3"
        />
        <path d={path} fill="none" stroke="#e5e5e5" strokeWidth={1.75} strokeLinecap="round" />
        {curve.points.map((point, index) => {
          const cx = point[0] * WIDTH;
          const cy = (1 - point[1]) * HEIGHT;
          const locked = index === 0 || index === curve.points.length - 1;
          return (
            <circle
              // By index alone. Keying on the moving x remounted the circle on
              // every drag frame, and the browser drops pointer capture with
              // the element it was set on — so a drag stopped tracking the
              // moment the pointer left the SVG. The point count only changes
              // on add and remove, where a remount is what should happen.
              key={index}
              cx={cx}
              cy={cy}
              r={dragging === index ? 6 : 4.5}
              fill={dragging === index ? "#ffffff" : "#d4d4d4"}
              stroke="#1a1a1a"
              strokeWidth={1.5}
              className="cursor-grab"
              onPointerDown={(e) => {
                e.stopPropagation();
                setDragging(index);
                e.currentTarget.setPointerCapture(e.pointerId);
              }}
              onClick={(e) => e.stopPropagation()}
              onDoubleClick={(e) => {
                e.stopPropagation();
                onChange(removeCurvePoint(curve, index));
              }}
              onContextMenu={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onChange(removeCurvePoint(curve, index));
              }}
            >
              {locked && <title>Endpoint — moves vertically only</title>}
            </circle>
          );
        })}
      </svg>
      <span className="text-[9px] text-neutral-600">
        Click to add · drag to shape · double-click a point to remove
      </span>
    </div>
  );
}

export const ComfyCurveEditor = React.memo(ComfyCurveEditorInner);
