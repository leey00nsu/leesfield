"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Copy, Plus, Pencil, Trash2 } from "lucide-react";
import { useGenerationGraphList, useCreateGenerationGraph, useDeleteGenerationGraph, useSyncGenerationGraphCache } from "@/features/node-studio/hook/use-generation-graphs";
import { copyGenerationGraph, getGenerationGraph, updateGenerationGraph } from "@/features/node-studio/api/generation-graph-api";
import { AppButton } from "@/shared/ui/app-button";
import { AppInput } from "@/shared/ui/app-input";
import { GenerationStudioIntro } from "@/shared/ui/generation-studio-intro";
import { rememberSpaceListEntry, restoreSpaceListScroll } from "@/features/node-studio/model/space-navigation";
import { AppDialog, AppDialogContent, AppDialogTitle, AppDialogDescription } from "@/shared/ui/app-dialog";

type SpaceAction = { kind: "create" } | { kind: "rename" | "delete"; id: string; title: string };

export function SpacesScreen() {
  const router = useRouter();
  const query = useGenerationGraphList();
  const create = useCreateGenerationGraph();
  const remove = useDeleteGenerationGraph();
  const sync = useSyncGenerationGraphCache();
  const [action, setAction] = useState<SpaceAction | null>(null);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { if (query.data) restoreSpaceListScroll(); }, [query.data]);
  const begin = (next: SpaceAction) => {
    setError(null);
    setName(next.kind === "create" ? "Untitled Space" : next.title);
    setAction(next);
  };
  const confirm = async () => {
    if (!action || busy) return;
    setBusy(true); setError(null);
    try {
      if (action.kind === "create") {
        const graph = await create.mutateAsync(name.trim());
        rememberSpaceListEntry(graph.id);
        router.push(`/spaces/${graph.id}`);
      } else if (action.kind === "delete") {
        await remove.mutateAsync(action.id);
      } else {
        const graph = await getGenerationGraph(action.id);
        sync(await updateGenerationGraph(graph.id, { schemaVersion: 3, groups: graph.groups, expectedVersion: graph.version,
          title: name.trim(), nodes: graph.nodes, edges: graph.edges }));
      }
      setAction(null);
    } catch {
      setError("The space could not be updated. Please try again.");
    } finally { setBusy(false); }
  };
  const duplicate = async (id: string) => {
    if (busy) return;
    setBusy(true); setError(null);
    try { sync(await copyGenerationGraph(id)); }
    catch { setError("The space could not be copied. Please try again."); }
    finally { setBusy(false); }
  };
  return (
    <section className="mx-auto flex w-full max-w-[1600px] flex-col gap-8 pb-20" aria-label="Spaces">
      <GenerationStudioIntro eyebrow="Creative workflows" title="Spaces" description="Create, connect, and explore your creative workflows." />
      <div className="flex justify-end gap-6">
        <AppButton onClick={() => begin({ kind: "create" })} disabled={busy}><Plus aria-hidden="true" />New Space</AppButton>
      </div>
      {error && !action ? <p role="alert" className="text-red-300">{error}</p> : null}
      {query.isLoading ? <p role="status">Loading spaces...</p> : null}
      {query.isError ? <div role="alert"><p>Spaces could not be loaded.</p><AppButton variant="surface" onClick={() => void query.refetch()}>Retry</AppButton></div> : null}
      {!query.isLoading && !query.isError && !query.data?.length ? <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-12 text-center">
        <h2 className="text-xl">Your first space starts here</h2><p className="mt-3 text-white/50">Create a space to bring images, video, and audio together.</p>
        <AppButton className="mt-6" onClick={() => begin({ kind: "create" })} disabled={busy}>Create Space</AppButton>
      </div> : null}
      <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3" aria-label="Spaces">
        {query.data?.map((space) => <li key={space.id} className="rounded-2xl border border-white/10 bg-white/[0.03] p-6">
          <Link href={`/spaces/${space.id}`} onNavigate={(event) => { if (busy) event.preventDefault(); else rememberSpaceListEntry(space.id); }} className="block rounded-lg focus-visible:outline-2 focus-visible:outline-primary">
            <h2 className="break-words text-xl font-medium">{space.title}</h2>
            <p className="mt-2 text-xs text-white/45">Updated <time dateTime={space.updatedAt}>{new Date(space.updatedAt).toLocaleString()}</time></p>
          </Link>
          <div className="mt-6 flex gap-2">
            <AppButton variant="surface" size="icon-sm" disabled={busy} aria-label={`Rename ${space.title}`} onClick={() => begin({ kind: "rename", id: space.id, title: space.title })}><Pencil aria-hidden="true" /></AppButton>
            <AppButton variant="surface" size="icon-sm" disabled={busy} aria-label={`Copy ${space.title}`} onClick={() => void duplicate(space.id)}><Copy aria-hidden="true" /></AppButton>
            <AppButton variant="danger" size="icon-sm" disabled={busy} aria-label={`Delete ${space.title}`} onClick={() => begin({ kind: "delete", id: space.id, title: space.title })}><Trash2 aria-hidden="true" /></AppButton>
          </div>
        </li>)}
      </ul>
      <AppDialog open={Boolean(action)} onOpenChange={(open) => { if (!open && !busy) setAction(null); }}>
        <AppDialogContent size="sm">
          <AppDialogTitle>{action?.kind === "delete" ? "Delete Space?" : action?.kind === "rename" ? "Rename Space" : "New Space"}</AppDialogTitle>
          <AppDialogDescription>{action?.kind === "delete" ? `Delete “${action.title}”? Your media and generation history will be kept.` : "Give your space a name."}</AppDialogDescription>
          <form className="flex flex-col gap-4" onSubmit={(event) => { event.preventDefault(); void confirm(); }}>
            {action?.kind !== "delete" ? <AppInput aria-label="Space name" autoFocus maxLength={120} value={name} disabled={busy} onChange={(event) => setName(event.target.value)} /> : null}
            {error ? <p role="alert" className="text-red-300">{error}</p> : null}
            <div className="flex justify-end gap-2"><AppButton type="button" variant="surface" disabled={busy} onClick={() => setAction(null)}>Cancel</AppButton>
              <AppButton type="submit" variant={action?.kind === "delete" ? "danger" : "primary"} disabled={busy || (action?.kind !== "delete" && !name.trim())}>{busy ? "Please wait..." : action?.kind === "delete" ? "Delete" : "Save"}</AppButton></div>
          </form>
        </AppDialogContent>
      </AppDialog>
    </section>
  );
}
