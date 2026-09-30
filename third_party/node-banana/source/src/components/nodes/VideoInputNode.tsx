"use client";

import { useCanvasTranslation } from "../../leesfield/localization";
import { Handle } from "../../leesfield/port-handle";

import { useCallback, useRef, useState, useEffect } from "react";
import { Position, NodeProps, Node } from "@xyflow/react";
import { BaseNode } from "./BaseNode";
import { InputMediaChooser } from "./InputMediaChooser";
import { HandleLabel } from "./HandleLabel";
import {
  VideoInputNodeData,
  downloadMedia,
  useShowHandleLabels,
  useVideoBlobUrl,
  useWorkflowStore,
} from "../../leesfield/upstream-node-host";

type VideoInputNodeType = Node<VideoInputNodeData, "videoInput">;

const MAX_FILE_SIZE = 200 * 1024 * 1024; // 200MB
const ACCEPTED_FORMATS = "video/mp4,video/webm,video/quicktime";
const ACCEPTED_MIME_TYPES = ACCEPTED_FORMATS.split(",");

export function VideoInputNode({ id, data, selected }: NodeProps<VideoInputNodeType>) {
  const tc = useCanvasTranslation();
  const nodeData = data;
  const updateNodeData = useWorkflowStore((state) => state.updateNodeData);
  const writable = useWorkflowStore((state) => state.writable) && !nodeData.hasConnectedVideo;
  const [choosingVideo, setChoosingVideo] = useState(false);
  useEffect(() => { setChoosingVideo(false); }, [nodeData.video, nodeData.config?.assetId]);
  const triggerRef = useRef<HTMLElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const showLabels = useShowHandleLabels(selected);

  // Use blob URL for efficient playback of large base64 videos
  const playbackUrl = useVideoBlobUrl(nodeData.video ?? null);

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (!writable) return;
      const file = e.target.files?.[0];
      if (!file) return;

      if (!ACCEPTED_MIME_TYPES.includes(file.type)) {
        alert("Unsupported format. Use MP4, WebM, or QuickTime video files.");
        return;
      }

      if (file.size > MAX_FILE_SIZE) {
        alert("Video file too large. Maximum size is 200MB.");
        return;
      }

      // Extract metadata using a temporary video element pointing at the original file
      const metadataUrl = URL.createObjectURL(file);
      const video = document.createElement("video");
      video.preload = "metadata";

      const reader = new FileReader();
      reader.onload = (event) => {
        const base64 = event.target?.result as string;

        video.onloadedmetadata = () => {
          updateNodeData(id, {
            video: base64,
            videoRef: undefined,
            filename: file.name,
            format: file.type,
            duration: video.duration,
            dimensions: { width: video.videoWidth, height: video.videoHeight },
          });
          URL.revokeObjectURL(metadataUrl);
        };
        video.onerror = () => {
          // Still load the file even if metadata extraction fails
          updateNodeData(id, {
            video: base64,
            videoRef: undefined,
            filename: file.name,
            format: file.type,
            duration: null,
            dimensions: null,
          });
          URL.revokeObjectURL(metadataUrl);
        };
        video.src = metadataUrl;
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
      video: null,
      videoRef: undefined,
      filename: null,
      duration: null,
      dimensions: null,
      format: null,
    });
  }, [id, updateNodeData, writable]);

  return (
    <BaseNode
      id={id}
      selected={selected}
      contentClassName="flex-1 min-h-0"
      aspectFitMedia={nodeData.video}
      fullBleed
    >
      <input
        ref={fileInputRef}
        type="file"
        accept={ACCEPTED_FORMATS}
        disabled={!writable}
        onChange={handleFileChange}
        className="hidden"
      />

      {nodeData.video ? (
        <div className="relative group w-full h-full overflow-clip rounded-lg">
          {!nodeData.hasConnectedVideo && <button ref={(element) => { triggerRef.current = element; }} type="button" className="absolute left-2 top-2 z-20 nodrag nopan rounded-md border border-neutral-600 bg-neutral-900/90 px-2 py-1.5 text-xs text-neutral-200" disabled={!writable} aria-label={tc("Choose video")} onClick={() => setChoosingVideo(true)}>{tc("Replace")}</button>}
          <video
            src={playbackUrl ?? undefined}
            controls
            className="nodrag nopan w-full h-full object-cover rounded-lg"
            preload="metadata"
          />
          {nodeData.isOptional && (
            <span className="absolute bottom-2 left-2 text-[9px] font-medium text-neutral-300 bg-black/50 px-1.5 py-0.5 rounded">{tc("Optional")}</span>
          )}
          <button
            onClick={() => downloadMedia(nodeData.video!, "video")}
            aria-label={tc("Download video")}
            className="absolute top-2 right-10 w-6 h-6 bg-black/60 hover:bg-black/80 text-white rounded text-xs opacity-0 group-hover:opacity-100 focus:opacity-100 transition-all flex items-center justify-center"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
          </button>
          <button
            onClick={handleRemove}
            disabled={!writable}
            aria-label={tc("Remove video")}
            className="absolute top-2 right-2 w-6 h-6 bg-black/60 hover:bg-red-600/80 text-white rounded text-xs opacity-0 group-hover:opacity-100 focus:opacity-100 focus:ring-1 focus:ring-red-400 transition-all flex items-center justify-center"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      ) : (
        <div
          ref={(element) => { triggerRef.current = element; }}
          role="button"
          tabIndex={writable ? 0 : -1}
          aria-label={tc("Upload video file")}
          aria-disabled={!writable}
          onClick={() => { if (writable) setChoosingVideo(true); }}
          onKeyDown={(e) => { if (writable && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); setChoosingVideo(true); } }}
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          className={`w-full h-full bg-neutral-900/40 flex flex-col items-center justify-center transition-colors ${writable ? "cursor-pointer hover:bg-neutral-900/60" : "cursor-not-allowed opacity-60"} ${nodeData.isOptional ? "border-2 border-dashed border-neutral-600" : ""}`}
        >
          <svg className="w-8 h-8 text-neutral-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="m15.75 10.5 4.72-4.72a.75.75 0 0 1 1.28.53v11.38a.75.75 0 0 1-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 0 0 2.25-2.25v-9a2.25 2.25 0 0 0-2.25-2.25h-9A2.25 2.25 0 0 0 2.25 7.5v9a2.25 2.25 0 0 0 2.25 2.25Z" />
          </svg>
          <span className="text-xs text-neutral-500 mt-2">{nodeData.isOptional ? tc("Optional") : tc("Drop video or click")}</span>
        </div>
      )}

      <InputMediaChooser nodeId={id} mediaType="video" selectedAssetId={nodeData.config?.assetId ?? null} open={choosingVideo && writable} onOpenChange={setChoosingVideo} onUpload={() => fileInputRef.current?.click()} triggerRef={triggerRef}/>

      <Handle
        type="target"
        position={Position.Left}
        id="video"
        data-handletype="video"
      />
      <HandleLabel label={tc("Video")} side="target" color="var(--handle-color-video)" visible={showLabels} />
      <Handle
        type="source"
        position={Position.Right}
        id="video"
        data-handletype="video"
      />
      <HandleLabel label={tc("Video")} side="source" color="var(--handle-color-video)" visible={showLabels} />
    </BaseNode>
  );
}
