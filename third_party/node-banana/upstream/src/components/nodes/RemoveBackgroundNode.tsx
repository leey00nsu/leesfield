"use client";

import { useMemo } from "react";
import { Handle, Position, NodeProps, Node } from "@xyflow/react";
import { BaseNode } from "./BaseNode";
import { useWorkflowStore } from "@/store/workflowStore";
import { BackgroundRemovalModel, RemoveBackgroundNodeData } from "@/types";
import { useAdaptiveImageSrc } from "@/hooks/useAdaptiveImageSrc";
import { useShowHandleLabels } from "@/hooks/useShowHandleLabels";
import { HandleLabel } from "./HandleLabel";

type RemoveBackgroundNodeType = Node<RemoveBackgroundNodeData, "removeBackground">;

const CHECKERBOARD_STYLE: React.CSSProperties = {
  backgroundColor: "#262626",
  backgroundImage:
    "linear-gradient(45deg, #404040 25%, transparent 25%), linear-gradient(-45deg, #404040 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #404040 75%), linear-gradient(-45deg, transparent 75%, #404040 75%)",
  backgroundSize: "16px 16px",
  backgroundPosition: "0 0, 0 8px, 8px -8px, -8px 0px",
};

const MODEL_OPTIONS: { value: BackgroundRemovalModel; label: string }[] = [
  { value: "isnet_quint8", label: "Fast" },
  { value: "isnet_fp16", label: "Balanced" },
  { value: "isnet", label: "Quality" },
];

export function RemoveBackgroundNode({ id, data, selected }: NodeProps<RemoveBackgroundNodeType>) {
  const nodeData = data;
  const adaptiveOutputImage = useAdaptiveImageSrc(nodeData.outputImage, id);
  const updateNodeData = useWorkflowStore((state) => state.updateNodeData);
  const isRunning = useWorkflowStore((state) => state.isRunning);
  const getConnectedInputs = useWorkflowStore((state) => state.getConnectedInputs);
  const edges = useWorkflowStore((state) => state.edges);
  const nodes = useWorkflowStore((state) => state.nodes);
  const showLabels = useShowHandleLabels(selected);

  const hasIncomingImageConnection = useMemo(() => {
    return edges.some((edge) => edge.target === id && edge.targetHandle === "image");
  }, [edges, id]);

  const hasSourceImage = useMemo(() => {
    if (!hasIncomingImageConnection) return false;
    const { images } = getConnectedInputs(id);
    return images.length > 0;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasIncomingImageConnection, id, getConnectedInputs, nodes, edges]);

  return (
    <BaseNode
      id={id}
      selected={selected}
      isExecuting={isRunning}
      hasError={nodeData.status === "error"}
      minWidth={320}
      minHeight={320}
      aspectFitMedia={nodeData.outputImage}
    >
      <Handle
        type="target"
        position={Position.Left}
        id="image"
        data-handletype="image"
        isConnectable={true}
        style={{ top: "50%" }}
      />
      <HandleLabel label="Image In" side="target" color="var(--handle-color-image)" top="calc(50% - 7px)" visible={showLabels} />

      <Handle
        type="source"
        position={Position.Right}
        id="image"
        data-handletype="image"
        isConnectable={true}
        style={{ top: "50%" }}
      />
      <HandleLabel label="Image Out" side="source" color="rgb(59, 130, 246)" top="calc(50% - 7px)" visible={showLabels} />

      <div className="flex-1 flex flex-col min-h-0 gap-2">
        <div className="flex-1 min-h-0 relative rounded" style={CHECKERBOARD_STYLE}>
          {nodeData.outputImage ? (
            <>
              <img
                src={adaptiveOutputImage ?? undefined}
                className="absolute inset-0 w-full h-full object-contain rounded"
                alt="Background removed"
              />
              <button
                onClick={() => updateNodeData(id, { outputImage: null, status: "idle", progress: 0 })}
                className="absolute top-1 right-1 w-5 h-5 bg-neutral-900/80 hover:bg-red-600/80 rounded flex items-center justify-center text-neutral-400 hover:text-white transition-colors"
                title="Clear result"
              >
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </>
          ) : (
            <div className="absolute inset-0 flex items-center justify-center border border-dashed border-neutral-600 rounded">
              <span className="text-[10px] text-neutral-500 text-center px-4">
                {hasSourceImage
                  ? "Run to remove background"
                  : "Connect an image input"}
              </span>
            </div>
          )}
        </div>

        <div className="nodrag nowheel shrink-0 flex gap-1 px-1">
          {MODEL_OPTIONS.map((option) => (
            <button
              key={option.value}
              onClick={() => updateNodeData(id, { model: option.value, outputImage: null, status: "idle", progress: 0 })}
              className={`flex-1 px-2 py-1 rounded text-xs font-medium transition-colors ${
                nodeData.model === option.value
                  ? "bg-blue-600 text-white"
                  : "bg-neutral-800 text-neutral-400 hover:text-neutral-200"
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>

        {nodeData.status === "loading" && (
          <div className="absolute inset-0 bg-neutral-900/70 rounded flex flex-col items-center justify-center gap-2">
            <svg className="w-6 h-6 animate-spin text-white" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
            <span className="text-white text-xs">
              {nodeData.progress > 0 ? `Processing... ${nodeData.progress}%` : "Loading model..."}
            </span>
          </div>
        )}

        {nodeData.status === "error" && nodeData.error && (
          <div className="shrink-0 px-2 py-1.5 bg-red-900/30 border border-red-700/50 rounded">
            <p className="text-[10px] text-red-400 break-words">{nodeData.error}</p>
          </div>
        )}
      </div>
    </BaseNode>
  );
}
