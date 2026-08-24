"use client";

import { memo } from "react";
import { Handle, Position, type NodeProps, useReactFlow } from "@xyflow/react";
import { Image as ImageIcon, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";

import { AppButton } from "@/shared/ui/app-button";

import type { ImageGenerationFlowNode } from "../../model/flow-types";

export const ImageGenerationNode = memo(function ImageGenerationNode({
  id,
  selected,
}: NodeProps<ImageGenerationFlowNode>) {
  const t = useTranslations("nodeStudio");
  const { deleteElements } = useReactFlow<ImageGenerationFlowNode>();

  return (
    <article
      className={`relative w-64 rounded-2xl border bg-surface-dark/96 p-4 text-white shadow-2xl ${
        selected ? "border-primary/80 ring-2 ring-primary/20" : "border-white/12"
      }`}
      aria-label={t("node.imageGeneration")}
    >
      <Handle
        id="primary"
        type="target"
        position={Position.Left}
        className="!top-[38%] !h-3 !w-3 !border-2 !border-background-dark !bg-primary"
        aria-label={t("edge.primaryTarget")}
      />
      <Handle
        id="reference"
        type="target"
        position={Position.Left}
        className="!top-[68%] !h-3 !w-3 !border-2 !border-background-dark !bg-accent-purple"
        aria-label={t("edge.referenceTarget")}
      />
      <Handle
        id="output"
        type="source"
        position={Position.Right}
        className="!h-3 !w-3 !border-2 !border-background-dark !bg-white"
        aria-label={t("edge.outputSource")}
      />

      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-primary/12 text-primary">
            <ImageIcon className="h-4 w-4" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <h3 className="truncate text-sm font-semibold">{t("node.imageGeneration")}</h3>
            <p className="text-[11px] text-white/45">{t("node.shellDescription")}</p>
          </div>
        </div>
        <AppButton
          type="button"
          variant="ghost"
          size="icon-sm"
          className="nodrag nopan h-8 w-8 text-white/45 hover:!text-red-200"
          aria-label={t("actions.deleteNode")}
          onClick={() => void deleteElements({ nodes: [{ id }] })}
        >
          <Trash2 className="h-4 w-4" aria-hidden="true" />
        </AppButton>
      </div>

      <div className="mt-4 grid gap-2 text-[11px]">
        <div className="flex items-center justify-between rounded-xl border border-white/8 bg-black/15 px-3 py-2">
          <span className="text-white/45">{t("edge.primary")}</span>
          <span className="text-primary">{t("node.target")}</span>
        </div>
        <div className="flex items-center justify-between rounded-xl border border-white/8 bg-black/15 px-3 py-2">
          <span className="text-white/45">{t("edge.reference")}</span>
          <span className="text-accent-purple">{t("node.target")}</span>
        </div>
      </div>
    </article>
  );
});
