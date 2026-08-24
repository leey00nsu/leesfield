"use client";

import { memo } from "react";
import { Handle, NodeToolbar, Position, type NodeProps } from "@xyflow/react";
import { Copy, Image as ImageIcon, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";

import { cn } from "@/shared/lib/utils";
import { AppButton } from "@/shared/ui/app-button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/shared/ui/tooltip";

import type { ImageGenerationFlowNode } from "../../model/flow-types";
import { useNodeAuthoring } from "../../model/node-authoring-context";
import { ImageNodeAuthoringForm } from "./image-node-authoring-form";
import { ImageNodeExecution } from "./image-node-execution";
import { ImageNodeInputReadinessView } from "./image-node-input-readiness";

export const ImageGenerationNode = memo(function ImageGenerationNode({ id, data, selected }: NodeProps<ImageGenerationFlowNode>) {
  const t = useTranslations("nodeStudio");
  const {
    duplicateImageNode,
    deleteImageNode,
    getImageNodeInputReadiness,
  } = useNodeAuthoring();
  const promptSummary = data.config.prompt.trim();
  const inputReadiness = getImageNodeInputReadiness(id);

  return (
    <TooltipProvider>
      <article
        className={cn(
          "relative rounded-[1.35rem] border bg-[#0b0d0e]/96 text-white shadow-[0_24px_90px_rgba(0,0,0,0.46)] transition-[width,border-color,box-shadow] motion-reduce:transition-none",
          selected
            ? "w-[min(28rem,calc(100vw-7rem))] border-primary/90 p-5 ring-2 ring-primary/20"
            : "w-72 border-white/12 p-4",
        )}
        aria-label={t("node.imageGeneration")}
        aria-current={selected ? "true" : undefined}
      >
        <NodeToolbar isVisible={selected} position={Position.Top} offset={12} className="nodrag nopan flex items-center gap-1 rounded-xl border border-white/10 bg-background-dark/95 p-1.5 shadow-2xl backdrop-blur-xl">
          <Tooltip>
            <TooltipTrigger asChild>
              <AppButton type="button" variant="ghost" size="icon-sm" aria-label={t("actions.duplicateNode")} onClick={() => duplicateImageNode(id)}>
                <Copy className="h-4 w-4" aria-hidden="true" />
              </AppButton>
            </TooltipTrigger>
            <TooltipContent>{t("actions.duplicateNode")}</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <AppButton type="button" variant="ghost" size="icon-sm" className="text-white/55 hover:!text-red-200" aria-label={t("actions.deleteNode")} onClick={() => deleteImageNode(id)}>
                <Trash2 className="h-4 w-4" aria-hidden="true" />
              </AppButton>
            </TooltipTrigger>
            <TooltipContent>{t("actions.deleteNode")}</TooltipContent>
          </Tooltip>
        </NodeToolbar>

        <Handle id="primary" type="target" position={Position.Left} className="!top-[38%] !h-3 !w-3 !border-2 !border-background-dark !bg-primary" aria-label={t("edge.primaryTarget")} />
        <Handle id="reference" type="target" position={Position.Left} className="!top-[68%] !h-3 !w-3 !border-2 !border-background-dark !bg-white/45" aria-label={t("edge.referenceTarget")} />
        <Handle id="output" type="source" position={Position.Right} className="!h-3 !w-3 !border-2 !border-background-dark !bg-white" aria-label={t("edge.outputSource")} />

        <div className="flex min-w-0 items-center gap-3">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-primary/12 text-primary">
            <ImageIcon className="h-4 w-4" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <h3 className="truncate text-sm font-semibold">{t("node.imageGeneration")}</h3>
            <p className="truncate text-[11px] text-white/45">{data.config.modelKey ?? t("node.modelUnselected")}</p>
          </div>
        </div>

        {selected ? (
          <div className="mt-5 grid gap-4">
            <ImageNodeInputReadinessView readiness={inputReadiness} />
            <ImageNodeAuthoringForm nodeId={id} config={data.config} />
            <ImageNodeExecution
              nodeId={id}
              config={data.config}
              selectedOutputImageId={data.selectedOutputImageId}
              expanded
            />
          </div>
        ) : (
          <>
            <p className="mt-4 line-clamp-2 min-h-10 text-xs leading-5 text-white/45">{promptSummary || t("node.promptEmpty")}</p>
            <ImageNodeInputReadinessView readiness={inputReadiness} compact />
            <ImageNodeExecution
              nodeId={id}
              config={data.config}
              selectedOutputImageId={data.selectedOutputImageId}
            />
          </>
        )}
      </article>
    </TooltipProvider>
  );
});
