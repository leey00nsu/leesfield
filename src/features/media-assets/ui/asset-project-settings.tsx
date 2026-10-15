"use client";
import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Folder, Loader2, Upload } from "lucide-react";
import type { AssetProjectDto } from "@/shared/media-assets/asset-project-contract";
import { VariantImage } from "@/shared/media-assets/variant-image";
import { AppButton } from "@/shared/ui/app-button";
import { AppInput } from "@/shared/ui/app-input";
import { AppTextarea } from "@/shared/ui/app-form-control";
import { AppDialog, AppDialogContent, AppDialogHeader, AppDialogTitle, AppDialogDescription } from "@/shared/ui/app-dialog";
import { AppConfirmDialog, AppConfirmDialogContent, AppConfirmDialogHeader, AppConfirmDialogTitle, AppConfirmDialogDescription, AppConfirmDialogFooter, AppConfirmDialogCancel, AppConfirmDialogAction } from "@/shared/ui/app-confirm-dialog";
import { useAssetProjects, useUploadMediaAsset, useWriteAssetProject } from "../hook/use-media-assets";
import { assetErrorKey, folderPath } from "../lib/asset-ui";
import { MediaAssetPicker } from "./media-asset-picker";
import { useUnsavedAssetClose } from "../hook/use-unsaved-asset-close";
import { AssetProjectSelect } from "./asset-project-filters";

