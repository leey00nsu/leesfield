"use client";
import { ResourceListLoading } from "@/shared/ui/resource-list-loading";

import { useFormatter, useLocale, useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Copy, Plus, Pencil, Trash2, Workflow } from "lucide-react";
import { useGenerationGraphList, useCreateGenerationGraph, useDeleteGenerationGraph, useSyncGenerationGraphCache } from "@/features/node-studio/hook/use-generation-graphs";
import { copyGenerationGraph, getGenerationGraph, updateGenerationGraph } from "@/features/node-studio/api/generation-graph-api";
import { AppButton } from "@/shared/ui/app-button";
import { AppInput } from "@/shared/ui/app-input";
import { AppPageShell } from "@/shared/ui/app-page-shell";
import { AppResourceList } from "@/shared/ui/app-resource-list";
import { AppCard } from "@/shared/ui/app-card";
import { AppFilterToolbar, AppSearchField, AppSortSelect } from "@/shared/ui/app-filter-toolbar";
import { ResourceRowLink, resourceRowInteractiveClassName } from "@/shared/ui/brand/resource-row-link/resource-row-link";
import { rememberSpaceListEntry, restoreSpaceListScroll } from "@/features/node-studio/model/space-navigation";
import { AppDialog, AppDialogContent, AppDialogTitle, AppDialogDescription } from "@/shared/ui/app-dialog";

type SpaceAction = { kind: "create" } | { kind: "rename" | "delete"; id: string; title: string };

