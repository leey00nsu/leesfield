"use client";
import { useTranslations } from "next-intl";
import { Star } from "lucide-react";
import { AppButton } from "@/shared/ui/app-button";
import { AppSelectRoot, AppSelectTrigger, AppSelectValue, AppSelectContent, AppSelectItem } from "@/shared/ui/app-select";
import type { AssetProjectDto } from "@/shared/media-assets/asset-project-contract";
import type { AssetListFilters } from "../api/media-asset-api";
import { folderPath } from "../lib/asset-ui";

export function AssetProjectSelect({ label, value, onChange, options, disabled = false, className = "w-full sm:w-48" }: {
  label: string; value: string; onChange: (value: string) => void;
  options: { value: string; label: string }[]; disabled?: boolean; className?: string;
}) {
  return <AppSelectRoot value={value} onValueChange={next => { if (next !== null) onChange(next); }} disabled={disabled}>
    <AppSelectTrigger aria-label={label} className={className}><AppSelectValue>{options.find(option => option.value === value)?.label}</AppSelectValue></AppSelectTrigger>
    <AppSelectContent className="z-[10050]">{options.map(option => <AppSelectItem key={option.value} value={option.value}>{option.label}</AppSelectItem>)}</AppSelectContent>
  </AppSelectRoot>;
}
export function AssetProjectFilters({ value, onChange, projects }: { value: AssetListFilters; onChange: (value: AssetListFilters) => void; projects?: AssetProjectDto[] }) {
  const t = useTranslations("assets");
  return <div className="flex min-w-0 flex-wrap items-center gap-2">
    <AssetProjectSelect label={t("project")} value={value.projectId ?? "all"} onChange={projectId => onChange({ ...value, projectId: projectId === "all" ? undefined : projectId })}
      options={[{ value: "all", label: t("allProjects") }, { value: "root", label: t("noProject") }, ...(projects ?? []).map(project => ({ value: project.id, label: folderPath(project.id, projects ?? []) }))]} />
    <AppButton size="sm" variant={value.starred ? "surface-muted" : "ghost"} aria-pressed={!!value.starred} onClick={() => onChange({ ...value, starred: value.starred ? undefined : true })}><Star className="size-3.5" />{t("starred")}</AppButton>
  </div>;
}
