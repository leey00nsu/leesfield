"use client";

import { ImagePlus, Maximize2 } from "lucide-react";
import { useTranslations } from "next-intl";

import { AppButton } from "@/shared/ui/app-button";

type NodeStudioToolbarProps = {
  onAddImageNode: () => void;
  onFitView: () => void;
};

export function NodeStudioToolbar({ onAddImageNode, onFitView }: NodeStudioToolbarProps) {
  const t = useTranslations("nodeStudio");
  return (
    <div className="flex items-center gap-2 rounded-2xl border border-white/10 bg-background-dark/88 p-2 shadow-xl backdrop-blur-xl">
      <AppButton type="button" size="sm" onClick={onAddImageNode}>
        <ImagePlus className="mr-2 h-4 w-4" aria-hidden="true" />
        {t("actions.addImageNode")}
      </AppButton>
      <AppButton
        type="button"
        variant="surface"
        size="icon-sm"
        onClick={onFitView}
        aria-label={t("actions.fitView")}
      >
        <Maximize2 className="h-4 w-4" aria-hidden="true" />
      </AppButton>
    </div>
  );
}
