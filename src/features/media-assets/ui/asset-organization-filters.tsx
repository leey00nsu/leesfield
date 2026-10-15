"use client";
import { useTranslations } from "next-intl";
import { Star, FolderOpen, Settings2 } from "lucide-react";
import { AppButton } from "@/shared/ui/app-button";
import type { AssetOrganizationDto } from "@/shared/media-assets/asset-organization-contract";
import type { AssetListFilters } from "../api/media-asset-api";
import { folderPath } from "../lib/asset-ui";

export const assetSelectClass = "h-9 min-w-0 max-w-full rounded-lg border border-input bg-background px-2 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
export function AssetOrganizationFilters({ value, onChange, organization, onManage, writable = true }: {
  value: AssetListFilters; onChange: (value: AssetListFilters) => void; organization?: AssetOrganizationDto; onManage: () => void; writable?: boolean;
}) {
  const t = useTranslations("assets");
  return <div className="flex min-w-0 flex-wrap items-center gap-2">
    <label className="flex min-w-0 flex-1 items-center gap-1 sm:flex-none"><FolderOpen className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      <select aria-label={t("folder")} className={assetSelectClass+" w-full sm:max-w-56"} value={value.folderId ?? "all"} onChange={event => onChange({ ...value, folderId: event.target.value === "all" ? undefined : event.target.value })}>
        <option value="all">{t("allFolders")}</option><option value="root">{t("root")}</option>
        {organization?.folders.map(folder => <option key={folder.id} value={folder.id}>{folderPath(folder.id, organization.folders)}</option>)}
      </select>
    </label>
    <AppButton size="sm" variant={value.starred ? "surface-muted" : "ghost"} aria-pressed={!!value.starred} onClick={() => onChange({ ...value, starred: value.starred ? undefined : true })}><Star className="size-3.5" />{t("starred")}</AppButton>
    <AppButton size="icon-sm" variant="ghost" aria-label={t("manage")} disabled={!writable} onClick={onManage}><Settings2 className="size-4" /></AppButton>
    {!!organization?.tags.length && <div className="flex w-full flex-wrap gap-1" aria-label={t("tags")}>
      {organization.tags.map(tag => <AppButton key={tag.id} size="sm" variant={value.tagIds?.includes(tag.id) ? "surface-muted" : "ghost"} aria-pressed={!!value.tagIds?.includes(tag.id)} onClick={() => onChange({ ...value, tagIds: value.tagIds?.includes(tag.id) ? value.tagIds.filter(id => id !== tag.id) : [...value.tagIds ?? [], tag.id] })} className="h-7 text-xs">#{tag.name}</AppButton>)}
    </div>}
  </div>;
}
