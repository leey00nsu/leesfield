"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useQueryClient } from "@tanstack/react-query";
import { FolderOpen } from "lucide-react";
import { GenerationPromptSurface } from "@/shared/ui/generation-prompt-field";
import { AppPromptEditor } from "@/shared/ui/app-prompt-editor";
import { NodeTextEditor } from "@/shared/ui/node-text-editor";
import { AppPromptMessage } from "@/shared/ui/app-prompt-message";
import { AppButton } from "@/shared/ui/app-button";
import { GradioFileField } from "@/shared/ui/gradio-file-field";
import { GenerationImageCountSelector } from "@/shared/ui/generation-image-count-selector";
import { GenerationModelSection } from "@/shared/ui/generation-model-section";
import { GenerationPromptPresetChip } from "@/entities/prompt-preset/ui/generation-prompt-preset-chip";
import { GenerationPromptPresetControls } from "@/entities/prompt-preset/ui/generation-prompt-preset-controls";
import { usePromptPresetCatalog } from "@/entities/prompt-preset/model/use-prompt-preset-catalog";
import { promptPresetDisplayName } from "@/shared/prompt-presets/prompt-preset-display-name";
import { type PromptPreset, type PromptPresetModality } from "@/shared/prompt-presets/prompt-preset-contract";
import { type CanonicalJsonValue } from "@/shared/generation-graph/canonical-graph";
import { resolveGenerationModalities } from "@/shared/model-catalog/modality";
import { type JsonValue } from "@/shared/model-catalog/gradio-contract";
import { mediaAssetKeys, useMediaAssetList } from "@/features/media-assets/hook/use-media-assets";
import { getMediaAsset, uploadMediaAsset } from "@/features/media-assets/api/media-asset-api";
import { useNodeAuthoring } from "../../model/node-authoring-context";
import { hydrateNodePromptPreset, writeNodePromptPreset, applyNodePromptPreset, record } from "../../model/node-prompt-presets";
import { promptPresetInputIssue } from "@/shared/prompt-presets/prompt-preset-application";
import { promptPresetReference, promptPresetRefSchema } from "@/shared/prompt-presets/prompt-preset-contract";
import { promptPresetReferenceImageCount } from "@/shared/prompt-presets/prompt-preset-input-mode";
import { generationAttachmentSlots, type GenerationAttachmentSlot } from "../../model/generation-prompt-attachments";
import { projectGenerationModelSelectionDefaults } from "../../model/generation-model-selection-defaults";
import { NodeBananaInputHistoryControl } from "./node-banana-input-history-control";

