"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { useClipboardCopy } from "@/shared/ui/use-clipboard-copy";
import { Copy, RotateCcw, Star } from "lucide-react";
import type { MediaAssetDto } from "@/shared/media-assets/media-asset-contract";
import { getMediaAssetName, getMediaAssetReferenceId } from "@/shared/media-assets/media-asset-name";
import { AppButton } from "@/shared/ui/app-button";
import { AppInput } from "@/shared/ui/app-input";
import { AppSelect, AppTextarea } from "@/shared/ui/app-form-control";
import { AppDetailSection } from "@/shared/ui/app-detail-rail";
import { AppMediaDetailRail } from "@/shared/ui/app-media-detail-rail";
import type { AppTabItem } from "@/shared/ui/app-tabs";
import { useAssetProjects, useMediaAsset, usePatchAssetMetadata } from "../hook/use-media-assets";
import { assetErrorKey } from "../lib/asset-ui";
import { AssetProjectMembershipField } from "./asset-project-membership-field";

type PanelProps = {
  assetId: string | null;
  onClose: () => void;
  writable?: boolean;
  busy?: boolean;
  onBusyChange?: (busy: boolean) => void;
  onDirtyChange?: (dirty: boolean) => void;
  notice?: ReactNode;
  tabs?: AppTabItem[];
  actions?: ReactNode;
  testId?: string;
};

const fieldClass = "h-12 w-full data-[size=default]:h-12 rounded-2xl border-transparent bg-white/[0.06] dark:bg-white/[0.08] px-4 text-sm";
const labelClass = "flex min-w-0 flex-col gap-2 text-sm";

export function MediaAssetDetailPanel(props: PanelProps) {
  const t = useTranslations("assets");
  const query = useMediaAsset(props.assetId);
  const formId = useId();
  if (query.data) return <EditableAssetPanel key={query.data.id} {...props} asset={query.data} />;
  return <AppMediaDetailRail tabs={[
    { value: "general", label: t("tabGeneral"), content: <div className="grid gap-3">
      <p role={query.isError ? "alert" : "status"} className="text-sm text-muted-foreground">
        {t(!props.assetId ? "noEditableAsset" : query.isError ? "error" : "loading")}
      </p>
      {query.isError && <AppButton variant="surface" size="sm" onClick={() => void query.refetch()}>{t("retry")}</AppButton>}
    </div> },
    ...(props.tabs ?? []),
  ]} formId={formId} onClose={props.onClose} closeLabel={t("close")} tabsLabel={t("detailTabs")}
    saveLabel={t("save")} saveDisabled busy={props.busy} actions={props.actions} testId={props.testId} notice={props.notice} />;
}

