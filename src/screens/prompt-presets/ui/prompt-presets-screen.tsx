"use client";

import { useState, type FormEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { Plus, Circle, MoreVertical, Image as ImageIcon, Video, AudioLines } from "lucide-react";
import { usePromptPresetCatalog, promptPresetQueryKey } from "@/entities/prompt-preset/model/use-prompt-preset-catalog";
import { getPromptPreset, mutatePromptPreset, PromptPresetApiError } from "@/entities/prompt-preset/api/prompt-preset-api";
import { createPromptPresetSchema, promptPresetSchema, type PromptPreset, type PromptPresetModality } from "@/shared/prompt-presets/prompt-preset-contract";
import { AppPageShell } from "@/shared/ui/app-page-shell";
import { AppCard } from "@/shared/ui/app-card";
import { ResourceListLoading } from "@/shared/ui/resource-list-loading";
import { AppButton } from "@/shared/ui/app-button";
import { AppInput } from "@/shared/ui/app-input";
import { AppTextarea, AppLabel, AppSelect, AppCheckbox } from "@/shared/ui/app-form-control";
import { StatePanel } from "@/shared/ui/brand/state-panel/state-panel";
import { appToast } from "@/shared/ui/app-toast";
import { AppDialog, AppDialogContent, AppDialogHeading, AppDialogBody, AppDialogTitle, AppDialogDescription, AppDialogFooter, AppDialogCancelButton, AppDialogActionButton, AppDialogDangerButton } from "@/shared/ui/app-dialog";
import { AppFilterToolbar, AppFilterActions, AppFilterGroup, AppFilterToggle, AppSearchField, AppSortSelect, appFilterSearchLayoutClassName } from "@/shared/ui/app-filter-toolbar";
import { AppFilterPanel } from "@/shared/ui/app-filter-panel";
import { AppResourceList, appResourceRowLayoutClassName, appResourceRowIconClassName } from "@/shared/ui/app-resource-list";
import { ResourceRowButton, resourceRowInteractiveClassName } from "@/shared/ui/brand/resource-row-link/resource-row-link";
import { promptPresetDisplayName } from "@/shared/prompt-presets/prompt-preset-display-name";
import { promptPresetInputMode } from "@/shared/prompt-presets/prompt-preset-input-mode";
import { AppModalityTag } from "@/shared/ui/app-modality-tag";
import { cn } from "@/shared/lib/utils";

type Editor = { source: PromptPreset | null; key: string; name: string; description: string; prompt: string; modality: PromptPresetModality; reference: boolean; isActive: boolean };
const editorFor = (p: PromptPreset): Editor => ({
  source: p, key: p.key, name: p.name, description: p.description, prompt: p.prompt, modality: p.modality,
  reference: p.modality !== "audio" && p.requiredInputs.referenceImageCount === 1, isActive: p.isActive,
});
const emptyEditor = (): Editor => ({ source: null, key: "preset-" + crypto.randomUUID(), name: "", description: "", prompt: "", modality: "image", reference: false, isActive: true });
const editorChanged = (e: Editor) => e.source ? JSON.stringify(e) !== JSON.stringify(editorFor(e.source)) : Boolean(e.name || e.description || e.prompt || e.reference || e.modality !== "image");
type Confirm = { kind: "discard"; action: () => void } | { kind: "restore" | "delete"; editor: Editor };

export function PromptPresetsScreen() {
  const t = useTranslations("promptPresets");
  const queryClient = useQueryClient();
  const catalog = usePromptPresetCatalog(undefined, true);
  const [query, setQuery] = useState(""), [modality, setModality] = useState("all"), [activity, setActivity] = useState("all");
  const [editor, setEditor] = useState<Editor | null>(null), [confirm, setConfirmState] = useState<Confirm | null>(null);
  const [confirmContent, setConfirmContent] = useState<Confirm | null>(null);
  const setConfirm = (next: Confirm | null) => {
    if (next) setConfirmContent(next);
    setConfirmState(next);
  };
  const [busy, setBusy] = useState(false), [error, setError] = useState<string | null>(null);
  const filtered = (catalog.data ?? []).filter(p => (modality === "all" || p.modality === modality)
    && (activity === "all" || p.isActive === (activity === "active"))
    && [promptPresetDisplayName(p, t), p.name, p.description, p.key].join(" ").toLowerCase().includes(query.trim().toLowerCase()));
  const open = (next: Editor | null) => {
    const action = () => { setEditor(next); setError(null); };
    if (editor && editorChanged(editor)) setConfirm({ kind: "discard", action }); else action();
  };
  const edit = (values: Partial<Editor>) => setEditor(current => current ? { ...current, ...values } : current);
  const invalidate = () => queryClient.invalidateQueries({ queryKey: promptPresetQueryKey });
  const fail = (reason: unknown) => setError(reason instanceof PromptPresetApiError && reason.status === 409 ? "conflict" : "saveFailed");
  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (!editor || busy) return;
    const draft = editor;
    const candidate = createPromptPresetSchema.safeParse({
      key: draft.key, name: draft.name, description: draft.description, prompt: draft.prompt, modality: draft.modality,
      requiredInputs: { referenceImageCount: draft.reference ? 1 : 0 },
      recommendedParameters: draft.modality !== "audio" && draft.source?.modality === draft.modality ? draft.source.recommendedParameters : {},
    });
    if (!candidate.success) { setError("invalid"); return; }
    setBusy(true); setError(null);
    try {
      const body = draft.source ? {
        expectedRevision: draft.source.revision, name: candidate.data.name, description: candidate.data.description, prompt: candidate.data.prompt, isActive: draft.isActive,
        ...(draft.source.builtinKey ? {} : { modality: candidate.data.modality, requiredInputs: candidate.data.requiredInputs, recommendedParameters: candidate.data.recommendedParameters }),
      } : candidate.data;
      const result = await mutatePromptPreset(draft.source ? "/" + encodeURIComponent(draft.key) : "", draft.source ? "PATCH" : "POST", body);
      setEditor(editorFor(promptPresetSchema.parse(result.item)));
      await invalidate(); appToast.success(t("saved"));
    } catch (reason) { fail(reason); }
    finally { setBusy(false); }
  };
  const reload = async () => {
    if (!editor?.source || busy) return;
    setBusy(true);
    try {
      const latest = await getPromptPreset(editor.key);
      open(editorFor(latest));
    } catch (reason) { fail(reason); }
    finally { setBusy(false); }
  };
  const performConfirm = async () => {
    if (!confirm || busy) return;
    if (confirm.kind === "discard") { confirm.action(); setConfirm(null); return; }
    const { editor: draft, kind } = confirm;
    if (!draft.source) return;
    setBusy(true); setError(null);
    try {
      const result = await mutatePromptPreset("/" + encodeURIComponent(draft.key) + (kind === "restore" ? "/restore" : ""),
        kind === "restore" ? "POST" : "DELETE", { expectedRevision: draft.source.revision });
      setEditor(kind === "restore" ? editorFor(promptPresetSchema.parse(result.item)) : null);
      setConfirm(null); await invalidate(); appToast.success(t(kind === "restore" ? "restored" : "deleted"));
    } catch (reason) { fail(reason); setConfirm(null); }
    finally { setBusy(false); }
  };
  return <AppPageShell aria-label={t("title")}>
    <h1 className="sr-only">{t("title")}</h1>
    <AppFilterToolbar>
      <AppFilterPanel title={t("filters.title")} description={t("filters.description")} applyLabel={t("filters.apply")}>
        <AppFilterGroup>{(["all", "image", "video", "audio"] as const).map(value => {
          const Icon = value === "image" ? ImageIcon : value === "video" ? Video : value === "audio" ? AudioLines : null;
          return <AppFilterToggle key={value} active={modality === value} aria-pressed={modality === value} onClick={() => setModality(value)} icon={Icon ? <Icon className="size-4" /> : undefined}>{t(value)}</AppFilterToggle>;
        })}</AppFilterGroup>
      </AppFilterPanel>
      <AppFilterActions>
        <AppSearchField aria-label={t("search")} placeholder={t("search")} value={query} onChange={e => setQuery(e.target.value)} containerClassName={appFilterSearchLayoutClassName} />
        <AppSortSelect value={activity} onValueChange={setActivity} ariaLabel={t("active")} className="w-full sm:w-[12rem]" options={["all", "active", "inactive"].map(value => ({ value, label: t(value) }))} />
        <AppButton type="button" variant="brand" size="md" className="shrink-0 self-end" disabled={busy} onClick={() => open(emptyEditor())}><Plus className="size-4" />{t("new")}</AppButton>
      </AppFilterActions>
    </AppFilterToolbar>
    {catalog.isLoading ? <ResourceListLoading label={t("loading")} />
      : catalog.isError ? <AppCard variant="editorial-flat" radius="lg" className="p-8" role="alert"><StatePanel title={t("loadFailed")} tone="destructive" action={<AppButton variant="surface" onClick={() => { void catalog.refetch(); }}>{t("retry")}</AppButton>} /></AppCard>
      : !filtered.length ? <AppCard variant="editorial-flat" radius="lg" className="flex min-h-[320px] items-center justify-center px-6 text-center"><StatePanel title={t("empty")} /></AppCard>
      : <AppResourceList aria-label={t("title")}>{filtered.map(p => {
        const Icon = p.modality === "image" ? ImageIcon : p.modality === "video" ? Video : AudioLines;
        return <div key={p.key} role="listitem"><article className={cn(appResourceRowLayoutClassName, !busy && resourceRowInteractiveClassName)}>
          <div className={appResourceRowIconClassName}><Icon className="size-6 text-white/66" aria-hidden /></div>
          <div className="min-w-0"><h2 className="truncate text-sm font-medium"><ResourceRowButton disabled={busy} onClick={() => open(editorFor(p))}>{promptPresetDisplayName(p, t)}</ResourceRowButton></h2>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground"><span>{t(p.builtinKey ? "provided" : "personal")}</span><span className="size-1 rounded-full bg-white/22" aria-hidden /><span>{t(p.modality)}</span><AppModalityTag>{promptPresetInputMode(p)}</AppModalityTag>{p.isModified ? <span>{t("modified")}</span> : null}</div>
          </div>
          <div className="col-start-2 flex items-center gap-2 md:col-auto"><Circle aria-hidden className={cn("size-3 fill-current", p.isActive ? "text-success-foreground" : "text-white/34")} /><span className={cn("text-xs font-medium", p.isActive ? "text-white/76" : "text-white/42")}>{t(p.isActive ? "active" : "inactive")}</span></div>
          <div className="flex items-center justify-end"><MoreVertical className="size-4 text-muted-foreground" aria-hidden /></div>
        </article></div>;
      })}</AppResourceList>}
    <AppDialog open={editor !== null} onOpenChange={isOpen => { if (!isOpen && !busy && !confirm) open(null); }}>
      <AppDialogContent stableHeight showCloseButton={false}>
        {editor ? <form aria-label={t("manage")} onSubmit={save} className="contents">
          <AppDialogHeading>
            <AppDialogDescription>{t("manage")}</AppDialogDescription>
            <AppDialogTitle className="truncate">{editor.source ? promptPresetDisplayName(editor.source, t) : t("new")}</AppDialogTitle>
            {editor.source ? <p className="text-xs text-muted-foreground">{t("version", { revision: editor.source.revision })}</p> : null}
          </AppDialogHeading>
          <AppDialogBody className="space-y-5">
        {error ? <div role="alert" className="space-y-2 text-sm text-destructive"><p>{t(error)}</p>{error === "conflict" ? <AppButton type="button" variant="surface" disabled={busy} onClick={() => { void reload(); }}>{t("reload")}</AppButton> : null}</div> : null}
        <div className="space-y-2"><AppLabel htmlFor="preset-name">{t("name")}</AppLabel><AppInput id="preset-name" value={promptPresetDisplayName(editor, t)} maxLength={120} disabled={busy} onChange={e => edit({ name: e.target.value })} /></div>
        <div className="space-y-2"><AppLabel htmlFor="preset-summary">{t("summary")}</AppLabel><AppInput id="preset-summary" value={editor.description} maxLength={1000} disabled={busy} onChange={e => edit({ description: e.target.value })} /></div>
        <div className="flex flex-wrap items-center gap-3">
          <AppSelect value={editor.modality} ariaLabel={t("modality")} disabled={busy || Boolean(editor.source?.builtinKey)} onValueChange={value => edit({ modality: value as PromptPresetModality, ...(value === "audio" ? { reference: false } : {}) })} options={["image", "video", "audio"].map(value => ({ value, label: t(value) }))} />
          {editor.source ? <AppCheckbox label={t("active")} checked={editor.isActive} disabled={busy} onChange={e => edit({ isActive: e.target.checked })} /> : null}
        </div>
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">{t("inputType")}</legend>
          <AppFilterGroup aria-label={t("inputType")}>{(editor.modality === "image" ? ["T2I", "I2I"] : editor.modality === "video" ? ["T2V", "I2V"] : ["T2A"]).map(mode => {
            const active = mode === promptPresetInputMode({ modality: editor.modality, requiredInputs: { referenceImageCount: editor.reference ? 1 : 0 } });
            return <AppFilterToggle key={mode} type="button" active={active} aria-pressed={active} disabled={busy || Boolean(editor.source?.builtinKey)} onClick={() => edit({ reference: mode === "I2I" || mode === "I2V" })}>{mode}</AppFilterToggle>;
          })}</AppFilterGroup>
          <p className="text-xs text-muted-foreground">{t("inputModes." + promptPresetInputMode({ modality: editor.modality, requiredInputs: { referenceImageCount: editor.reference ? 1 : 0 } }))}</p>
        </fieldset>
        <div className="space-y-2"><AppLabel htmlFor="preset-prompt">{t("prompt")}</AppLabel><AppTextarea id="preset-prompt" value={editor.prompt} maxLength={20000} rows={18} disabled={busy} className="min-h-64 resize-y leading-6" onChange={e => edit({ prompt: e.target.value })} /><p className="text-right text-xs text-muted-foreground">{editor.prompt.length} / 20000</p></div>

          </AppDialogBody>
        <AppDialogFooter className="flex-wrap">
          <AppButton type="button" variant="surface" disabled={busy || !editor.prompt.trim()} onClick={() => { setEditor({ ...editor, source: null, key: "preset-" + crypto.randomUUID(), name: t("copyName", { name: promptPresetDisplayName(editor, t) }), isActive: true }); setError(null); }}>{t("duplicate")}</AppButton>
          {editor.source?.builtinKey ? <AppButton type="button" variant="surface" disabled={busy} onClick={() => setConfirm({ kind: "restore", editor })}>{t("restoreSaved")}</AppButton> : editor.source ? <AppDialogDangerButton type="button" disabled={busy} onClick={() => setConfirm({ kind: "delete", editor })}>{t("delete")}</AppDialogDangerButton> : null}
          <AppDialogCancelButton type="button" disabled={busy} onClick={() => open(null)}>{t("cancel")}</AppDialogCancelButton>
          <AppDialogActionButton type="submit" isLoading={busy} disabled={busy}>{t("save")}</AppDialogActionButton>
        </AppDialogFooter>

        </form> : null}
      </AppDialogContent>
    </AppDialog>
    <AppDialog open={confirm !== null} onOpenChange={open => { if (!open && !busy) setConfirm(null); }}>
      <AppDialogContent size="sm">
        <AppDialogHeading><AppDialogTitle>{t(confirmContent?.kind === "discard" ? "discardTitle" : confirmContent?.kind === "restore" ? "restoreTitle" : "deleteTitle")}</AppDialogTitle><AppDialogDescription>{t(confirmContent?.kind === "discard" ? "discardDescription" : confirmContent?.kind === "restore" ? "restoreDescription" : "deleteDescription")}</AppDialogDescription></AppDialogHeading>
        <AppDialogFooter>
          <AppDialogCancelButton type="button" disabled={busy} onClick={() => setConfirm(null)}>{t("cancel")}</AppDialogCancelButton>
          {confirmContent?.kind === "restore" ? <AppDialogActionButton type="button" disabled={busy} onClick={() => { void performConfirm(); }}>{t("restore")}</AppDialogActionButton> : <AppDialogDangerButton type="button" disabled={busy} onClick={() => { void performConfirm(); }}>{t(confirmContent?.kind === "discard" ? "discard" : "delete")}</AppDialogDangerButton>}
        </AppDialogFooter>
      </AppDialogContent>
    </AppDialog>
  </AppPageShell>;
}