export function SpaceGenerationPrompt({ nodeId, config, modality, connected: hostConnected = false, connectedValue: hostConnectedValue, progress }: {
  nodeId: string; config: Record<string, unknown>; modality: PromptPresetModality;
  connected?: boolean; connectedValue?: string | null;
  progress?: { completed: number; failed: number; total: number; running: boolean };
}) {
  const authoring = useNodeAuthoring();
  const connection = authoring.getNodePromptInput?.(nodeId);
  const connected = connection?.connected ?? hostConnected;
  const connectedValue = connection ? connection.text : hostConnectedValue;
  const t = useTranslations("promptPresets"), ko = useLocale() === "ko";
  const models = modality === "image" ? authoring.imageModels : modality === "video" ? authoring.videoModels ?? [] : authoring.audioModels ?? [];
  const model = models.find(candidate => candidate.key === config.modelKey);
  const draft = hydrateNodePromptPreset(config, modality);
  const catalog = usePromptPresetCatalog(modality, false, authoring.writable !== false);
  const [pending, setPending] = useState<PromptPreset | null>(null);
  const [error, setError] = useState<string | null>(null);
  const current = useRef({ config, draft, model });
  useEffect(() => { current.current = { config, draft, model }; });
  const disabled = authoring.writable === false;
  const publish = (next: Record<string, unknown>) => {
    if (disabled || connected) return;
    if (typeof next.prompt === "string" && next.prompt.length > 20_000) {
      setError(ko ? "프롬프트는 20,000자 이하로 입력하세요." : "Use a prompt of at most 20,000 characters."); return;
    }
    setError(null); authoring.updateCanonicalNodeConfig?.(nodeId, next as CanonicalJsonValue);
  };
  const apply = (preset: PromptPreset) => {
    const live = current.current;
    const base = applyNodePromptPreset(live.config, preset, live.model, false, path => path.startsWith("dynamicParams.")
      ? Object.hasOwn(record(record(live.config.parameters).dynamicParams), path.slice(14))
      : Object.hasOwn(record(live.config.parameters), path)).config;
    publish(writeNodePromptPreset(base, live.draft.text, preset, preset.prompt, live.draft.offset));
    setPending(null);
  };
  const controller = {
    catalog, preset: draft.preset, presetText: draft.body,
    // Catalog text is comparison only; it never replaces a saved work draft.
    modified: Boolean(draft.preset && catalog.data?.some(preset => preset.key === draft.preset!.key && preset.prompt !== draft.body)),
    pending: pending ? { preset: pending, original: false } : null,
    requestApply: (preset: PromptPreset) => {
      const saved = catalog.data?.find(item => item.key === draft.preset?.key);
      if (draft.preset && (!saved || saved.prompt !== draft.body)) setPending(preset); else apply(preset);
    },
    cancel: () => setPending(null),
    confirm: () => { if (pending) apply(pending); },
    editPreset: (body: string) => publish(writeNodePromptPreset(current.current.config, current.current.draft.text,
      current.current.draft.preset, body, current.current.draft.offset)),
    clear: () => publish(writeNodePromptPreset(current.current.config, current.current.draft.text, null)),
  };
  const slots = model ? generationAttachmentSlots(model) : [];
  const reference = draft.preset ? promptPresetReference(draft.preset) : promptPresetRefSchema.safeParse(config.promptPreset).data;
  const legacyImages = ["primary", "references", "initImage"].flatMap(port => authoring.getNodeInputAssetIds?.(nodeId, port) ?? []).map(id => "asset:" + id);
  const fileInputs = Object.fromEntries(slots.map(slot => [slot.field.name, slot.ports.flatMap(port => authoring.getNodeInputAssetIds?.(nodeId, port) ?? []).map(id => "asset:" + id)]));
  const inputIssue = reference ? model ? promptPresetInputIssue(model, { ...record(config.parameters),
    initImages: modality === "image" ? legacyImages : [], initImage: modality === "video" ? legacyImages[0] ?? "" : "", fileInputs }, reference)
    : promptPresetReferenceImageCount(reference) ? "referenceRequired" : null : null;
  return <div className="min-h-0 min-w-0 flex-1 overflow-y-auto" data-space-generation-prompt={modality}>
    <GenerationPromptSurface
      className="rounded-none border-0 bg-transparent"
      attachments={slots.length ? <div className="space-y-3 px-4 pt-4">{slots.map(slot =>
        <SpaceGenerationAttachment key={model!.key + ":" + slot.field.name} nodeId={nodeId} modelKey={model!.key} slot={slot} disabled={disabled} />
      )}</div> : undefined}
      textarea={<NodeTextEditor label={ko ? "프롬프트 편집" : "Edit prompt"} disabled={disabled || connected}
        className="m-3 flex min-h-32 flex-1 flex-col">
        {editing => <AppPromptEditor aria-label={ko ? "프롬프트" : "Prompt"} className="min-h-32 px-3 py-3 text-sm leading-6"
        tabIndex={editing ? 0 : -1}
        value={connected ? connectedValue ?? "" : draft.text} disabled={disabled || connected || !editing}
        placeholder={ko ? "무엇을 만들고 싶으세요?" : "What would you like to create?"}
        token={!connected && draft.preset ? { id: draft.preset.key, label: promptPresetDisplayName(draft.preset, t), offset: draft.offset,
          content: <GenerationPromptPresetChip controller={controller} disabled={disabled} /> } : undefined}
        onChange={(text, present, offset) => publish(writeNodePromptPreset(current.current.config, text,
          present ? current.current.draft.preset : null, current.current.draft.body, offset))} />}
        </NodeTextEditor>}
      feedback={<>{progress && <p className="text-xs text-muted-foreground" role="status">{ko ? `${progress.completed}/${progress.total}회 · 성공 ${progress.completed - progress.failed} · 실패 ${progress.failed}${progress.running ? " · 생성 중" : ""}` : `${progress.completed}/${progress.total} runs · ${progress.completed - progress.failed} succeeded · ${progress.failed} failed${progress.running ? " · generating" : ""}`}</p>}{connected && <p className="text-xs text-muted-foreground">{ko ? "연결된 프롬프트를 사용합니다." : "Using the connected prompt."}</p>}
        {error && <AppPromptMessage>{error}</AppPromptMessage>}
        {inputIssue && <AppPromptMessage>{t(inputIssue === "referenceRequired" ? "referenceMissing" : inputIssue)}</AppPromptMessage>}</>}
      footerLeft={<>
        <GenerationModelSection modality={modality} items={models.map(model => ({ id: model.key, name: model.label, vendor: model.vendor, modalities: resolveGenerationModalities(model) }))}
          activeId={model?.key ?? null} disabled={disabled} loading={authoring.isLoading}
          onSelect={key => authoring.updateCanonicalNodeConfig?.(nodeId, projectGenerationModelSelectionDefaults(current.current.config,
            { ...current.current.config, modelKey: key, parameters: {} }, models) as CanonicalJsonValue)} />
        <GenerationPromptPresetControls controller={controller} disabled={disabled || connected} />
        {modality === "image" && <GenerationImageCountSelector value={typeof config.repeatCount === "number" ? config.repeatCount : 1} disabled={disabled}
          onChange={repeatCount => authoring.updateCanonicalNodeConfig?.(nodeId, { ...current.current.config, repeatCount } as CanonicalJsonValue)} />}
      </>} />
  </div>;
}

