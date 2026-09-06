"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { NextIntlClientProvider, useTranslations } from "next-intl";

import enMessages from "@/shared/i18n/messages/en.json";
import {
  useCreateGenerationGraph,
  useDeleteGenerationGraph,
  useGenerationGraph,
  useGenerationGraphList,
  useSyncGenerationGraphCache,
} from "@/features/node-studio/hook/use-generation-graphs";
import { NodeStudioWorkspace } from "@/features/node-studio/ui/node-studio-workspace";
import { attachSpaceReturnEntry, hasSpaceListReturnEntry } from "@/features/node-studio/model/space-navigation";
import { updateGenerationGraph } from "@/features/node-studio/api/generation-graph-api";
import { quickstartSpaceTemplate } from "@/features/node-studio/model/quickstart-space-template";
import type { HostedPresetWorkflow } from "@node-banana-runtime/runtime-entry";

export function NodeStudioScreen({ spaceId }: { spaceId?: string }) {
  return (
    <NextIntlClientProvider locale="en" messages={enMessages}>
      <NodeStudioScreenContent spaceId={spaceId} />
    </NextIntlClientProvider>
  );
}

function NodeStudioScreenContent({ spaceId }: { spaceId?: string }) {
  const router = useRouter();
  const t = useTranslations("nodeStudio");
  const listQuery = useGenerationGraphList();
  const createMutation = useCreateGenerationGraph();
  const deleteMutation = useDeleteGenerationGraph();
  const syncCache = useSyncGenerationGraphCache();
  const [workspaceKey, setWorkspaceKey] = useState(0);
  const searchParams = useSearchParams();
  const [dismissedTutorialSpace, setDismissedTutorialSpace] = useState<string>();
  const tutorialActive = searchParams.get("tutorial") === "1" && dismissedTutorialSpace !== spaceId;
  const [lifecycleError, setLifecycleError] = useState<string | null>(null);
  const graphs = listQuery.data ?? [];
  const activeGraphId = spaceId ?? null;
  const detailQuery = useGenerationGraph(activeGraphId);
  useEffect(() => { if (spaceId) attachSpaceReturnEntry(spaceId); }, [spaceId]);

  const commitGraphSelection = (graphId: string) => {
    router.push(`/spaces/${graphId}`);
  };

  const createGraph = async (title: string) => {
    setLifecycleError(null);
    try {
      const graph = await createMutation.mutateAsync(title);
      router.push(`/spaces/${graph.id}`);
    } catch {
      setLifecycleError(t("errors.create"));
    }
  };

  const deleteGraph = async () => {
    if (!activeGraphId) return;
    setLifecycleError(null);
    try {
      await deleteMutation.mutateAsync(activeGraphId);
      router.replace("/spaces");
    } catch {
      setLifecycleError(t("errors.delete"));
    }
  };

  const createPreset = async (workflow: HostedPresetWorkflow | null, tutorial = false) => {
    const draft = workflow ? quickstartSpaceTemplate(workflow) : null;
    const created = await createMutation.mutateAsync(workflow?.name ?? (tutorial ? "Tutorial" : "Untitled Space"));
    try {
      const saved = draft ? await updateGenerationGraph(created.id, { expectedVersion: created.version, schemaVersion: 3, title: created.title, ...draft }) : created;
      syncCache(saved);
      router.push(`/spaces/${saved.id}${tutorial ? "?tutorial=1" : ""}`);
    } catch (error) {
      await deleteMutation.mutateAsync(created.id).catch(() => undefined);
      throw error;
    }
  };

  const reloadLatest = async () => {
    const result = await detailQuery.refetch();
    if (result.data) {
      setWorkspaceKey((value) => value + 1);
    }
  };

  return (
    <section
      className="fixed inset-0 z-[100] flex min-h-0 flex-col overflow-hidden bg-neutral-900 text-white"
      aria-label="Space editor"
      data-testid="node-banana-home"
    >
      {lifecycleError ? (
        <div className="absolute left-1/2 top-14 z-[140] -translate-x-1/2 rounded-md border border-red-400/30 bg-red-950/90 px-3 py-2 text-xs text-red-100 shadow-xl" role="alert">
          {lifecycleError}
        </div>
      ) : null}
      {listQuery.isLoading && !detailQuery.data ? <NodeStudioLoading label="Loading spaces..." /> : null}
      {listQuery.isError && !detailQuery.data ? (
        <NodeStudioError label={t("errors.list")} onRetry={() => void listQuery.refetch()} />
      ) : null}
      {!listQuery.isLoading && !listQuery.isError && !detailQuery.isError && !detailQuery.data ? (
        <NodeStudioLoading label={createMutation.isPending ? "Creating space..." : "Loading space..."} />
      ) : null}
      {activeGraphId && detailQuery.isError && !detailQuery.data ? (
        <NodeStudioError label={t("errors.load")} onRetry={() => void detailQuery.refetch()} />
      ) : null}
      {detailQuery.data ? (
        <NodeStudioWorkspace
          key={`${detailQuery.data.id}:${detailQuery.data.schemaVersion ?? 1}:${workspaceKey}`}
          graph={detailQuery.data}
          onBack={() => { if (spaceId && hasSpaceListReturnEntry(spaceId)) router.back(); else router.replace("/spaces"); }}
          graphs={graphs}
          activeGraphId={detailQuery.data.id}
          creating={createMutation.isPending}
          deleting={deleteMutation.isPending}
          onSaved={syncCache}
          onSelectGraph={commitGraphSelection}
          onCreateGraph={(title) => void createGraph(title)}
          onCreatePreset={createPreset}
          tutorialActive={tutorialActive}
          onTutorialClose={() => { setDismissedTutorialSpace(spaceId); router.replace(`/spaces/${detailQuery.data.id}`); }}
          onDelete={() => void deleteGraph()}
          onReloadLatest={() => void reloadLatest()}
        />
      ) : null}
    </section>
  );
}

function NodeStudioLoading({ label }: { label: string }) {
  return (
    <div className="grid flex-1 place-items-center bg-neutral-900 text-xs text-neutral-500" role="status">
      <div className="flex items-center gap-2">
        <span className="h-3 w-3 animate-spin rounded-full border border-neutral-600 border-t-neutral-200" aria-hidden="true" />
        {label}
      </div>
    </div>
  );
}

function NodeStudioError({ label, onRetry }: { label: string; onRetry: () => void }) {
  return (
    <div className="grid flex-1 place-items-center bg-neutral-900 p-8 text-center" role="alert">
      <div className="text-xs text-red-300">
        <p>{label}</p>
        <button type="button" className="mt-3 rounded border border-neutral-600 px-3 py-1.5 text-neutral-300 hover:bg-neutral-800" onClick={onRetry}>
          Try again
        </button>
        <Link className="ml-3 text-neutral-300 underline" href="/spaces">Back to Spaces</Link>
      </div>
    </div>
  );
}
