"use client";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { AppDialog, AppDialogContent, AppDialogHeader, AppDialogTitle, AppDialogDescription } from "@/shared/ui/app-dialog";
import { AppButton } from "@/shared/ui/app-button";
import { AppInput } from "@/shared/ui/app-input";
import { useAssetOrganization, useWriteAssetOrganization } from "../hook/use-media-assets";
import { assetErrorKey, folderPath } from "../lib/asset-ui";
import { assetSelectClass } from "./asset-organization-filters";

export function AssetOrganizationManager({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const t = useTranslations("assets");
  const org = useAssetOrganization(open);
  const write = useWriteAssetOrganization();
  const [kind, setKind] = useState<"folders" | "tags">("folders");
  const [selected, setSelected] = useState("");
  const [name, setName] = useState("");
  const [parent, setParent] = useState("root");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const entity = kind === "folders" ? org.data?.folders.find(item => item.id === selected) : org.data?.tags.find(item => item.id === selected);
  const changeEntity = (id: string) => {
    const next = kind === "folders" ? org.data?.folders.find(item => item.id === id) : org.data?.tags.find(item => item.id === id);
    setSelected(id); setName(next?.name ?? ""); setParent(kind === "folders" ? org.data?.folders.find(item => item.id === id)?.parentId ?? "root" : "root"); setConfirmDelete(false); setError(null);
  };
  async function submit(remove = false) {
    if (write.isPending || (selected && !entity)) return;
    setError(null);
    try {
      await write.mutateAsync({ path: `/${kind}${entity ? "/" + encodeURIComponent(entity.id) : ""}`, method: remove ? "DELETE" : entity ? "PATCH" : "POST",
        body: remove ? { expectedVersion: entity!.version } : { name, ...(entity ? { expectedVersion: entity.version } : {}), ...(kind === "folders" ? { parentId: parent === "root" ? null : parent } : {}) } });
      setSelected(""); setName(""); setConfirmDelete(false); setParent("root");
    } catch (err) { setError(t(assetErrorKey(err))); }
  }
  return <AppDialog open={open} onOpenChange={value => { if (!write.isPending) { onOpenChange(value); if (!value) changeEntity(""); } }}>
    <AppDialogContent size="md" className="z-[10020] max-h-[calc(100dvh-2rem)] overflow-y-auto">
      <AppDialogHeader className="flex-col"><AppDialogTitle>{t("manage")}</AppDialogTitle><AppDialogDescription>{t("organizationDescription")}</AppDialogDescription></AppDialogHeader>
      <div className="flex gap-2">{(["folders", "tags"] as const).map(value => <AppButton key={value} variant={value === kind ? "surface-muted" : "ghost"} size="sm" aria-pressed={value === kind} onClick={() => { setKind(value); changeEntity(""); }}>{t(value)}</AppButton>)}</div>
      {org.isError && <p role="alert" className="text-sm text-destructive">{t("error")}</p>}
      <form className="flex flex-col gap-4" onSubmit={event => { event.preventDefault(); void submit(); }}>
        <label className="flex flex-col gap-1 text-xs">{t("editOrganization")}<select className={assetSelectClass} value={selected} onChange={event => changeEntity(event.target.value)} disabled={write.isPending}>
          <option value="">{t("createNew")}</option>{(kind === "folders" ? org.data?.folders : org.data?.tags)?.map(item => <option key={item.id} value={item.id}>{kind === "folders" ? folderPath(item.id, org.data!.folders) : item.name}</option>)}
        </select></label>
        <label className="flex flex-col gap-1 text-xs">{t("name")}<AppInput required maxLength={255} value={name} disabled={write.isPending} onChange={event => setName(event.target.value)} /></label>
        {kind === "folders" && <label className="flex flex-col gap-1 text-xs">{t("parent")}<select className={assetSelectClass} value={parent} disabled={write.isPending} onChange={event => setParent(event.target.value)}><option value="root">{t("root")}</option>{org.data?.folders.filter(folder => folder.id !== selected).map(folder => <option key={folder.id} value={folder.id}>{folderPath(folder.id, org.data!.folders)}</option>)}</select></label>}
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <div className="flex flex-wrap gap-2"><AppButton type="submit" size="sm" disabled={write.isPending || !name.trim() || org.isLoading}>{t(write.isPending ? "saving" : entity ? "save" : "create")}</AppButton>
          {entity && <AppButton type="button" variant="danger" size="sm" disabled={write.isPending} onClick={() => setConfirmDelete(true)}>{t("delete")}</AppButton>}</div>
      </form>
      {confirmDelete && <div role="group" aria-label={t("confirmDelete")} className="rounded-lg border border-border p-3 text-sm"><p>{t(kind === "folders" ? "deleteFolderDescription" : "deleteTagDescription")}</p><div className="mt-3 flex gap-2"><AppButton variant="danger" size="sm" disabled={write.isPending} onClick={() => void submit(true)}>{t("confirmDelete")}</AppButton><AppButton variant="ghost" size="sm" disabled={write.isPending} onClick={() => setConfirmDelete(false)}>{t("cancel")}</AppButton></div></div>}
    </AppDialogContent>
  </AppDialog>;
}