function SpaceGenerationAttachment({ nodeId, modelKey, slot, disabled }: {
  nodeId: string; modelKey: string; slot: GenerationAttachmentSlot; disabled: boolean;
}) {
  const authoring = useNodeAuthoring(), client = useQueryClient(), ko = useLocale() === "ko";
  const ids = slot.ports.flatMap(port => authoring.getNodeInputAssetIds?.(nodeId, port) ?? []);
  const assets = useMediaAssetList(ids);
  const identityKey = JSON.stringify(ids.map(id => "asset:" + id));
  const urls = useMemo<string[]>(() => JSON.parse(identityKey), [identityKey]);
  const value = slot.field.kind === "file" && urls.length <= 1 ? urls[0] : urls;
  const [busy, setBusy] = useState(false), [error, setError] = useState<string | null>(null), [open, setOpen] = useState(false);
  const controller = useRef<AbortController | null>(null);
  const mounted = useRef(true);
  const live = useRef({ ids, disabled, modelKey, urls, slot });
  useEffect(() => { live.current = { ids, disabled, modelKey, urls, slot }; });
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; controller.current?.abort(); }; }, []);
  useEffect(() => { if (disabled) controller.current?.abort(); }, [disabled]);
  const mutate = async (requested: JsonValue | undefined, assetId?: string) => {
    if (disabled || controller.current) return;
    const initial = live.current;
    const abort = new AbortController(); controller.current = abort;
    setBusy(true); setError(null);
    try {
      const requestedUrls = assetId ? null : (Array.isArray(requested) ? requested : requested == null ? [] : [requested]);
      const next: string[] = [];
      if (assetId) {
        const asset = await getMediaAsset(assetId, abort.signal);
        if (asset.type !== slot.field.media) throw new Error("ATTACHMENT_MEDIA");
        client.setQueryData(mediaAssetKeys.detail(asset.id), asset);
        next.push(...(slot.field.kind === "file" ? [] : initial.ids), asset.id);
      } else {
        for (const url of requestedUrls!) {
          if (typeof url !== "string") throw new Error("ATTACHMENT_MEDIA");
          const index = initial.urls.indexOf(url);
          if (index >= 0) { next.push(initial.ids[index]); continue; }
          if (!url.startsWith("data:" + slot.field.media + "/")) throw new Error("ATTACHMENT_MEDIA");
          const blob = await (await fetch(url, { signal: abort.signal })).blob();
          const asset = await uploadMediaAsset(new File([blob], "reference", { type: blob.type }), slot.field.media!, undefined, abort.signal);
          client.setQueryData(mediaAssetKeys.detail(asset.id), asset); next.push(asset.id);
          void client.invalidateQueries({ queryKey: mediaAssetKeys.list(asset.type) });
        }
      }
      abort.signal.throwIfAborted();
      if (live.current.disabled || live.current.modelKey !== initial.modelKey || JSON.stringify(live.current.ids) !== JSON.stringify(initial.ids)) return;
      const removing = next.length < initial.ids.length && next.every(id => initial.ids.includes(id));
      if (next.length > slot.limit && !removing) throw new Error("ATTACHMENT_LIMIT");
      if (!authoring.replaceNodeInputAssets?.(nodeId, slot, next, { modelKey, assetIds: initial.ids })) return;
      setOpen(false);
    } catch (error) {
      if (!abort.signal.aborted) setError(error instanceof Error && error.message === "ATTACHMENT_LIMIT"
        ? (ko ? `최대 ${slot.limit}개까지 첨부할 수 있습니다.` : `Attach up to ${slot.limit} files.`)
        : (ko ? "첨부하지 못했습니다. 다시 선택해 주세요." : "Could not attach the file. Please try again."));
    } finally {
      if (controller.current === abort) controller.current = null;
      if (mounted.current) setBusy(false);
    }
  };
  return <div className="min-w-0 space-y-2">
    <GradioFileField label={slot.field.label} field={slot.field} value={value} maxItems={slot.limit}
      getPreviewUrl={(_value, index) => assets[index]?.data?.url ?? ""}
      disabled={disabled || busy} description={<>
        <span className="text-xs text-muted-foreground">{slot.field.label}{slot.field.required ? " *" : ""}</span>
        <AppButton type="button" variant="surface-muted" size="pill-sm" disabled={disabled || busy}
          onClick={() => setOpen(true)}><FolderOpen className="size-4" />{ko ? "에셋" : "Assets"}</AppButton>
      </>} onChange={next => { void mutate(next); }} />
    {error && <AppPromptMessage>{error}</AppPromptMessage>}
    {ids.length > slot.limit && <AppPromptMessage>{ko ? `최대 ${slot.limit}개까지 첨부할 수 있습니다.` : `Attach up to ${slot.limit} files.`}</AppPromptMessage>}
    <NodeBananaInputHistoryControl nodeId={nodeId} mediaType={slot.field.media!} selectedAssetId={ids[0] ?? null}
      writable={!disabled && !busy} open={open} onOpenChange={setOpen} onSelect={id => { void mutate(undefined, id); }} />
  </div>;
}
