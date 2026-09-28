"use client";

import { useCanvasTranslation } from "../../leesfield/localization";
import { Handle } from "../../leesfield/port-handle";

import { useCallback, useRef, useState, useEffect } from "react";
import { Position, NodeProps, Node } from "@xyflow/react";
import { BaseNode } from "./BaseNode";
import { HandleLabel } from "./HandleLabel";
import {
  ImageInputNodeData,
  HostedInputHistory,
  downloadMedia,
  useAdaptiveImageSrc,
  useCommentNavigation,
  useShowHandleLabels,
  useWorkflowStore,
} from "../../leesfield/upstream-node-host";

type ImageInputNodeType = Node<ImageInputNodeData, "imageInput">;

export function ImageInputNode({ id, data, selected }: NodeProps<ImageInputNodeType>) {
  const tc = useCanvasTranslation();
  const nodeData = data;
  const [choosingImage, setChoosingImage] = useState(false);
  useEffect(() => { setChoosingImage(false); }, [nodeData.image, nodeData.config?.assetId]);
  const adaptiveImage = useAdaptiveImageSrc(nodeData.image, id);
  const commentNavigation = useCommentNavigation(id);
  const updateNodeData = useWorkflowStore((state) => state.updateNodeData);
  const writable = useWorkflowStore((state) => state.writable) && !nodeData.hasConnectedImage;
  const fileInputRef = useRef<HTMLInputElement>(null);
  const showLabels = useShowHandleLabels(selected);

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (!writable) return;
      const file = e.target.files?.[0];
      if (!file) return;

      if (!file.type.match(/^image\/(png|jpeg|webp)$/)) {
        alert("Unsupported format. Use PNG, JPG, or WebP.");
        return;
      }

      if (file.size > 10 * 1024 * 1024) {
        alert("Image too large. Maximum size is 10MB.");
        return;
      }

      const reader = new FileReader();
      reader.onload = (event) => {
        const base64 = event.target?.result as string;
        const img = new Image();
        img.onload = () => {
          updateNodeData(id, {
            image: base64,
            imageRef: undefined,
            filename: file.name,
            dimensions: { width: img.width, height: img.height },
          });
        };
        img.src = base64;
      };
      reader.readAsDataURL(file);
    },
    [id, updateNodeData, writable]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (!writable) return;

      const file = e.dataTransfer.files?.[0];
      if (!file) return;

      const dt = new DataTransfer();
      dt.items.add(file);
      if (fileInputRef.current) {
        fileInputRef.current.files = dt.files;
        fileInputRef.current.dispatchEvent(new Event("change", { bubbles: true }));
      }
    },
    [writable]
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleRemove = useCallback(() => {
    if (!writable) return;
    updateNodeData(id, {
      image: null,
      imageRef: undefined,
      filename: null,
      dimensions: null,
    });
  }, [id, updateNodeData, writable]);

  return (
    <BaseNode
      id={id}
      selected={selected}
      contentClassName="flex-1 min-h-0"
      aspectFitMedia={nodeData.image}
      fullBleed
    >
      <input
        ref={fileInputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        disabled={!writable}
        onChange={handleFileChange}
        className="hidden"
      />

      {nodeData.image ? (
        <div className="relative group w-full h-full overflow-clip rounded-lg">
          {!nodeData.hasConnectedImage && <button type="button" className="absolute inset-0 z-10 nodrag nopan" disabled={!writable} aria-label={tc("Choose image")} onClick={() => setChoosingImage(true)} />}
          <img
            src={adaptiveImage ?? undefined}
            alt={nodeData.hasConnectedImage ? tc("Connected image") : nodeData.filename || tc("Uploaded image")}
            className="w-full h-full object-cover rounded-lg"
          />
          {nodeData.hasConnectedImage && (
            <span className="absolute bottom-2 left-2 text-[10px] text-neutral-300 bg-black/60 px-2 py-1 rounded">{tc("Connected image")}</span>
          )}
          {nodeData.isOptional && (
            <span className="absolute bottom-2 left-2 text-[9px] font-medium text-neutral-300 bg-black/50 px-1.5 py-0.5 rounded">{tc("Optional")}</span>
          )}
          <button
            onClick={() => downloadMedia(nodeData.image!, "image")}
            aria-label={tc("Download image")}
            className="absolute z-20 top-2 right-10 w-6 h-6 bg-black/60 hover:bg-black/80 text-white rounded text-xs opacity-0 group-hover:opacity-100 focus:opacity-100 transition-all flex items-center justify-center"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
          </button>
          {!nodeData.hasConnectedImage && <button
            onClick={handleRemove}
            disabled={!writable}
            aria-label={tc("Remove image")}
            className="absolute z-20 top-2 right-2 w-6 h-6 bg-black/60 hover:bg-red-600/80 text-white rounded text-xs opacity-0 group-hover:opacity-100 focus:opacity-100 focus:ring-1 focus:ring-red-400 transition-all flex items-center justify-center"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>}
        </div>
      ) : nodeData.hasConnectedImage ? (
        <div role="status" className="w-full h-full flex items-center justify-center text-xs text-neutral-500">{tc("Waiting for connected image")}</div>
      ) : (
        <div
          role="button"
          tabIndex={writable ? 0 : -1}
          aria-label={tc("Choose image")}
          aria-disabled={!writable}
          onClick={() => { if (writable) setChoosingImage(true); }}
          onKeyDown={(e) => {
            if (writable && (e.key === "Enter" || e.key === " ")) {
              e.preventDefault();
              setChoosingImage(true);
            }
          }}
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          className={`w-full h-full bg-neutral-900/40 flex flex-col items-center justify-center transition-colors ${writable ? "cursor-pointer hover:bg-neutral-900/60" : "cursor-not-allowed opacity-60"} ${nodeData.isOptional ? "border-2 border-dashed border-neutral-600" : ""}`}
        >
          <svg className="w-8 h-8 text-neutral-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
          </svg>
          <span className="text-xs text-neutral-500 mt-2">{nodeData.isOptional ? tc("Optional") : tc("Drop image")}</span>
        </div>
      )}

      {choosingImage && writable && <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 rounded-lg bg-neutral-900 nodrag nopan" style={{ backgroundColor: "#171717" }} role="group" aria-label={tc("Choose image")}>
        <button type="button" className="h-10 w-32 rounded-md border border-neutral-600 bg-neutral-900 px-4 text-xs text-neutral-200" onClick={() => fileInputRef.current?.click()}>{tc("Upload")}</button>
        <div className="flex h-10 w-32 items-center justify-center [&>button]:!static [&>button]:!h-10 [&>button]:!w-full [&>button]:!justify-center"><HostedInputHistory nodeId={id} mediaType="image" selectedAssetId={nodeData.config?.assetId ?? null} /></div>
        <button type="button" className="text-xs text-neutral-400" onClick={() => setChoosingImage(false)}>{tc("Cancel")}</button>
      </div>}

      {/* Handles rendered after visual content so they paint on top */}
      <Handle
        type="target"
        position={Position.Left}
        id="reference"
        data-handletype="reference"
        data-tutorial="node-input-handle"
      />
      <HandleLabel label={tc("Ref")} side="target" color="#6b7280" visible={showLabels} />
      <Handle
        type="source"
        position={Position.Right}
        id="image"
        data-handletype="image"
        data-tutorial="node-output-handle"
      />
      <HandleLabel label={tc("Image")} side="source" color="var(--handle-color-image)" visible={showLabels} />
    </BaseNode>
  );
}
