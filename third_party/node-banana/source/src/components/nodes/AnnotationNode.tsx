"use client";

import { useCanvasTranslation } from "../../leesfield/localization";
import { Handle } from "../../leesfield/port-handle";

import { useCallback } from "react";
import { Position, NodeProps, Node } from "@xyflow/react";
import { BaseNode } from "./BaseNode";
import { HandleLabel } from "./HandleLabel";
import {
  AnnotationNodeData,
  downloadMedia,
  useAdaptiveImageSrc,
  useAnnotationStore,
  useShowHandleLabels,
  useWorkflowStore,
} from "../../leesfield/upstream-node-host";

type AnnotationNodeType = Node<AnnotationNodeData, "annotation">;

export function AnnotationNode({ id, data, selected }: NodeProps<AnnotationNodeType>) {
  const tc = useCanvasTranslation();
  const nodeData = data;
  const openModal = useAnnotationStore((state) => state.openModal);
  const writable = useWorkflowStore((state) => state.writable);
  const showLabels = useShowHandleLabels(selected);

  const handleEdit = useCallback(() => {
    if (!writable) return;
    const imageToEdit = nodeData.sourceImage || nodeData.outputImage;
    if (!imageToEdit) {
      alert("No image available. Connect an image or load one manually.");
      return;
    }
    openModal(id, imageToEdit, nodeData.annotations);
  }, [id, nodeData, openModal, writable]);

  const displayImage = nodeData.outputImage || nodeData.sourceImage;
  const adaptiveDisplayImage = useAdaptiveImageSrc(displayImage, id);

  return (
    <BaseNode
      id={id}
      selected={selected}
      contentClassName="flex-1 min-h-0"
      aspectFitMedia={nodeData.outputImage}
    >
      <Handle
        type="target"
        position={Position.Left}
        id="image"
        data-handletype="image"
      />
      <HandleLabel label={tc("Image")} side="target" color="var(--handle-color-image)" visible={showLabels} />
      <Handle
        type="source"
        position={Position.Right}
        id="image"
        data-handletype="image"
      />
      <HandleLabel label={tc("Image")} side="source" color="var(--handle-color-image)" visible={showLabels} />

      {displayImage ? (
        <div
          className="relative group w-full h-full overflow-clip rounded-lg"
        >
          <img
            src={adaptiveDisplayImage ?? undefined}
            alt={tc("Annotated")}
            className="w-full h-full object-contain"
          />
          <button
            onClick={(e) => {
              e.stopPropagation();
              downloadMedia(displayImage!, "image");
            }}
            aria-label={tc("Download image")}
            className="absolute z-10 top-2 right-10 w-6 h-6 bg-black/60 hover:bg-black/80 text-white rounded text-xs opacity-0 group-hover:opacity-100 focus-visible:opacity-100 focus-visible:ring-1 focus-visible:ring-white transition-opacity flex items-center justify-center"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
          </button>
          <button
            type="button"
            onClick={handleEdit}
            disabled={!writable}
            aria-label={nodeData.annotations.length > 0 ? `Edit (${nodeData.annotations.length})` : tc("Add annotations")}
            className="absolute z-10 bottom-2 left-1/2 -translate-x-1/2 whitespace-nowrap text-xs font-medium text-white opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity bg-black/60 px-3 py-1.5 rounded disabled:cursor-not-allowed disabled:opacity-30"
          >
            {nodeData.annotations.length > 0 ? `Edit (${nodeData.annotations.length})` : tc("Add annotations")}
          </button>
        </div>
      ) : (
        <div
          className="w-full h-full bg-neutral-900/40 flex flex-col items-center justify-center px-4 text-center"
        >
          <svg className="w-8 h-8 text-neutral-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
          <span className="text-xs text-neutral-400 mt-2">{tc("Connect an image node to annotate")}</span>
          <span className="text-[10px] text-neutral-600 mt-1">{tc("Local annotation uploads are unavailable in the hosted graph.")}</span>
        </div>
      )}
    </BaseNode>
  );
}