export function AssetProjectSettings({ project, parentId = null, onClose, onSaved }: {
  project: AssetProjectDto | null; parentId?: string | null; onClose: () => void; onSaved?: (project: AssetProjectDto | null) => void;
}) {
  const t = useTranslations("assets");
  const projects = useAssetProjects();
  const write = useWriteAssetProject(), upload = useUploadMediaAsset();
  const [name, setName] = useState(project?.name ?? "");
  const [description, setDescription] = useState(project?.description ?? "");
  const [parent, setParent] = useState(project?.parentId ?? parentId);
  const [coverId, setCoverId] = useState(project?.coverAssetId ?? null);
  const [cover, setCover] = useState(project?.cover ?? null);
  const [chooseCover, setChooseCover] = useState(false), [confirm, setConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const busy = write.isPending || upload.isPending;
  const guard = useUnsavedAssetClose(onClose, busy || confirm || chooseCover);
  const dirty = name.trim() !== (project?.name ?? "") || description.trim() !== (project?.description ?? "") || parent !== (project?.parentId ?? parentId) || coverId !== (project?.coverAssetId ?? null);
  const { setDirty } = guard;
  useEffect(() => { setDirty(dirty); }, [dirty, setDirty]);
  const candidates = (projects.data ?? []).filter(candidate => {
    const seen = new Set<string>();
    let current: AssetProjectDto | undefined = candidate;
    while (current && !seen.has(current.id)) {
      if (current.id === project?.id) return false;
      seen.add(current.id); current = projects.data?.find(item => item.id === current?.parentId);
    }
    return true;
  });
  async function save() {
    setError(null);
    try {
      const body = { name: name.trim(), description, parentId: parent, coverAssetId: coverId };
      const saved = project
        ? await write.mutateAsync({ method: "PATCH", id: project.id, body: { ...body, expectedVersion: project.version } })
        : await write.mutateAsync({ method: "POST", body });
      onSaved?.(saved ?? null); onClose();
    } catch (err) { setError(t(assetErrorKey(err))); }
  }
  return <>
    <AppDialog open onOpenChange={open => { if (!open) guard.requestClose(); }}>
      <AppDialogContent size="md" className="z-[10020] max-h-[calc(100dvh-2rem)] overflow-y-auto">
        <AppDialogHeader className="flex-col gap-2 pr-12"><AppDialogTitle>{t(project ? "projectSettings" : "newProject")}</AppDialogTitle><AppDialogDescription>{t("organizationDescription")}</AppDialogDescription></AppDialogHeader>
        <form className="flex min-w-0 flex-col gap-5" onSubmit={event => { event.preventDefault(); void save(); }}>
          <fieldset disabled={busy} className="flex min-w-0 flex-col gap-5">
            <label className="flex flex-col gap-2 text-sm">{t("projectName")}<AppInput required autoFocus maxLength={255} value={name} onChange={event => setName(event.target.value)} /></label>
            <label className="flex flex-col gap-2 text-sm">{t("projectDescription")}<AppTextarea maxLength={2000} value={description} onChange={event => setDescription(event.target.value)} className="min-h-24 resize-y" /></label>
            <div className="flex flex-col gap-2 text-sm"><span>{t("parentProject")}</span><AssetProjectSelect label={t("parentProject")} value={parent ?? "root"} className="w-full" disabled={!projects.data} onChange={value => setParent(value === "root" ? null : value)} options={[{ value: "root", label: t("topLevel") }, ...candidates.map(item => ({ value: item.id, label: folderPath(item.id, projects.data ?? []) }))]} /></div>
            <section className="flex min-w-0 flex-col gap-3" aria-label={t("projectCover")}><h3 className="text-sm">{t("projectCover")}</h3>
              <div className="flex aspect-video w-full items-center justify-center overflow-hidden rounded-xl border border-border bg-muted/20">{cover ? <VariantImage asset={cover} alt={t("projectCover")} className="size-full object-cover" /> : <Folder className="size-10 text-muted-foreground" />}</div>
              <div className="flex flex-wrap gap-2"><AppButton size="sm" variant="surface" onClick={() => setChooseCover(true)}>{t("chooseCover")}</AppButton><AppButton size="sm" variant="surface" onClick={() => input.current?.click()}><Upload className="size-4" />{t("uploadCover")}</AppButton>{coverId && <AppButton size="sm" variant="ghost" onClick={() => { setCoverId(null); setCover(null); }}>{t("removeCover")}</AppButton>}</div>
              <input ref={input} type="file" accept="image/png,image/jpeg,image/webp,image/gif,image/avif" className="sr-only" tabIndex={-1} aria-label={t("uploadCover")} onChange={async event => {
                const file = event.target.files?.[0]; event.target.value = ""; if (!file) return;
                setError(null);
                try { const asset = await upload.mutateAsync({ file, type: "image" }); setCoverId(asset.id); setCover({ id: asset.id, url: asset.url, imageVariants: asset.imageVariants ?? null }); }
                catch (err) { setError(t(assetErrorKey(err))); }
              }} />
              {upload.isPending && <p role="status" className="flex items-center gap-2 text-xs"><Loader2 className="size-4 animate-spin motion-reduce:animate-none" />{t("uploading")}</p>}
            </section>
          </fieldset>
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          {projects.isError && <p role="alert" className="text-sm text-destructive">{t("error")} <AppButton size="sm" variant="ghost" onClick={() => void projects.refetch()}>{t("retry")}</AppButton></p>}
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
            <div>{project && <AppButton variant="danger" size="sm" disabled={busy} onClick={() => setConfirm(true)}>{t("deleteProject")}</AppButton>}</div>
            <div className="flex gap-2"><AppButton variant="surface" disabled={busy} onClick={guard.requestClose}>{t("cancel")}</AppButton><AppButton variant="brand" type="submit" disabled={busy || !dirty || !name.trim() || !projects.data}>{t(write.isPending ? "saving" : project ? "save" : "create")}</AppButton></div>
          </div>
        </form>
      </AppDialogContent>
    </AppDialog>
    {guard.confirmation}
    <MediaAssetPicker mediaType="image" className="z-[10040]" selectedAssetId={coverId} writable={!busy} open={chooseCover} onOpenChange={setChooseCover} allowDetails={false} onSelect={asset => { setCoverId(asset.id); setCover({ id: asset.id, url: asset.url, imageVariants: asset.imageVariants ?? null }); setChooseCover(false); }} />
    <AppConfirmDialog open={confirm} onOpenChange={value => { if (!busy) setConfirm(value); }}><AppConfirmDialogContent className="z-[10060]"><AppConfirmDialogHeader><AppConfirmDialogTitle>{t("deleteProject")}</AppConfirmDialogTitle><AppConfirmDialogDescription>{t("deleteProjectDescription")}</AppConfirmDialogDescription></AppConfirmDialogHeader><AppConfirmDialogFooter><AppConfirmDialogCancel disabled={busy}>{t("cancel")}</AppConfirmDialogCancel><AppConfirmDialogAction variant="danger" disabled={busy} onClick={async event => {
      event.preventDefault(); if (!project) return; setError(null);
      try { await write.mutateAsync({ method: "DELETE", id: project.id, body: { expectedVersion: project.version } }); onSaved?.(null); onClose(); }
      catch (err) { setError(t(assetErrorKey(err))); setConfirm(false); }
    }}>{t("confirmDelete")}</AppConfirmDialogAction></AppConfirmDialogFooter></AppConfirmDialogContent></AppConfirmDialog>
  </>;
}