export function SpacesScreen() {
  const t = useTranslations("spaces");
  const locale = useLocale();
  const format = useFormatter();
  const router = useRouter();
  const query = useGenerationGraphList();
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState("updated");
  const term = search.trim().toLocaleLowerCase();
  const spaces = (query.data ?? []).filter((space) => space.title.toLocaleLowerCase().includes(term)).sort((a, b) => {
    if (sort === "name") return a.title.localeCompare(b.title, locale, { numeric: true });
    const field = sort === "created" ? "createdAt" : "updatedAt";
    return new Date(b[field]).getTime() - new Date(a[field]).getTime();
  });
  const create = useCreateGenerationGraph();
  const remove = useDeleteGenerationGraph();
  const sync = useSyncGenerationGraphCache();
  const [action, setAction] = useState<SpaceAction | null>(null);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<"updateError" | "duplicateError" | null>(null);
  useEffect(() => { if (query.data) restoreSpaceListScroll(); }, [query.data]);
  const begin = (next: SpaceAction) => {
    setError(null);
    setName(next.kind === "create" ? t("untitled") : next.title);
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
      setError("updateError");
    } finally { setBusy(false); }
  };
  const duplicate = async (id: string) => {
    if (busy) return;
    setBusy(true); setError(null);
    try { sync(await copyGenerationGraph(id)); }
    catch { setError("duplicateError"); }
    finally { setBusy(false); }
  };
  return (
    <AppPageShell aria-label={t("title")}>
      <h1 className="sr-only">{t("title")}</h1>
      <AppFilterToolbar>
        <div className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row sm:items-center">
          <AppSearchField value={search} onChange={(event) => setSearch(event.target.value)} placeholder={t("search")} aria-label={t("search")} containerClassName="sm:max-w-sm" />
          <AppSortSelect
            value={sort}
            onValueChange={setSort}
            ariaLabel={t("sort")}
            className="w-full sm:w-40"
            options={[
              { value: "updated", label: t("updated") },
              { value: "created", label: t("created") },
              { value: "name", label: t("nameSort") },
            ]}
          />
          <span role="status" className="shrink-0 text-xs text-muted-foreground sm:ml-2">{term ? t("filteredCount", { count: spaces.length, total: query.data?.length ?? 0 }) : t("count", { count: spaces.length })}</span>
        </div>
        <AppButton variant="brand" size="toolbar" onClick={() => begin({ kind: "create" })} disabled={busy}><Plus aria-hidden="true" />{t("new")}</AppButton>
      </AppFilterToolbar>
      {error && !action ? <p role="alert" className="text-destructive">{t(error)}</p> : null}
      {query.isLoading ? <ResourceListLoading label={t("loading")} /> : null}
      {query.isError ? <AppCard variant="editorial-flat" radius="lg" className="p-8" role="alert"><p>{t("loadError")}</p><AppButton variant="surface" className="mt-4" onClick={() => void query.refetch()}>{t("retry")}</AppButton></AppCard> : null}
      {!query.isLoading && !query.isError && !query.data?.length ? <AppCard variant="editorial-flat" radius="lg" className="flex min-h-[320px] flex-col items-center justify-center gap-3 px-6 text-center">
        <Workflow className="size-8 text-muted-foreground" aria-hidden />
        <h2 className="text-lg font-semibold">{t("emptyTitle")}</h2><p className="text-sm text-muted-foreground">{t("emptyDescription")}</p>
        <AppButton variant="brand" className="mt-3" onClick={() => begin({ kind: "create" })} disabled={busy}>{t("create")}</AppButton>
      </AppCard> : null}
      {!query.isLoading && !query.isError && Boolean(query.data?.length) && spaces.length === 0 ? <AppCard variant="editorial-flat" radius="lg" className="flex min-h-[240px] flex-col items-center justify-center gap-3 p-6 text-center">
        <p className="text-sm text-muted-foreground">{t("noResults")}</p>
        <AppButton variant="surface" onClick={() => setSearch("")}>{t("clearSearch")}</AppButton>
      </AppCard> : null}
      {spaces.length ? <AppResourceList aria-label={t("title")}>
        {spaces.map((space) => <div key={space.id} role="listitem">
          <article className={resourceRowInteractiveClassName + " grid grid-cols-[2.5rem_minmax(0,1fr)] items-center gap-4 border-b px-4 py-5 sm:grid-cols-[2.5rem_minmax(0,1fr)_auto]"}>
            <div className="flex size-10 items-center justify-center rounded-md border border-white/10 bg-white/[0.035]"><Workflow className="size-6 text-white/66" aria-hidden /></div>
            <div className="min-w-0">
              <h2 className="truncate text-sm font-medium"><ResourceRowLink href={`/spaces/${space.id}`} aria-disabled={busy || undefined} onNavigate={(event) => { if (busy) event.preventDefault(); else rememberSpaceListEntry(space.id); }}>{space.title}</ResourceRowLink></h2>
              <p className="mt-2 text-xs text-muted-foreground">{t("modified")} <time dateTime={space.updatedAt}>{format.dateTime(new Date(space.updatedAt), { dateStyle: "medium", timeStyle: "short" })}</time></p>
            </div>
            <div className="relative z-20 col-start-2 flex gap-2 sm:col-auto">
              <AppButton variant="ghost" size="icon-sm" disabled={busy} aria-label={t("renameLabel", { title: space.title })} onClick={() => begin({ kind: "rename", id: space.id, title: space.title })}><Pencil aria-hidden="true" /></AppButton>
              <AppButton variant="ghost" size="icon-sm" disabled={busy} aria-label={t("duplicateLabel", { title: space.title })} onClick={() => void duplicate(space.id)}><Copy aria-hidden="true" /></AppButton>
              <AppButton variant="ghost" size="icon-sm" className="text-destructive hover:text-destructive" disabled={busy} aria-label={t("deleteLabel", { title: space.title })} onClick={() => begin({ kind: "delete", id: space.id, title: space.title })}><Trash2 aria-hidden="true" /></AppButton>
            </div>
          </article>
        </div>)}
      </AppResourceList> : null}
      <AppDialog open={Boolean(action)} onOpenChange={(open) => { if (!open && !busy) setAction(null); }}>
        <AppDialogContent size="sm">
          <AppDialogTitle>{action?.kind === "delete" ? t("deleteTitle") : action?.kind === "rename" ? t("renameTitle") : t("new")}</AppDialogTitle>
          <AppDialogDescription>{action?.kind === "delete" ? t("deleteDescription", { title: action.title }) : t("namePrompt")}</AppDialogDescription>
          <form className="flex flex-col gap-4" onSubmit={(event) => { event.preventDefault(); void confirm(); }}>
            {action?.kind !== "delete" ? <AppInput aria-label={t("name")} autoFocus maxLength={120} value={name} disabled={busy} onChange={(event) => setName(event.target.value)} /> : null}
            <div className="min-h-10" aria-live="polite">{error ? <p role="alert" className="text-red-300">{t(error)}</p> : null}</div>
            <div className="flex justify-end gap-2"><AppButton type="button" variant="surface" disabled={busy} onClick={() => setAction(null)}>{t("cancel")}</AppButton>
              <AppButton type="submit" className="min-w-28" variant={action?.kind === "delete" ? "danger" : "brand"} disabled={busy || (action?.kind !== "delete" && !name.trim())}>{busy ? t("busy") : action?.kind === "delete" ? t("delete") : t("save")}</AppButton></div>
          </form>
        </AppDialogContent>
      </AppDialog>
    </AppPageShell>
  );
}
