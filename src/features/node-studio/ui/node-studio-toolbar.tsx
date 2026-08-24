"use client";

import { Hand, ImagePlus, MousePointer2 } from "lucide-react";
import { useTranslations } from "next-intl";

import { cn } from "@/shared/lib/utils";
import { AppButton } from "@/shared/ui/app-button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/shared/ui/tooltip";

export type NodeStudioToolMode = "select" | "pan";

type NodeStudioToolbarProps = {
  mode: NodeStudioToolMode;
  onModeChange: (mode: NodeStudioToolMode) => void;
  onAddImageNode: () => void;
};

export function NodeStudioToolbar({ mode, onModeChange, onAddImageNode }: NodeStudioToolbarProps) {
  const t = useTranslations("nodeStudio");
  const tools = [
    { mode: "select" as const, label: t("actions.selectTool"), icon: MousePointer2 },
    { mode: "pan" as const, label: t("actions.panTool"), icon: Hand },
  ];

  return (
    <TooltipProvider>
      <div className="flex flex-col items-center gap-1.5 rounded-2xl border border-white/10 bg-background-dark/90 p-2 shadow-2xl backdrop-blur-xl" aria-label={t("actions.canvasTools")}>
        <Tooltip>
          <TooltipTrigger asChild>
            <AppButton type="button" size="icon" onClick={onAddImageNode} aria-label={t("actions.addImageNode")} className="h-10 w-10 rounded-xl">
              <ImagePlus className="h-4 w-4" aria-hidden="true" />
            </AppButton>
          </TooltipTrigger>
          <TooltipContent side="right">{t("actions.addImageNode")}</TooltipContent>
        </Tooltip>
        <span className="my-0.5 h-px w-7 bg-white/10" aria-hidden="true" />
        {tools.map((tool) => {
          const Icon = tool.icon;
          const active = mode === tool.mode;
          return (
            <Tooltip key={tool.mode}>
              <TooltipTrigger asChild>
                <AppButton type="button" variant="ghost" size="icon" aria-label={tool.label} aria-pressed={active} onClick={() => onModeChange(tool.mode)} className={cn("h-10 w-10 rounded-xl text-white/55", active && "bg-primary text-black hover:!bg-primary hover:!text-black")}>
                  <Icon className="h-4 w-4" aria-hidden="true" />
                </AppButton>
              </TooltipTrigger>
              <TooltipContent side="right">{tool.label}</TooltipContent>
            </Tooltip>
          );
        })}
      </div>
    </TooltipProvider>
  );
}
