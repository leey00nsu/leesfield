"use client";
import { CanvasInput, CanvasRange } from "../../leesfield/inputs";


import { useCanvasTranslation } from "../../leesfield/localization";
import { Handle } from "../../leesfield/port-handle";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Position, NodeProps, Node } from "@xyflow/react";
import { BaseNode } from "./BaseNode";
import { HandleLabel } from "./HandleLabel";
import {
  VideoTrimNodeData,
  checkEncoderSupport,
  useShowHandleLabels,
  useVideoAutoplay,
  useVideoBlobUrl,
  useWorkflowStore,
} from "../../leesfield/upstream-node-host";

type VideoTrimNodeType = Node<VideoTrimNodeData, "videoTrim">;

/**
 * Format a time value in seconds as M:SS.s (e.g. "0:02.5")
 */
function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toFixed(1).padStart(4, "0")}`;
}

export function VideoTrimNode({ id, data, selected }: NodeProps<VideoTrimNodeType>) {
  const tc = useCanvasTranslation();
  const nodeData = data;
  const updateNodeData = useWorkflowStore((state) => state.updateNodeData);
  const regenerateNode = useWorkflowStore((state) => state.regenerateNode);
  const isRunning = useWorkflowStore((state) => state.isRunning);
  const writable = useWorkflowStore((state) => state.writable);
  const edges = useWorkflowStore((state) => state.edges);
  const nodes = useWorkflowStore((state) => state.nodes);

  // Track whether user wants to see source or output video
  const [showOutput, setShowOutput] = useState(false);
  const videoAutoplayRef = useVideoAutoplay(id, selected);
  const showLabels = useShowHandleLabels(selected);

  // Keep a ref to endTime so the metadata callback reads fresh state
  const endTimeRef = useRef(nodeData.endTime);
  endTimeRef.current = nodeData.endTime;

  // Check encoder support on mount
  useEffect(() => {
    if (nodeData.encoderSupported === null) {
      checkEncoderSupport().then((supported) => {
        updateNodeData(id, { encoderSupported: supported });
      });
    }
  }, [id, nodeData.encoderSupported, updateNodeData]);

  // Find connected source video from incoming edges
  const sourceVideoUrl = useMemo(() => {
    const incomingEdge = edges.find((e) => e.target === id && e.targetHandle === "video");
    if (!incomingEdge) return null;

    const sourceNode = nodes.find((n) => n.id === incomingEdge.source);
    if (!sourceNode) return null;

    const d = sourceNode.data as Record<string, unknown>;
    // Support common video output fields from generateVideo, videoStitch, easeCurve, videoTrim
    return (d.outputVideo as string | null) ?? null;
  }, [edges, nodes, id]);

  // When source video changes, load metadata to detect duration
  useEffect(() => {
    if (!sourceVideoUrl) return;

    let cancelled = false;
    const abortController = new AbortController();
    let blobUrl: string | null = null;

    const video = document.createElement("video");
    video.preload = "metadata";
    video.onloadedmetadata = () => {
      if (cancelled) return;
      const dur = video.duration;
      if (Number.isFinite(dur) && dur > 0) {
        updateNodeData(id, {
          duration: dur,
          // Only auto-set endTime if it hasn't been set yet (still at default 0)
          endTime: endTimeRef.current === 0 ? dur : endTimeRef.current,
        });
      }
      if (blobUrl) URL.revokeObjectURL(blobUrl);
      blobUrl = null;
    };
    video.onerror = () => {
      if (cancelled) return;
      if (blobUrl) URL.revokeObjectURL(blobUrl);
      blobUrl = null;
    };

    // If the source is a data URL, create a blob URL for metadata loading efficiency
    if (sourceVideoUrl.startsWith("data:")) {
      fetch(sourceVideoUrl, { signal: abortController.signal })
        .then((r) => r.blob())
        .then((blob) => {
          if (cancelled) return;
          blobUrl = URL.createObjectURL(blob);
          video.src = blobUrl;
        })
        .catch(() => {
          if (cancelled) return;
          video.src = sourceVideoUrl;
        });
    } else {
      video.src = sourceVideoUrl;
    }

    return () => {
      cancelled = true;
      abortController.abort();
      video.onloadedmetadata = null;
      video.onerror = null;
      video.src = "";
      if (blobUrl) URL.revokeObjectURL(blobUrl);
    };
  }, [sourceVideoUrl, id, updateNodeData]);

  // Auto-switch to output when trimming completes
  const prevOutputVideoRef = useRef(nodeData.outputVideo);
  useEffect(() => {
    if (!prevOutputVideoRef.current && nodeData.outputVideo) {
      setShowOutput(true);
    }
    prevOutputVideoRef.current = nodeData.outputVideo;
  }, [nodeData.outputVideo]);

  const duration = nodeData.duration ?? 0;
  const startTime = nodeData.startTime;
  const endTime = nodeData.endTime > 0 ? nodeData.endTime : duration;
  const trimDuration = Math.max(0, endTime - startTime);

  const handleTrim = useCallback(() => {
    regenerateNode(id);
  }, [id, regenerateNode]);

  const hasSourceVideo = Boolean(sourceVideoUrl);
  const canTrim = hasSourceVideo && startTime < endTime && endTime > 0;

  // Which video URL to show in preview
  const previewUrl = showOutput && nodeData.outputVideo ? nodeData.outputVideo : sourceVideoUrl;
  const previewBlobUrl = useVideoBlobUrl(previewUrl);

  // Compute slider thumb position percentages for the visual range highlight

  // Shared handles rendered in ALL states
  const renderHandles = () => (
    <>
      {/* Video In (target, left, 50%) */}
      <Handle
        type="target"
        position={Position.Left}
        id="video"
        data-handletype="video"
        isConnectable={true}
        style={{ top: "50%" }}
      />
      <HandleLabel label={tc("Video In")} side="target" color="var(--handle-color-video)" top="calc(50% - 7px)" visible={showLabels} />

      {/* Video Out (source, right, 50%) */}
      <Handle
        type="source"
        position={Position.Right}
        id="video"
        data-handletype="video"
        isConnectable={true}
        style={{ top: "50%" }}
      />
      <HandleLabel label={tc("Video Out")} side="source" color="var(--handle-color-video)" top="calc(50% - 7px)" visible={showLabels} />
    </>
  );

  // Encoder not supported
  if (nodeData.encoderSupported === false) {
    return (
      <BaseNode
        id={id}
        selected={selected}
        contentClassName="flex-1 min-h-0"
        minWidth={360}
        minHeight={360}
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
        minWidth={360}
        minHeight={360}
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
      isExecuting={isRunning}
      hasError={nodeData.status === "error"}
      minWidth={360}
      minHeight={360}
      aspectFitMedia={nodeData.outputVideo}
    >
      {renderHandles()}

      <div className="flex-1 flex flex-col min-h-0 gap-2">
        {/* Video preview area */}
        <div className="flex-1 min-h-0 relative">
          {previewUrl ? (
            <video
              ref={videoAutoplayRef}
              key={previewUrl}
              src={previewBlobUrl ?? undefined}
              controls
              playsInline
              muted
              loop
              className="absolute inset-0 w-full h-full object-contain rounded"
            />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center border border-dashed border-neutral-600 rounded">
              <span className="text-[10px] text-neutral-500">{tc("Connect a video to trim")}</span>
            </div>
          )}

          {/* Source / trimmed toggle (shown when output exists) */}
          {nodeData.outputVideo && sourceVideoUrl && (
            <div className="absolute top-1 left-1 flex gap-1">
              <button
                onClick={() => setShowOutput(false)}
                className={`px-1.5 py-0.5 rounded text-[9px] font-medium transition-colors ${
                  !showOutput
                    ? "bg-neutral-700 text-neutral-200"
                    : "bg-neutral-900/70 text-neutral-500 hover:text-neutral-300"
                }`}
              >{tc("Source")}</button>
              <button
                onClick={() => setShowOutput(true)}
                className={`px-1.5 py-0.5 rounded text-[9px] font-medium transition-colors ${
                  showOutput
                    ? "bg-blue-600 text-white"
                    : "bg-neutral-900/70 text-neutral-500 hover:text-neutral-300"
                }`}
              >{tc("Trimmed")}</button>
            </div>
          )}

          {/* Clear output button */}
          {nodeData.outputVideo && (
            <button
              onClick={() => {
                updateNodeData(id, { outputVideo: null, status: "idle" });
                setShowOutput(false);
              }}
              className="absolute top-1 right-1 w-5 h-5 bg-neutral-900/80 hover:bg-red-600/80 rounded flex items-center justify-center text-neutral-400 hover:text-white transition-colors"
              title={tc("Clear trimmed video")}
            >
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>

        {/* Trim controls (only shown when we have a duration) */}
        {hasSourceVideo && (
          <div className="shrink-0 flex flex-col gap-1.5 px-1">
            {/* Dual range slider */}
            <CanvasRange disabled={!writable || nodeData.status === "loading" || isRunning} value={[startTime,endTime]} min={0} max={duration > 0 ? duration : 100} step={0.1} labels={[tc("Start"),tc("End")]} onValueChange={([start,end])=>updateNodeData(id,{startTime:Math.max(0,Math.min(start,end-0.1)),endTime:Math.max(end,start+0.1)})} />

            {/* Time labels */}
            <div className="flex items-center justify-between">
              <div className="flex flex-col items-start">
                <span className="text-[10px] text-neutral-400">{tc("Start")}</span>
                <span className="text-[11px] text-neutral-200 font-mono">{formatTime(startTime)}</span>
              </div>
              <div className="flex flex-col items-center">
                <span className="text-[10px] text-neutral-400">{tc("Duration")}</span>
                <span className="text-[11px] text-neutral-200 font-mono">{formatTime(trimDuration)}</span>
              </div>
              <div className="flex flex-col items-end">
                <span className="text-[10px] text-neutral-400">{tc("End")}</span>
                <span className="text-[11px] text-neutral-200 font-mono">{formatTime(endTime)}</span>
              </div>
            </div>
          </div>
        )}

        {/* Trim button */}
        <div className="shrink-0 flex items-center justify-end gap-3 px-1">
          <label className="nodrag flex items-center gap-1.5 text-[10px] text-neutral-400">
            <CanvasInput
              type="checkbox"
              aria-label={tc("Strip audio")}
              checked={nodeData.stripAudio === true}
              disabled={!writable || nodeData.status === "loading" || isRunning}
              onChange={(event) => updateNodeData(id, { stripAudio: event.target.checked })}
              className="nodrag h-3 w-3 accent-blue-500"
            />{tc("Strip audio")}</label>
          <button
            onClick={handleTrim}
            disabled={!canTrim || nodeData.status === "loading" || isRunning}
            className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 disabled:bg-neutral-700 disabled:text-neutral-500 disabled:cursor-not-allowed rounded text-white text-xs font-medium transition-colors"
          >
            {nodeData.status === "loading" ? tc("Processing...") : tc("Trim")}
          </button>
        </div>

        {/* Processing overlay */}
        {nodeData.status === "loading" && (
          <div className="absolute inset-0 bg-neutral-900/70 rounded flex flex-col items-center justify-center gap-2">
            <svg className="w-6 h-6 animate-spin text-white" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
            <span className="text-white text-xs">{tc("Processing...")}{Math.round(nodeData.progress)}%</span>
          </div>
        )}

        {/* Error display */}
        {nodeData.status === "error" && nodeData.error && (
          <div className="shrink-0 px-2 py-1.5 bg-red-900/30 border border-red-700/50 rounded">
            <p className="text-[10px] text-red-400 break-words">{nodeData.error}</p>
          </div>
        )}
      </div>
    </BaseNode>
  );
}