function EditableAssetPanel({ asset, onClose, writable = true, busy = false, onBusyChange, onDirtyChange, tabs = [], actions, testId, notice }: PanelProps & { asset: MediaAssetDto }) {
  const t = useTranslations("assets");
  const formId = useId();
  const projects = useAssetProjects();
  const patch = usePatchAssetMetadata();
  const submitting = useRef(false);
  const initialDraft = {
    displayName: asset.displayName ?? "",
    referenceId: getMediaAssetReferenceId(asset),
    classification: asset.classification ?? null,
    displayVersion: asset.displayVersion ?? "",
    description: asset.description ?? "",
    managementStatus: asset.managementStatus ?? null,
    projectIds: asset.projectIds ?? [],
  };
  const [draft, setDraft] = useState(initialDraft);
  const [baseline, setBaseline] = useState(initialDraft);
  const [starred, setStarred] = useState(!!asset.starred);
  const [version, setVersion] = useState(asset.version);
  const [message, setMessage] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => { onBusyChange?.(patch.isPending); }, [onBusyChange, patch.isPending]);
  useEffect(() => () => { onBusyChange?.(false); }, [onBusyChange]);
  const disabled = !writable || busy || patch.isPending || asset.status !== "completed" || !asset.url;
  const normalizeDraft = (value: typeof draft) => JSON.stringify({ ...value,
    displayName: value.displayName.trim(), referenceId: value.referenceId.trim() || asset.id,
    displayVersion: value.displayVersion.trim(), description: value.description.trim(),
    projectIds: [...value.projectIds].sort(),
  });
  const dirty = normalizeDraft(draft) !== normalizeDraft(baseline);
  useEffect(() => { onDirtyChange?.(dirty); }, [dirty, onDirtyChange]);
  useEffect(() => () => { onDirtyChange?.(false); }, [onDirtyChange]);
  function reload() {
    setDraft({ displayName: asset.displayName ?? "", referenceId: getMediaAssetReferenceId(asset), classification: asset.classification ?? null, displayVersion: asset.displayVersion ?? "", description: asset.description ?? "", managementStatus: asset.managementStatus ?? null, projectIds: asset.projectIds ?? [] });
    setStarred(!!asset.starred);
    setBaseline(initialDraft);
    setVersion(asset.version); setMessage(null); setFailed(false);
  }
  const copy = useClipboardCopy();
  const general = <fieldset disabled={busy || patch.isPending} className="grid min-w-0 gap-4">
    <label className={labelClass}>{t("classification")}
      <AppSelect ariaLabel={t("classification")} value={draft.classification ?? "none"} disabled={disabled} className={fieldClass}
        onValueChange={value => setDraft(previous => ({ ...previous, classification: value === "none" ? null : value as MediaAssetDto["classification"] ?? null }))}
        options={["none", "character", "location", "prop"].map(value => ({ value, label: t(`classifications.${value}`) }))} />
    </label>
    <label className={labelClass}>{t("name")}
      <div className="relative"><AppInput aria-label={t("name")} disabled={disabled} className={fieldClass + " pr-12"} value={draft.displayName} maxLength={255} placeholder={getMediaAssetName({ ...asset, displayName: null })}
        onChange={event => setDraft(previous => ({ ...previous, displayName: event.target.value }))} />
        <AppButton type="button" variant="ghost" size="icon-sm" aria-label={t("resetName")} disabled={disabled} onClick={() => setDraft(previous => ({ ...previous, displayName: "" }))} className="absolute top-1/2 right-2 -translate-y-1/2"><RotateCcw className="block size-4 shrink-0" /></AppButton>
      </div>
    </label>
    <label className={labelClass}>{t("displayVersion")}
      <AppInput disabled={disabled} className={fieldClass} value={draft.displayVersion} maxLength={64} placeholder="e.g. v1" onChange={event => setDraft(previous => ({ ...previous, displayVersion: event.target.value }))} />
    </label>
    <div className={labelClass}><label htmlFor={formId + "-asset-id"}>Asset ID</label>
      <div className="relative"><AppInput id={formId + "-asset-id"} disabled={disabled} value={draft.referenceId} maxLength={128} pattern="[A-Za-z0-9][A-Za-z0-9_-]{0,127}" placeholder={asset.id}
        onChange={event => setDraft(previous => ({ ...previous, referenceId: event.target.value }))}
        className={fieldClass + " pr-12 font-mono text-xs"} />
        <AppButton type="button" size="icon-sm" variant="ghost" aria-label={t("copyId")} disabled={busy} className="absolute top-1/2 right-2 -translate-y-1/2" onClick={async () => {
          await copy(draft.referenceId.trim() || asset.id, {
            successMessage: t((draft.referenceId.trim() || asset.id) !== getMediaAssetReferenceId(asset) ? "copiedUnsavedId" : "copied"),
            errorMessage: t("copyError"),
          });
        }}><Copy className="block size-4 shrink-0" /></AppButton>
      </div>
    </div>
    <label className={labelClass}>{t("assetDescription")}
      <AppTextarea disabled={disabled} className="min-h-28 resize-y rounded-2xl border-transparent bg-white/[0.06] dark:bg-white/[0.08] p-4 text-sm" value={draft.description} maxLength={2000} placeholder={t("descriptionPlaceholder")}
        onChange={event => setDraft(previous => ({ ...previous, description: event.target.value }))} />
    </label>
    <label className={labelClass}>{t("managementStatus")}
      <AppSelect ariaLabel={t("managementStatus")} value={draft.managementStatus ?? "none"} disabled={disabled} className={fieldClass}
        onValueChange={value => setDraft(previous => ({ ...previous, managementStatus: value === "none" ? null : value as MediaAssetDto["managementStatus"] ?? null }))}
        options={["none", "draft", "active", "archived"].map(value => ({ value, label: t(`managementStatuses.${value}`) }))} />
    </label>
    <AssetProjectMembershipField value={draft.projectIds} onChange={projectIds => setDraft(previous => ({ ...previous, projectIds }))}
      projects={projects.data} loading={projects.isLoading} error={projects.isError} onRetry={() => void projects.refetch()} disabled={disabled} />
  </fieldset>;
  const fileInfo = <AppDetailSection><dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-3 text-xs">
    <dt>{t("format")}</dt><dd className="break-all text-muted-foreground">{asset.mimeType}</dd>
    <dt>{t("size")}</dt><dd className="text-muted-foreground">{asset.bytes ? `${(Number(asset.bytes) / 1024 / 1024).toFixed(2)} MB` : "—"}</dd>
    <dt>{t("dimensions")}</dt><dd className="text-muted-foreground">{asset.width && asset.height ? `${asset.width} × ${asset.height}` : "—"}</dd>
    <dt>{t("created")}</dt><dd className="text-muted-foreground">{asset.createdAt.slice(0, 10)}</dd>
  </dl></AppDetailSection>;
  return <AppMediaDetailRail formId={formId} tabs={[
    { value: "general", label: t("tabGeneral"), content: general },
    ...tabs.map(tab => tab.value === "metadata" ? { ...tab, content: <div className="grid gap-5">{fileInfo}{tab.content}</div> } : tab),
    ...(!tabs.some(tab => tab.value === "metadata") ? [{ value: "file", label: t("tabFile"), content: fileInfo }] : []),
  ]} onClose={onClose} closeLabel={t("close")} tabsLabel={t("detailTabs")} saveLabel={t(patch.isPending ? "saving" : "save")}
    saveDisabled={disabled || !dirty} saving={patch.isPending} busy={busy || patch.isPending} actions={actions} testId={testId} notice={notice}
    headerActions={<AppButton type="button" size="icon" variant="ghost" aria-label={t(starred ? "unstar" : "star")} aria-pressed={starred} disabled={disabled}
      onClick={async () => {
        if (disabled || submitting.current) return;
        submitting.current = true; setMessage(null); setFailed(false);
        try {
          const saved = await patch.mutateAsync({ id: asset.id, expectedVersion: version, starred: !starred });
          setVersion(saved.version); setStarred(!!saved.starred); setMessage(t("starSaved"));
        } catch (error) { setMessage(t(assetErrorKey(error))); setFailed(true); }
        finally { submitting.current = false; }
      }}><Star className={"block size-5 shrink-0" + (starred ? " fill-amber-300 text-amber-300" : "")} /></AppButton>}
    message={<>{dirty && <p role="status" className="text-xs text-muted-foreground">{t("unsavedChanges")}</p>}{message && <p role={failed ? "alert" : "status"} className={failed ? "text-xs text-destructive" : "text-xs text-muted-foreground"}>{message}</p>}
      {failed && <AppButton type="button" size="sm" variant="surface" disabled={disabled} onClick={reload}>{t("refresh")}</AppButton>}</>}
    onSubmit={async event => {
      event.preventDefault();
      if (disabled || !dirty || submitting.current) return;
      submitting.current = true; setMessage(null); setFailed(false);
      try {
        const saved = await patch.mutateAsync({ id: asset.id, expectedVersion: version, ...draft, referenceId: draft.referenceId.trim() === asset.id ? null : draft.referenceId.trim() || null, displayName: draft.displayName.trim() || null, displayVersion: draft.displayVersion.trim() || null, description: draft.description.trim() || null });
        const nextDraft = { displayName: saved.displayName ?? "", referenceId: getMediaAssetReferenceId(saved), classification: saved.classification ?? null, displayVersion: saved.displayVersion ?? "", description: saved.description ?? "", managementStatus: saved.managementStatus ?? null, projectIds: saved.projectIds ?? [] };
        setBaseline(nextDraft); setVersion(saved.version); setDraft(nextDraft); setStarred(!!saved.starred); setMessage(t("saved"));
      } catch (error) { setMessage(t(assetErrorKey(error))); setFailed(true); }
      finally { submitting.current = false; }
    }} />;
}
