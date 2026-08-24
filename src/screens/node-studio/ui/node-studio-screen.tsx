"use client";

import { useState } from "react";
import { AlertTriangle, Network } from "lucide-react";
import { useTranslations } from "next-intl";

import {
  useCreateGenerationGraph,
  useDeleteGenerationGraph,
  useGenerationGraph,
  useGenerationGraphList,
  useSyncGenerationGraphCache,
} from "@/features/node-studio/hook/use-generation-graphs";
import type { GraphAutosaveStatus } from "@/features/node-studio/hook/use-graph-autosave";
import { GraphSelector } from "@/features/node-studio/ui/graph-selector";
import { NodeStudioWorkspace } from "@/features/node-studio/ui/node-studio-workspace";
import { AppButton } from "@/shared/ui/app-button";

export function NodeStudioScreen() {
  const t = useTranslations("nodeStudio");
  const listQuery = useGenerationGraphList();
  const createMutation = useCreateGenerationGraph();
  const deleteMutation = useDeleteGenerationGraph();
  const syncCache = useSyncGenerationGraphCache();
  const [selectedGraphId, setSelectedGraphId] = useState<string | null>(null);
  const [workspaceKey, setWorkspaceKey] = useState(0);
  const [saveStatus, setSaveStatus] = useState<GraphAutosaveStatus>("saved");
  const [lifecycleError, setLifecycleError] = useState<string | null>(null);
  const graphs = listQuery.data ?? [];
  const activeGraphId =
    selectedGraphId && graphs.some((graph) => graph.id === selectedGraphId)
      ? selectedGraphId
      : (graphs[0]?.id ?? null);
  const detailQuery = useGenerationGraph(activeGraphId);

  const busy = saveStatus === "dirty" || saveStatus === "saving";
  const selectGraph = (graphId: string) => {
    if (busy) return;
    if (
      (saveStatus === "error" || saveStatus === "conflict") &&
      !window.confirm(t("confirm.switchDescription"))
    ) {
      return;
    }
    setSelectedGraphId(graphId);
    setWorkspaceKey((value) => value + 1);
    setSaveStatus("saved");
  };

  const createGraph = async (title: string) => {
    setLifecycleError(null);
    try {
      const graph = await createMutation.mutateAsync(title);
      setSelectedGraphId(graph.id);
      setWorkspaceKey((value) => value + 1);
    } catch {
      setLifecycleError(t("errors.create"));
    }
  };

  const deleteGraph = async () => {
    if (!activeGraphId) return;
    setLifecycleError(null);
    try {
      await deleteMutation.mutateAsync(activeGraphId);
      setSelectedGraphId(null);
      setWorkspaceKey((value) => value + 1);
    } catch {
      setLifecycleError(t("errors.delete"));
    }
  };

  const reloadLatest = async () => {
    const result = await detailQuery.refetch();
    if (result.data) {
      setWorkspaceKey((value) => value + 1);
      setSaveStatus("saved");
    }
  };

  return (
    <section className="mx-auto grid w-full max-w-[1800px] gap-5">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-primary">{t("eyebrow")}</p>
          <h1 className="mt-2 font-display text-4xl text-white">{t("title")}</h1>
          <p className="mt-2 max-w-2xl text-sm text-white/50">{t("description")}</p>
        </div>
      </header>

      <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-white/10 bg-surface-dark/60 p-3">
        <GraphSelector
          graphs={graphs}
          selectedGraphId={activeGraphId}
          disabled={busy}
          creating={createMutation.isPending}
          onSelect={selectGraph}
          onCreate={(title) => void createGraph(title)}
        />
      </div>

      {lifecycleError ? (
        <div className="rounded-2xl border border-red-300/15 bg-red-500/5 px-4 py-3 text-sm text-red-100" role="alert">
          {lifecycleError}
        </div>
      ) : null}

      {listQuery.isLoading ? <NodeStudioLoading label={t("loading.graphs")} /> : null}
      {listQuery.isError ? (
        <NodeStudioError label={t("errors.list")} onRetry={() => void listQuery.refetch()} />
      ) : null}
      {!listQuery.isLoading && !listQuery.isError && graphs.length === 0 ? (
        <div className="grid min-h-[32rem] place-items-center rounded-3xl border border-dashed border-white/12 bg-surface-dark/35 p-8 text-center">
          <div className="max-w-md">
            <Network className="mx-auto h-10 w-10 text-primary" aria-hidden="true" />
            <h2 className="mt-5 font-display text-3xl">{t("graph.emptyTitle")}</h2>
            <p className="mt-3 text-sm leading-6 text-white/50">{t("graph.emptyDescription")}</p>
          </div>
        </div>
      ) : null}
      {activeGraphId && detailQuery.isLoading ? <NodeStudioLoading label={t("loading.graph")} /> : null}
      {activeGraphId && detailQuery.isError ? (
        <NodeStudioError label={t("errors.load")} onRetry={() => void detailQuery.refetch()} />
      ) : null}
      {detailQuery.data ? (
        <NodeStudioWorkspace
          key={`${detailQuery.data.id}:${workspaceKey}`}
          graph={detailQuery.data}
          deleting={deleteMutation.isPending}
          onSaved={syncCache}
          onDelete={() => void deleteGraph()}
          onReloadLatest={() => void reloadLatest()}
          onStatusChange={setSaveStatus}
        />
      ) : null}
    </section>
  );
}

function NodeStudioLoading({ label }: { label: string }) {
  return (
    <div className="grid min-h-[32rem] place-items-center rounded-3xl border border-white/10 bg-surface-dark/35 text-sm text-white/50" role="status">
      {label}
    </div>
  );
}

function NodeStudioError({ label, onRetry }: { label: string; onRetry: () => void }) {
  const t = useTranslations("nodeStudio");
  return (
    <div className="grid min-h-[24rem] place-items-center rounded-3xl border border-red-300/15 bg-red-500/5 p-8 text-center" role="alert">
      <div>
        <AlertTriangle className="mx-auto h-8 w-8 text-red-200" aria-hidden="true" />
        <p className="mt-4 text-sm text-red-100">{label}</p>
        <AppButton type="button" variant="surface" size="sm" className="mt-4" onClick={onRetry}>
          {t("actions.retry")}
        </AppButton>
      </div>
    </div>
  );
}
