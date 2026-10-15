"use client";

import { useId, useRef, useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { ChevronDown, ChevronRight, Folder, Loader2, Search } from "lucide-react";
import type { AssetProjectDto } from "@/shared/media-assets/asset-project-contract";
import { VariantImage } from "@/shared/media-assets/variant-image";
import { AppButton } from "@/shared/ui/app-button";
import { AppInput } from "@/shared/ui/app-input";
import {
  AppDialog, AppDialogContent, AppDialogHeader, AppDialogTitle, AppDialogDescription,
  AppDialogTrigger, AppDialogFooter, AppDialogCancelButton, AppDialogActionButton,
} from "@/shared/ui/app-dialog";
import { cn } from "@/shared/lib/utils";
import { folderPath } from "../lib/asset-ui";

const MAX_PROJECTS = 100;

function ProjectCover({ project }: { project?: AssetProjectDto }) {
  return <span className="flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-muted/40">
    {project?.cover ? <VariantImage asset={project.cover} purpose="list" alt="" className="size-full object-cover" /> : <Folder aria-hidden className="size-4 text-muted-foreground" />}
  </span>;
}

export function AssetProjectMembershipField({ value, onChange, projects, loading = false, error = false, onRetry, disabled = false }: {
  value: string[];
  onChange: (ids: string[]) => void;
  projects?: AssetProjectDto[];
  loading?: boolean;
  error?: boolean;
  onRetry: () => void;
  disabled?: boolean;
}) {
  const t = useTranslations("assets");
  const [open, setOpen] = useState(false);
  const [selection, setSelection] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const trigger = useRef<HTMLButtonElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const listId = useId();
  const items = projects ?? [];
  const byId = new Map(items.map(project => [project.id, project]));
  const unavailable = loading || error || !projects || disabled;
  const term = query.trim().normalize("NFC").toLocaleLowerCase();
  const matches = term ? items.filter(project => folderPath(project.id, items).normalize("NFC").toLocaleLowerCase().includes(term)) : [];

  function changeOpen(next: boolean) {
    if (next && disabled) return;
    if (next) {
      setSelection([...value]); setQuery("");
      const ancestors = new Set<string>();
      for (const id of value) {
        let current = byId.get(id);
        const seen = new Set<string>();
        while (current?.parentId && !seen.has(current.id)) {
          seen.add(current.id); ancestors.add(current.parentId); current = byId.get(current.parentId);
        }
      }
      setExpanded(ancestors);
    }
    setOpen(next);
  }
  function toggle(id: string) {
    setSelection(previous => previous.includes(id) ? previous.filter(item => item !== id) : previous.length < MAX_PROJECTS ? [...previous, id] : previous);
  }
  function row(project: AssetProjectDto, depth = 0, flat = false) {
    const children = items.some(child => child.parentId === project.id);
    const checked = selection.includes(project.id);
    const isExpanded = expanded.has(project.id);
    const path = folderPath(project.id, items);
    return <li key={project.id} className="min-w-0">
      <div className={cn("flex min-h-14 min-w-0 items-center gap-2 rounded-xl py-1.5 pr-3 hover:bg-foreground/5", checked && "bg-foreground/5")}
        style={{ paddingLeft: 8 + Math.min(depth, 5) * 16 }}>
        {!flat && children ? <AppButton type="button" size="icon-sm" variant="ghost" className="size-7 shrink-0" disabled={unavailable}
          aria-label={t(isExpanded ? "collapseProject" : "expandProject", { name: project.name })} aria-expanded={isExpanded}
          aria-controls={listId + project.id} onClick={() => setExpanded(previous => { const next = new Set(previous); if (next.has(project.id)) next.delete(project.id); else next.add(project.id); return next; })}>
          {isExpanded ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
        </AppButton> : null}
        <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-3">
          <ProjectCover project={project} />
          <span className="min-w-0 flex-1"><span className="block truncate text-sm" title={path}>{project.name}</span>
            {flat && project.parentId && <span className="block truncate text-xs text-muted-foreground">{path}</span>}
          </span>
          <input type="checkbox" aria-label={path} checked={checked} disabled={unavailable || (!checked && selection.length >= MAX_PROJECTS)} onChange={() => toggle(project.id)}
            className="size-4 shrink-0 cursor-pointer accent-primary disabled:cursor-default" />
        </label>
      </div>
      {!flat && children && isExpanded && depth < 31 && <ul id={listId + project.id} className="min-w-0">{tree(project.id, depth + 1)}</ul>}
    </li>;
  }
  function tree(parentId: string | null, depth = 0): ReactNode {
    return items.filter(project => project.parentId === parentId || (parentId === null && project.parentId && !byId.has(project.parentId))).map(project => row(project, depth));
  }

  return <fieldset className="grid min-w-0 gap-3">
    <legend className="mb-2 text-sm">{t("projects")}</legend>
    <div className="grid min-w-0 gap-2">
      {value.length ? value.map(id => {
        const project = byId.get(id), path = folderPath(id, items) || id;
        return <div key={id} className="flex min-w-0 items-center gap-3 rounded-xl bg-foreground/5 px-3 py-2" title={path}>
          <ProjectCover project={project} /><span className="min-w-0"><span className="block truncate text-sm">{project?.name ?? id}</span>
            {project?.parentId && <span className="block truncate text-xs text-muted-foreground">{path}</span>}
          </span>
        </div>;
      }) : <p className="text-sm text-muted-foreground">{t("noProject")}</p>}
    </div>
    <AppDialog open={open} onOpenChange={next => changeOpen(next)}>
      <AppDialogTrigger asChild><AppButton ref={trigger} type="button" variant="surface" disabled={disabled} className="h-11 w-full justify-between rounded-xl text-sm">
        {t(value.length ? "changeProjects" : "selectProjects")}<ChevronRight className="size-4 shrink-0" />
      </AppButton></AppDialogTrigger>
      <AppDialogContent size="sm" initialFocus={search} finalFocus={trigger} overlayClassName="z-[10020]" className="z-[10030] h-[min(640px,calc(100dvh-2rem))] grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden">
        <AppDialogHeader className="pr-10"><AppDialogTitle>{t("selectProjects")}</AppDialogTitle>
          <AppDialogDescription className="sr-only">{t("projectMembershipHint")}</AppDialogDescription>
        </AppDialogHeader>
        <div className="flex min-h-0 min-w-0 flex-col gap-3 rounded-xl bg-foreground/[0.04] p-3">
          <div className="relative shrink-0"><Search aria-hidden className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <AppInput ref={search} aria-label={t("searchProjects")} placeholder={t("searchProjects")} value={query} onChange={event => setQuery(event.target.value)} className="h-11 rounded-xl pl-10" />
          </div>
          <div className="flex shrink-0 items-center justify-between gap-2 text-xs text-muted-foreground"><span role="status">{t("selectedProjects", { count: selection.length })}</span>
            <AppButton type="button" size="sm" variant="ghost" disabled={unavailable || !selection.length} onClick={() => setSelection([])}>{t("clearProjectSelection")}</AppButton>
          </div>
          <div className="app-scrollbar min-h-0 flex-1 overflow-y-auto overscroll-contain">
            {loading && <p role="status" className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin motion-reduce:animate-none" />{t("loading")}</p>}
            {error && <div className="grid justify-items-center gap-3 py-8"><p role="alert" className="text-sm text-destructive">{t("error")}</p><AppButton type="button" variant="surface" size="sm" onClick={onRetry}>{t("retry")}</AppButton></div>}
            {!loading && !error && projects && !items.length && <p className="py-8 text-center text-sm text-muted-foreground">{t("noProjects")}</p>}
            {!loading && !error && term && items.length > 0 && !matches.length && <p className="py-8 text-center text-sm text-muted-foreground">{t("noProjectResults")}</p>}
            {!loading && !error && <ul aria-label={t("projects")} className="min-w-0">{term ? matches.map(project => row(project, 0, true)) : tree(null)}</ul>}
            {!loading && !error && selection.filter(id => !byId.has(id)).map(id => <label key={id} className="flex min-w-0 items-center gap-3 rounded-xl px-3 py-2 text-sm text-muted-foreground"><Folder className="size-4 shrink-0" /><span className="min-w-0 flex-1 break-all">{id}</span><input type="checkbox" aria-label={id} checked disabled={unavailable} onChange={() => toggle(id)} className="size-4 shrink-0 accent-primary" /></label>)}
          </div>
          {selection.length >= MAX_PROJECTS && <p role="status" className="shrink-0 text-xs text-muted-foreground">{t("projectSelectionLimit", { count: MAX_PROJECTS })}</p>}
        </div>
        <AppDialogFooter className="m-0 shrink-0 flex-row justify-end rounded-none border-0 bg-transparent p-0">
          <AppDialogCancelButton type="button" onClick={() => changeOpen(false)}>{t("cancel")}</AppDialogCancelButton>
          <AppDialogActionButton type="button" disabled={unavailable} onClick={() => { onChange([...selection]); changeOpen(false); }}>{t("completeProjectSelection")}</AppDialogActionButton>
        </AppDialogFooter>
      </AppDialogContent>
    </AppDialog>
    {error && <div className="flex items-center gap-2 text-xs"><p role="alert" className="text-destructive">{t("error")}</p><AppButton type="button" size="sm" variant="ghost" onClick={onRetry}>{t("retry")}</AppButton></div>}
  </fieldset>;
}
