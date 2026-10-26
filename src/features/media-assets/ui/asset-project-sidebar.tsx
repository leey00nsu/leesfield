"use client";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { ChevronDown, ChevronRight, Folder, FolderOpen, Plus, Settings2, Star } from "lucide-react";
import type { AssetProjectDto } from "@/shared/media-assets/asset-project-contract";
import type { AssetListFilters } from "../api/media-asset-api";
import { AppButton } from "@/shared/ui/app-button";
import { AppPageSidebar } from "@/shared/ui/app-page-sidebar";
import { cn } from "@/shared/lib/utils";

export function AssetProjectSidebar({ projects, filters, onSelect, onNew, onSettings, loading, error, onRetry }: {
  projects: AssetProjectDto[]; filters: AssetListFilters; onSelect: (projectId?: string, starred?: boolean) => void;
  onNew: () => void; onSettings: (project: AssetProjectDto) => void; loading: boolean; error: boolean; onRetry: () => void;
}) {
  const t = useTranslations("assets");
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  function select(close: () => void, projectId?: string, starred?: boolean) { onSelect(projectId, starred); close(); }
  function tree(parentId: string | null, close: () => void, depth = 0): React.ReactNode {
    if (depth >= 32) return null;
    return <ul className={cn("flex min-w-0 flex-col gap-1", depth > 0 && depth <= 5 && "ml-3 border-l border-border pl-2")}>{projects.filter(project => project.parentId === parentId).map(project => {
      const hasChildren = projects.some(child => child.parentId === project.id), expanded = !collapsed.has(project.id);
      return <li key={project.id} className="min-w-0">
        <div className="group flex min-w-0 items-center gap-0.5">
          {hasChildren ? <AppButton size="icon-sm" variant="ghost" className="shrink-0" aria-label={t(expanded ? "collapseProject" : "expandProject", { name: project.name })} aria-expanded={expanded} onClick={() => setCollapsed(previous => { const next = new Set(previous); if (next.has(project.id)) next.delete(project.id); else next.add(project.id); return next; })}>{expanded ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}</AppButton> : <Folder className="mx-3 size-4 shrink-0 text-muted-foreground" />}
          <AppButton size="sm" variant={filters.projectId === project.id ? "surface-muted" : "ghost"} aria-pressed={filters.projectId === project.id} title={project.name} className="min-w-0 flex-1 justify-start px-2" onClick={() => select(close, project.id)}><span className="truncate">{project.name}</span></AppButton>
          <AppButton size="icon-sm" variant="ghost" className="shrink-0 text-muted-foreground" aria-label={t("projectSettingsFor", { name: project.name })} onClick={() => onSettings(project)}><Settings2 className="size-3.5" /></AppButton>
        </div>
        {hasChildren && expanded && tree(project.id, close, depth + 1)}
      </li>;
    })}</ul>;
  }
  return <AppPageSidebar title={t("title")} navigationLabel={t("navigation")} toggleLabel={t("toggleNavigation")} navigationId="asset-project-navigation">{close => <>
      <div className="flex flex-col gap-1">
        <AppButton size="sm" variant={!filters.projectId && !filters.starred ? "surface-muted" : "ghost"} aria-pressed={!filters.projectId && !filters.starred} className="justify-start" onClick={() => select(close)}><FolderOpen className="size-4" />{t("all")}</AppButton>
        <AppButton size="sm" variant={filters.starred && !filters.projectId ? "surface-muted" : "ghost"} aria-pressed={!!filters.starred && !filters.projectId} className="justify-start" onClick={() => select(close, undefined, true)}><Star className="size-4" />{t("starred")}</AppButton>
        <AppButton size="sm" variant={filters.projectId === "root" ? "surface-muted" : "ghost"} aria-pressed={filters.projectId === "root"} className="justify-start" onClick={() => select(close, "root")}><Folder className="size-4" />{t("noProject")}</AppButton>
      </div>
      <div><div className="mb-2 flex items-center justify-between"><h3 className="text-xs font-medium text-muted-foreground">{t("projects")}</h3><AppButton size="icon-sm" variant="ghost" aria-label={t("newProject")} onClick={onNew}><Plus className="size-4" /></AppButton></div>{tree(null, close)}
        {loading && <p role="status" className="p-2 text-xs text-muted-foreground">{t("loading")}</p>}
        {!loading && !error && !projects.length && <p className="p-2 text-xs text-muted-foreground">{t("noProjects")}</p>}
        {error && <div className="p-2 text-xs"><p role="alert">{t("error")}</p><AppButton size="sm" variant="ghost" onClick={onRetry}>{t("retry")}</AppButton></div>}
      </div>
    </>}</AppPageSidebar>;
}
