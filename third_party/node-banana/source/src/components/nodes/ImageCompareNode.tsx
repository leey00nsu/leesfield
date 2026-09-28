"use client";

import { useCanvasTranslation } from "../../leesfield/localization";
import { Handle } from "../../leesfield/port-handle";

import { Position, NodeProps, Node } from "@xyflow/react";
import {
  ReactCompareSlider,
  ReactCompareSliderImage,
} from "react-compare-slider";
import { BaseNode } from "./BaseNode";
import { ImageCompareNodeData } from "../../leesfield/upstream-node-host";

type ImageCompareNodeType = Node<ImageCompareNodeData, "imageCompare">;

export function ImageCompareNode({
  id,
  data,
  selected,
}: NodeProps<ImageCompareNodeType>) {
  const tc = useCanvasTranslation();
  const nodeData = data;
  // Leesfield's host adapter resolves canonical before/after ports. Trust that
  // port-aware projection instead of guessing from a short list of node types.
  const imageA = nodeData.imageA || null;
  const imageB = nodeData.imageB || null;

  return (
    <BaseNode
      id={id}
      selected={selected}
      className="min-w-[200px]"
    >
      {/* Two labeled image input handles */}
      <Handle
        type="target"
        position={Position.Left}
        id="image"
        data-handletype="image"
        style={{ top: "35%" }}
      />
      <div
        className="absolute left-[-8px] top-[35%] -translate-y-1/2 -translate-x-full mr-1 text-[9px] text-neutral-400 font-medium"
        style={{ pointerEvents: "none" }}
      >
        A
      </div>

      <Handle
        type="target"
        position={Position.Left}
        id="image-1"
        data-handletype="image"
        style={{ top: "65%" }}
      />
      <div
        className="absolute left-[-8px] top-[65%] -translate-y-1/2 -translate-x-full mr-1 text-[9px] text-neutral-400 font-medium"
        style={{ pointerEvents: "none" }}
      >
        B
      </div>

      {/* Comparison view or placeholder */}
      {imageA && imageB ? (
        <div className="flex-1 relative nodrag nopan nowheel">
          <ReactCompareSlider
            itemOne={
              <ReactCompareSliderImage
                src={imageA}
                alt={tc("Image A")}
                style={{ objectFit: "contain" }}
              />
            }
            itemTwo={
              <ReactCompareSliderImage
                src={imageB}
                alt={tc("Image B")}
                style={{ objectFit: "contain" }}
              />
            }
            portrait={false}
            style={{ width: "100%", height: "100%" }}
          />
          {/* Corner labels */}
          <div className="absolute top-2 left-2 bg-black/50 text-white text-[10px] font-medium px-2 py-1 rounded pointer-events-none">
            A
          </div>
          <div className="absolute top-2 right-2 bg-black/50 text-white text-[10px] font-medium px-2 py-1 rounded pointer-events-none">
            B
          </div>
        </div>
      ) : (
        <div className="w-full flex-1 min-h-[200px] border border-dashed border-neutral-600 rounded flex flex-col items-center justify-center gap-2">
          <span className="text-neutral-500 text-[10px] text-center px-4">
            {!imageA && !imageB
              ? tc("Connect 2 images to compare")
              : tc("Connect another image to compare")}
          </span>
          {imageA && !imageB && (
            <div className="text-[9px] text-neutral-600">{tc("Image A connected")}</div>
          )}
          {!imageA && imageB && (
            <div className="text-[9px] text-neutral-600">{tc("Image B connected")}</div>
          )}
        </div>
      )}
    </BaseNode>
  );
}
