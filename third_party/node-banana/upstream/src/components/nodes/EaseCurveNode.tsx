"use client";

import React, { useEffect } from "react";
import { Handle, Position, NodeProps, Node } from "@xyflow/react";
import { BaseNode } from "./BaseNode";
import { useWorkflowStore } from "@/store/workflowStore";
import { EaseCurveNodeData } from "@/types";
import { checkEncoderSupport } from "@/hooks/useStitchVideos";
import { useVideoBlobUrl } from "@/hooks/useVideoBlobUrl";
import { useVideoAutoplay } from "@/hooks/useVideoAutoplay";
import { useShowHandleLabels } from "@/hooks/useShowHandleLabels";
import { HandleLabel } from "./HandleLabel";

type EaseCurveNodeType = Node<EaseCurveNodeData, "easeCurve">;


export function EaseCurveNode({ id, data, selected }: NodeProps<EaseCurveNodeType>) {
  const nodeData = data;
  const updateNodeData = useWorkflowStore((state) => state.updateNodeData);
  const isRunning = useWorkflowStore((state) => state.isRunning);
  const videoBlobUrl = useVideoBlobUrl(nodeData.outputVideo ?? null);
  const videoAutoplayRef = useVideoAutoplay(id, selected);
  const showLabels = useShowHandleLabels(selected);

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
      <HandleLabel label="Video In" side="target" color="var(--handle-color-video)" top="calc(35% - 7px)" visible={showLabels} />

      {/* Video Out (source, right, 35%) */}
      <Handle
        type="source"
        position={Position.Right}
        id="video"
        data-handletype="video"
        isConnectable={true}
        style={{ top: "35%" }}
      />
      <HandleLabel label="Video Out" side="source" color="var(--handle-color-video)" top="calc(35% - 7px)" visible={showLabels} />

      {/* Settings In (target, left, 75%) */}
      <Handle
        type="target"
        position={Position.Left}
        id="easeCurve"
        data-handletype="easeCurve"
        isConnectable={true}
        style={{ top: "75%", background: "rgb(190, 242, 100)" }}
      />
      <HandleLabel label="Settings" side="target" color="rgb(190, 242, 100)" top="calc(75% - 7px)" visible={showLabels} />

      {/* Settings Out (source, right, 75%) */}
      <Handle
        type="source"
        position={Position.Right}
        id="easeCurve"
        data-handletype="easeCurve"
        isConnectable={true}
        style={{ top: "75%", background: "rgb(190, 242, 100)" }}
      />
      <HandleLabel label="Settings" side="source" color="rgb(190, 242, 100)" top="calc(75% - 7px)" visible={showLabels} />
    </>
  );

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
          <span className="text-xs text-neutral-400">
            Your browser doesn&apos;t support video encoding.
          </span>
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
            <span className="text-xs">Checking encoder...</span>
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
            title="Clear video"
          >
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      ) : (
        <div className="w-full h-full flex items-center justify-center bg-neutral-900/40 rounded-lg">
          <span className="text-[10px] text-neutral-500">Run workflow to apply ease curve</span>
        </div>
      )}

      {/* Processing overlay */}
      {nodeData.status === "loading" && (
        <div className="absolute inset-0 bg-neutral-900/70 rounded-lg flex flex-col items-center justify-center gap-2">
          <svg className="w-6 h-6 animate-spin text-white" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
          <span className="text-white text-xs">Processing... {Math.round(nodeData.progress)}%</span>
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
