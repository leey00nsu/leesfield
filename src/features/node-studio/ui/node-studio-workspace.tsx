"use client";

import { useEffect, useMemo, useState } from "react";
import { Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";

import { AppButton } from "@/shared/ui/app-button";
import {
  AppConfirmDialog,
  AppConfirmDialogAction,
  AppConfirmDialogCancel,
  AppConfirmDialogContent,
  AppConfirmDialogDescription,
  AppConfirmDialogFooter,
  AppConfirmDialogHeader,
  AppConfirmDialogTitle,
} from "@/shared/ui/app-confirm-dialog";
import { AppInput } from "@/shared/ui/app-input";
import { AppCard } from "@/shared/ui/app-card";
import { useRuntimeModelCatalog } from "@/shared/lib/hooks/use-runtime-model-catalog";

import { useGraphAutosave, type GraphDraft, type GraphAutosaveStatus } from "../hook/use-graph-autosave";
import type { GenerationGraphSnapshotDto, UpdateGenerationGraphDto } from "../model/graph-types";
import { GraphSaveStatus } from "./graph-save-status";
import { NodeStudio } from "./node-studio";

type NodeStudioWorkspaceProps = {
  graph: GenerationGraphSnapshotDto;
  onSaved: (graph: GenerationGraphSnapshotDto) => void;
  onDelete: () => void;
  onReloadLatest: () => void;
  onStatusChange: (status: GraphAutosaveStatus) => void;
  deleting?: boolean;
};

export function NodeStudioWorkspace({
  graph,
  onSaved,
  onDelete,
  onReloadLatest,
  onStatusChange,
  deleting,
}: NodeStudioWorkspaceProps) {
  const t = useTranslations("nodeStudio");
  const initialDraft = useMemo<GraphDraft>(
    () => ({ title: graph.title, nodes: graph.nodes, edges: graph.edges }),
    [graph.edges, graph.nodes, graph.title],
  );
  const [draft, setDraft] = useState(initialDraft);
  const [title, setTitle] = useState(graph.title);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [reloadOpen, setReloadOpen] = useState(false);
  const runtimeCatalog = useRuntimeModelCatalog();
  const nodeCatalog = {
    imageModels: runtimeCatalog.imageModels.filter((model) => model.isActive),
    isLoading: runtimeCatalog.isLoading,
    error: runtimeCatalog.error,
    retry: () => {
      void runtimeCatalog.refetch();
    },
  };
  const autosave = useGraphAutosave({
    graphId: graph.id,
    initialVersion: graph.version,
    initialDraft,
    onSaved,
  });

  useEffect(() => {
    onStatusChange(autosave.status);
  }, [autosave.status, onStatusChange]);

  const updateDraft = (next: GraphDraft) => {
    setDraft(next);
    autosave.update(next);
  };

  const handleCanvasDraft = (next: UpdateGenerationGraphDto) => {
    updateDraft({ title, nodes: next.nodes, edges: next.edges });
  };

  const busy = autosave.status === "dirty" || autosave.status === "saving";

  return (
    <div className="grid gap-4">
      <AppCard
        variant="prompt"
        radius="xl"
        padding="sm"
        className="flex flex-row flex-wrap items-center justify-between gap-3 bg-black/24 backdrop-blur-xl"
      >
        <AppInput
          value={title}
          maxLength={120}
          aria-label={t("graph.title")}
          surface="toolbar"
          className="h-12 min-w-64 flex-1 rounded-xl border-white/12 bg-black/16 text-base font-semibold sm:max-w-xl"
          onChange={(event) => {
            const nextTitle = event.target.value;
            setTitle(nextTitle);
            if (nextTitle.trim()) updateDraft({ ...draft, title: nextTitle.trim() });
          }}
        />
        <div className="flex flex-wrap items-center gap-2">
          <GraphSaveStatus
            status={autosave.status}
            version={autosave.version}
            onRetry={autosave.retry}
            onReloadLatest={() => setReloadOpen(true)}
          />
          <AppButton
            type="button"
            variant="danger"
            size="icon"
            disabled={busy || deleting}
            aria-label={t("actions.deleteGraph")}
            onClick={() => setDeleteOpen(true)}
          >
            <Trash2 className="h-4 w-4" aria-hidden="true" />
          </AppButton>
        </div>
      </AppCard>

      <NodeStudio
        graph={{ ...graph, title }}
        onDraftChange={handleCanvasDraft}
        catalog={nodeCatalog}
      />

      <AppConfirmDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AppConfirmDialogContent>
          <AppConfirmDialogHeader>
            <AppConfirmDialogTitle>{t("confirm.deleteTitle")}</AppConfirmDialogTitle>
            <AppConfirmDialogDescription>{t("confirm.deleteDescription")}</AppConfirmDialogDescription>
          </AppConfirmDialogHeader>
          <AppConfirmDialogFooter>
            <AppConfirmDialogCancel>{t("actions.cancel")}</AppConfirmDialogCancel>
            <AppConfirmDialogAction onClick={onDelete}>{t("actions.deleteGraph")}</AppConfirmDialogAction>
          </AppConfirmDialogFooter>
        </AppConfirmDialogContent>
      </AppConfirmDialog>

      <AppConfirmDialog open={reloadOpen} onOpenChange={setReloadOpen}>
        <AppConfirmDialogContent>
          <AppConfirmDialogHeader>
            <AppConfirmDialogTitle>{t("confirm.reloadTitle")}</AppConfirmDialogTitle>
            <AppConfirmDialogDescription>{t("confirm.reloadDescription")}</AppConfirmDialogDescription>
          </AppConfirmDialogHeader>
          <AppConfirmDialogFooter>
            <AppConfirmDialogCancel>{t("actions.cancel")}</AppConfirmDialogCancel>
            <AppConfirmDialogAction onClick={onReloadLatest} className="bg-primary text-black hover:bg-primary">
              {t("actions.reloadLatest")}
            </AppConfirmDialogAction>
          </AppConfirmDialogFooter>
        </AppConfirmDialogContent>
      </AppConfirmDialog>
    </div>
  );
}
