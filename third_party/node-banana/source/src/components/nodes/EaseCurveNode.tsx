"use client";
import { CanvasSelect } from "../../leesfield/inputs";


import { useCanvasTranslation } from "../../leesfield/localization";
import { Handle } from "../../leesfield/port-handle";

import React, { useCallback, useEffect } from "react";
import { Position, NodeProps, Node } from "@xyflow/react";
import { BaseNode } from "./BaseNode";
import { HandleLabel } from "./HandleLabel";
import {
  EaseCurveNodeData,
  checkEncoderSupport,
  useShowHandleLabels,
  useVideoAutoplay,
  useVideoBlobUrl,
  useWorkflowStore,
} from "../../leesfield/upstream-node-host";

type EaseCurveNodeType = Node<EaseCurveNodeData, "easeCurve">;

const easingPresets = [
  "linear",
  "easeInQuad",
  "easeOutQuad",
  "easeInOutQuad",
  "easeInCubic",
  "easeOutCubic",
  "easeInOutCubic",
  "easeInSine",
  "easeOutSine",
  "easeInOutSine",
  "easeInExpo",
  "easeOutExpo",
  "easeInOutExpo",
] as const;

const defaultBezier: [number, number, number, number] = [0.42, 0, 0.58, 1];

export function EaseCurveNode({ id, data, selected }: NodeProps<EaseCurveNodeType>) {
  const tc = useCanvasTranslation();
  const nodeData = data;
  const updateNodeData = useWorkflowStore((state) => state.updateNodeData);
  const regenerateNode = useWorkflowStore((state) => state.regenerateNode);
  const isRunning = useWorkflowStore((state) => state.isRunning);
  const writable = useWorkflowStore((state) => state.writable);
  const videoBlobUrl = useVideoBlobUrl(nodeData.outputVideo ?? null);
  const videoAutoplayRef = useVideoAutoplay(id, selected);
  const showLabels = useShowHandleLabels(selected);
  const bezierHandles = Array.isArray(nodeData.bezierHandles) && nodeData.bezierHandles.length === 4
    ? nodeData.bezierHandles.map((value) => typeof value === "number" && Number.isFinite(value) ? value : 0) as [number, number, number, number]
    : defaultBezier;
  const easingPreset = typeof nodeData.easingPreset === "string" ? nodeData.easingPreset : "easeInOutSine";
  const outputDuration = typeof nodeData.outputDuration === "number" && Number.isFinite(nodeData.outputDuration)
    ? nodeData.outputDuration
    : 1.5;
  const settingsInherited = typeof nodeData.inheritedFrom === "string" && nodeData.inheritedFrom.length > 0;

  // Check encoder support on mount
  useEffect(() => {
    if (nodeData.encoderSupported === null) {
      checkEncoderSupport().then((supported) => {
        updateNodeData(id, { encoderSupported: supported });
      });
    }
  }, [id, nodeData.encoderSupported, updateNodeData]);

  // Shared handles rendered in ALL states (4 handles with labels)
  const renderHandles = () => (
    <>
      {/* Video In (target, left, 35%) */}
      <Handle
        type="target"
        position={Position.Left}
        id="video"
        data-handletype="video"
        isConnectable={true}
        style={{ top: "35%" }}
      />
      <HandleLabel label={tc("Video In")} side="target" color="var(--handle-color-video)" top="calc(35% - 7px)" visible={showLabels} />

      {/* Video Out (source, right, 35%) */}
      <Handle
        type="source"
        position={Position.Right}
        id="video"
        data-handletype="video"
        isConnectable={true}
        style={{ top: "35%" }}
      />
      <HandleLabel label={tc("Video Out")} side="source" color="var(--handle-color-video)" top="calc(35% - 7px)" visible={showLabels} />

      {/* Settings In (target, left, 75%) */}
      <Handle
        type="target"
        position={Position.Left}
        id="easeCurve"
        data-handletype="easeCurve"
        isConnectable={true}
        style={{ top: "75%", background: "rgb(190, 242, 100)" }}
      />
      <HandleLabel label={tc("Settings")} side="target" color="rgb(190, 242, 100)" top="calc(75% - 7px)" visible={showLabels} />

      {/* Settings Out (source, right, 75%) */}
      <Handle
        type="source"
        position={Position.Right}
        id="easeCurve"
        data-handletype="easeCurve"
        isConnectable={true}
        style={{ top: "75%", background: "rgb(190, 242, 100)" }}
      />
      <HandleLabel label={tc("Settings")} side="source" color="rgb(190, 242, 100)" top="calc(75% - 7px)" visible={showLabels} />
    </>
  );

  const updateBezierHandle = useCallback((index: number, value: number) => {
    const next = [...bezierHandles] as [number, number, number, number];
    next[index] = Math.max(0, Math.min(1, value));
    updateNodeData(id, { bezierHandles: next, easingPreset: null });
  }, [bezierHandles, id, updateNodeData]);

  const handleRun = useCallback(() => {
    regenerateNode(id);
  }, [id, regenerateNode]);

  // Encoder not supported
  if (nodeData.encoderSupported === false) {
    return (
      <BaseNode
        id={id}
        selected={selected}
        fullBleed
        minWidth={340}
      >
        {renderHandles()}
        <div className="flex-1 flex flex-col items-center justify-center gap-2 text-center px-4">
          <svg className="w-8 h-8 text-neutral-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
          </svg>
          <span className="text-xs text-neutral-400">{tc("Your browser doesn&apos;t support video encoding.")}</span>
          <a
            href="https://discord.com/invite/89Nr6EKkTf"
            target="_blank"
            rel="noopener noreferrer"
            className="text-[10px] text-blue-400 hover:text-blue-300 underline"
          >
            Doesn&apos;t seem right? Message Willie on Discord.
          </a>
        </div>
      </BaseNode>
    );
  }

  // Checking encoder state
  if (nodeData.encoderSupported === null) {
    return (
      <BaseNode
        id={id}
        selected={selected}
        fullBleed
        minWidth={340}
      >
        {renderHandles()}
        <div className="flex-1 flex items-center justify-center">
          <div className="flex items-center gap-2 text-neutral-400">
            <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
            <span className="text-xs">{tc("Checking encoder...")}</span>
          </div>
        </div>
      </BaseNode>
    );
  }

  return (
    <BaseNode
      id={id}
      selected={selected}
      fullBleed
      isExecuting={isRunning}
      hasError={nodeData.status === "error"}
      minWidth={340}
      aspectFitMedia={nodeData.outputVideo}
    >
      {renderHandles()}

      {/* Video preview (full-bleed) */}
      {nodeData.outputVideo ? (
        <div className="relative w-full h-full">
          <video
            ref={videoAutoplayRef}
            src={videoBlobUrl ?? undefined}
            controls
            loop
            muted
            className="absolute inset-0 w-full h-full object-contain rounded-lg"
            playsInline
          />
          <button
            onClick={() => updateNodeData(id, { outputVideo: null, status: "idle" })}
            className="absolute top-1 right-1 w-5 h-5 bg-neutral-900/80 hover:bg-red-600/80 rounded flex items-center justify-center text-neutral-400 hover:text-white transition-colors"
            title={tc("Clear video")}
          >
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      ) : (
        <div className="w-full h-full flex items-center justify-center bg-neutral-900/40 rounded-lg">
          <span className="text-[10px] text-neutral-500">{tc("Run workflow to apply ease curve")}</span>
        </div>
      )}

      {/* Canonical ease-curve settings stay in the actual upstream node body.
          The host adapter maps these display values back to milliseconds and
          the canonical bezier/easing fields before persisting them. */}
      <div className="nodrag nowheel absolute inset-x-2 bottom-2 z-10 grid gap-2 rounded-lg border border-neutral-700 bg-neutral-900/95 p-2 shadow-lg">
        <div className="grid grid-cols-2 gap-2">
          <label className="grid gap-1 text-[10px] uppercase tracking-wider text-neutral-400">{tc("Output (s)")}<input
              type="number"
              aria-label={tc("Output duration")}
              min={0.1}
              max={600}
              step={0.1}
              value={outputDuration}
              disabled={!writable || settingsInherited}
              onChange={(event) => {
                const value = Number(event.target.value);
                if (Number.isFinite(value)) updateNodeData(id, { outputDuration: Math.max(0.1, Math.min(600, value)) });
              }}
              className="nodrag nopan h-7 rounded border border-neutral-700 bg-neutral-800 px-2 text-xs normal-case tracking-normal text-neutral-100 outline-none focus:border-blue-500 disabled:text-neutral-600"
            />
          </label>
          <label className="grid gap-1 text-[10px] uppercase tracking-wider text-neutral-400">{tc("Curve")}<CanvasSelect
              aria-label={tc("Easing preset")}
              value={easingPreset}
              disabled={!writable || settingsInherited}
              onChange={(event) => updateNodeData(id, { easingPreset: event.target.value === "custom" ? null : event.target.value })}
              className="nodrag nopan h-7 rounded border border-neutral-700 bg-neutral-800 px-2 text-xs normal-case tracking-normal text-neutral-100 outline-none focus:border-blue-500 disabled:text-neutral-600"
            >
              {easingPresets.map((preset) => <option key={preset} value={preset}>{preset}</option>)}
              <option value="custom">{tc("Custom bezier")}</option>
            </CanvasSelect>
          </label>
        </div>
        {(easingPreset === "custom" || nodeData.easingPreset == null) && (
          <div className="grid grid-cols-4 gap-1.5">
            {bezierHandles.map((value, index) => (
              <label key={index} className="grid gap-1 text-[9px] uppercase tracking-wider text-neutral-500">
                P{index + 1}
                <input
                  type="number"
                  aria-label={`Bezier ${index + 1}`}
                  min={0}
                  max={1}
                  step={0.01}
                  value={value}
                  disabled={!writable || settingsInherited}
                  onChange={(event) => updateBezierHandle(index, Number(event.target.value))}
                  className="nodrag nopan h-7 min-w-0 rounded border border-neutral-700 bg-neutral-800 px-1 text-xs text-neutral-100 outline-none focus:border-blue-500 disabled:text-neutral-600"
                />
              </label>
            ))}
          </div>
        )}
        <div className="flex items-center justify-end gap-2">
          {settingsInherited && <span className="mr-auto text-[10px] text-neutral-500">{tc("Settings inherited")}</span>}
          <button
            type="button"
            onClick={handleRun}
            disabled={!writable || !nodeData.sourceVideo || isRunning}
            className="nodrag nopan rounded bg-blue-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-blue-500 disabled:cursor-not-allowed disabled:bg-neutral-700 disabled:text-neutral-500"
          >
            {isRunning ? tc("Processing...") : tc("Run")}
          </button>
        </div>
      </div>

      {/* Processing overlay */}
      {nodeData.status === "loading" && (
        <div className="absolute inset-0 bg-neutral-900/70 rounded-lg flex flex-col items-center justify-center gap-2">
          <svg className="w-6 h-6 animate-spin text-white" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
          <span className="text-white text-xs">{tc("Processing...")}{Math.round(nodeData.progress)}%</span>
        </div>
      )}

      {/* Error display */}
      {nodeData.status === "error" && nodeData.error && (
        <div className="absolute bottom-2 left-2 right-2 px-2 py-1.5 bg-red-900/30 border border-red-700/50 rounded">
          <p className="text-[10px] text-red-400 break-words">{nodeData.error}</p>
        </div>
      )}
    </BaseNode>
  );
}
