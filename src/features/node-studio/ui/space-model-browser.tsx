"use client";

import { AppPreviewImage } from "@/shared/ui/app-preview-image";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { AudioLines, Check, ExternalLink, Image as ImageIcon, LoaderCircle, Plus, RefreshCw, Sparkles, Video } from "lucide-react";
import { useCanvasTranslation } from "@/shared/i18n/use-canvas-translation";
import { modelProviderLabel } from "@/shared/model-catalog/provider-display";
import { resolveGenerationModalities } from "@/shared/model-catalog/modality";
import type { RuntimeAudioModel, RuntimeImageModel, RuntimeLlmModel, RuntimeVideoModel } from "@/shared/model-catalog/runtime-utils";
import { AppButton } from "@/shared/ui/app-button";
import { AppCloseButton } from "@/shared/ui/app-close-button";
import { AppDialog, AppDialogClose, AppDialogContent, AppDialogHeader, AppDialogTitle } from "@/shared/ui/app-dialog";
import { AppFilterSection, AppFilterToggle, AppFilterToolbar, AppSearchField } from "@/shared/ui/app-filter-toolbar";
import { appInputShellClassName } from "@/shared/ui/app-input";
import { AppModalityTag } from "@/shared/ui/app-modality-tag";
import { NodeTextEditorScope } from "@/shared/ui/node-text-editor";
import { cn } from "@/shared/lib/utils";
import styles from "./space-model-browser.module.css";

export type SpaceBrowserModel = RuntimeImageModel | RuntimeVideoModel | RuntimeAudioModel | RuntimeLlmModel;
type ModelType = SpaceBrowserModel["type"];
type TypeFilter = "all" | ModelType;

export type SpaceModelBrowserProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  models: readonly SpaceBrowserModel[];
  initialType?: ModelType;
  selectedKey?: string | null;
  disabled?: boolean;
  loading?: boolean;
  error?: string | null;
  onRefresh?: () => void | Promise<void>;
  recentKeys?: readonly string[];
  onSelect: (key: string, type: ModelType) => void;
  title?: string;
};

type BrowserEntry = {
  model: SpaceBrowserModel;
  name: string;
  identifier: string;
  provider: string;
  description: string | null;
  cover: string | undefined;
  page: string | undefined;
  capabilities: string[];
};

const typeLabels = { all: "All Types", image: "Image", video: "Video", audio: "Audio", llm: "LLM" };
const modelTypes: readonly TypeFilter[] = ["all", "image", "video", "audio", "llm"];
const typeIcons = { image: ImageIcon, video: Video, audio: AudioLines, llm: Sparkles };

/** Only public artwork/documentation metadata is eligible; provider endpoints stay private. */
function publicWebUrl(value: unknown): string | undefined {
  if (typeof value !== "string") return;
  try {
    const url = new URL(value);
    const hasCredentials = [...url.searchParams.keys()].some(key => /^(?:api[_-]?key|access[_-]?token|token|auth|authorization|password|secret|signature|x-amz-credential|x-amz-signature)$/i.test(key));
    if ((url.protocol === "https:" || url.protocol === "http:") && !url.username && !url.password && !hasCredentials) return url.href;
  } catch { /* Missing or invalid public metadata has no link/cover. */ }
}

function browserEntry(model: SpaceBrowserModel): BrowserEntry {
  if (model.type === "llm") return {
    model, name: model.label, identifier: model.providerConfig.model_id, provider: model.vendor || modelProviderLabel(model.provider),
    description: null, cover: undefined, page: undefined,
    capabilities: model.providerConfig.supports_images ? ["Text", "Image", "Video"] : ["Text"],
  };
  const path = model.key.split("/").map(encodeURIComponent).join("/");
  const fallbackPage = model.provider === "replicate" ? `https://replicate.com/${path}`
    : model.provider === "fal" ? `https://fal.ai/models/${path}`
    : model.provider === "wavespeed" ? "https://wavespeed.ai/" : undefined;
  const variant = model.key.split("/").at(-1);
  const name = model.provider === "fal" && variant && !model.label.toLowerCase().includes(variant.toLowerCase())
    ? `${model.label} - ${variant}` : model.label;
  return {
    model, name, identifier: model.key, provider: modelProviderLabel(model.provider),
    description: typeof model.meta.description === "string" ? model.meta.description : null,
    cover: publicWebUrl(model.meta.coverImage), page: publicWebUrl(model.meta.pageUrl ?? fallbackPage),
    capabilities: resolveGenerationModalities(model),
  };
}

/** Each open owns its search/refresh lifetime, including when the caller reuses the component. */
export function SpaceModelBrowser(props: SpaceModelBrowserProps) {
  if (!props.open) return null;
  return <ModelBrowserSession key={props.initialType ?? "all"} {...props} />;
}

function ModelBrowserSession({
  models, initialType, selectedKey, disabled = false, loading = false, error, onRefresh,
  recentKeys = [], onSelect, onOpenChange, title,
}: SpaceModelBrowserProps) {
  const tc = useCanvasTranslation();
  const tModelErrors = useTranslations("model.admin.errors");
  const recentHeading = useId();
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [composing, setComposing] = useState(false);
  const composition = useRef(false);
  const [providerFilter, setProviderFilter] = useState<string | null>(null);
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [refresh, setRefresh] = useState<{ catalog: typeof models; pending: boolean; error: string | null } | null>(null);
  const refreshVersion = useRef(0);
  const refreshing = useRef(false);
  const selected = useRef(false);
  const searchButton = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (composing) return;
    const timer = setTimeout(() => setSearch(query), 300);
    return () => clearTimeout(timer);
  }, [query, composing]);

  useEffect(() => () => {
    refreshVersion.current += 1;
    refreshing.current = false;
  }, [models]);

  const catalog = useMemo(() => models
    .filter(model => model.isActive && (!initialType || model.type === initialType))
    .map(browserEntry), [models, initialType]);
  const providers = useMemo(() => [...new Set(catalog.map(entry => entry.provider))], [catalog]);
  // An unavailable provider must not strand the dialog on an empty stale filter.
  const provider = providerFilter && providers.includes(providerFilter) ? providerFilter : null;
  if (providerFilter && !providers.includes(providerFilter)) setProviderFilter(null);
  const type = initialType ?? typeFilter;
  const results = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return catalog.filter(entry => (!provider || entry.provider === provider)
      && (type === "all" || entry.model.type === type)
      && (!needle || `${entry.name} ${entry.model.key} ${entry.identifier} ${entry.provider} ${entry.model.provider} ${entry.model.vendor} ${entry.description ?? ""}`.toLowerCase().includes(needle)));
  }, [catalog, provider, type, search]);
  const recent = useMemo(() => {
    const byKey = new Map(results.map(entry => [entry.model.key, entry]));
    return [...new Set(recentKeys)].flatMap(key => {
      const entry = byKey.get(key);
      return entry ? [entry] : [];
    }).slice(0, 4);
  }, [results, recentKeys]);
  const isRefreshing = refresh?.catalog === models && refresh.pending;
  const currentError = (refresh?.catalog === models ? refresh.error : null) ?? error;

  const handleRefresh = async () => {
    if (!onRefresh || loading || refreshing.current) return;
    const version = ++refreshVersion.current;
    refreshing.current = true;
    setRefresh({ catalog: models, pending: true, error: null });
    try {
      await onRefresh();
    } catch {
      // Raw transport errors may contain provider endpoints or credentials.
      if (version === refreshVersion.current) setRefresh({ catalog: models, pending: true, error: tModelErrors("load") });
    } finally {
      if (version === refreshVersion.current) {
        refreshing.current = false;
        setRefresh(previous => previous ? { ...previous, pending: false } : null);
      }
    }
  };

  const choose = (entry: BrowserEntry) => {
    if (disabled || loading || currentError || selected.current) return;
    const active = catalog.find(item => item.model.key === entry.model.key && item.model.type === entry.model.type);
    if (!active) return;
    selected.current = true;
    onSelect(active.model.key, active.model.type);
    onOpenChange(false);
  };

  const card = (entry: BrowserEntry, compact = false) => {
    const { model } = entry;
    const Icon = typeIcons[model.type];
    return <li key={model.key} className={cn(styles.card, compact && styles.recentCard)}
      data-selected={selectedKey === model.key} data-disabled={disabled}>
      <button type="button" className={styles.choose} aria-label={entry.name}
        aria-pressed={selectedKey === undefined ? undefined : selectedKey === model.key}
        disabled={disabled} onClick={() => choose(entry)} />
      <div className={styles.cover} aria-hidden="true">
        {entry.cover
          ? <AppPreviewImage src={entry.cover} alt="" className="size-full object-cover" loading="lazy" decoding="async" referrerPolicy="no-referrer" />
          : <Icon />}
      </div>
      <div className={styles.info}>
        <div className={styles.name}>{entry.name}</div>
        {!compact && <div className={styles.identifier}>
          <span title={entry.identifier}>{entry.identifier}</span>
          {entry.page && <a className={styles.sourceLink} href={entry.page} target="_blank" rel="noopener noreferrer"
            aria-label={`${entry.name} — ${entry.provider}`} title={entry.provider}><ExternalLink aria-hidden="true" /></a>}
        </div>}
        <div className={styles.badges}>
          <AppModalityTag>{entry.provider}</AppModalityTag>
          {!compact && entry.capabilities.map(capability => <AppModalityTag key={capability}>{tc(capability)}</AppModalityTag>)}
        </div>
        {!compact && entry.description && <p className={styles.description}>{entry.description}</p>}
      </div>
      {selectedKey === model.key ? <Check className={styles.selected} aria-hidden="true" /> : !compact && <Plus className={styles.add} aria-hidden="true" />}
    </li>;
  };

  return <AppDialog open onOpenChange={(next, details) => {
    const event = details.event;
    if (details.reason === "escape-key" && (composition.current || (event instanceof KeyboardEvent && (event.isComposing || event.keyCode === 229)))) {
      details.cancel();
      return;
    }
    onOpenChange(next);
  }}>
    <AppDialogContent data-space-model-browser="" surface="canvas" padding="none" showCloseButton={false}
      className={cn(styles.dialog, "w-full max-w-5xl sm:max-w-5xl h-[min(760px,calc(100dvh-2rem))] flex flex-col gap-0 overflow-hidden nodrag nopan nowheel")}
      initialFocus={() => searchButton.current?.querySelector<HTMLButtonElement>("button") ?? true}
      onPointerDown={event => event.stopPropagation()}
      onKeyDownCapture={event => {
        if (composition.current || event.nativeEvent.isComposing || event.keyCode === 229) {
          event.stopPropagation();
          const editing = event.target instanceof Element && event.target.closest("input, textarea, [contenteditable=true]");
          if (!editing && (event.key === "Enter" || event.key === "Escape")) event.preventDefault();
        }
      }}
      onKeyDown={event => {
        if (!event.defaultPrevented && event.key === "Escape" && !composition.current
          && !event.nativeEvent.isComposing && event.keyCode !== 229) {
          event.preventDefault(); onOpenChange(false);
        }
        event.stopPropagation();
      }}
      onCompositionStartCapture={() => { composition.current = true; setComposing(true); }}
      onCompositionEndCapture={() => { composition.current = false; setComposing(false); }}>
      <AppDialogHeader className={styles.header}>
        <AppDialogTitle>{tc(title ?? (initialType ? "Browse Models" : "All models"))}</AppDialogTitle>
        <AppDialogClose asChild><AppCloseButton aria-label={tc("Close models")} /></AppDialogClose>
      </AppDialogHeader>
      <NodeTextEditorScope enabled={false}>
        <div className={styles.filters} ref={searchButton}>
          <AppFilterToolbar search={<AppSearchField autoFocus value={query}
            onChange={event => setQuery(event.target.value)} onClear={() => { setQuery(""); setSearch(""); }}
            aria-label={tc("Search models")} placeholder={tc("Search models...")} />}
            searchActive={!!query.trim()} filterCount={Number(!!provider) + Number(!initialType && type !== "all")}
            onResetFilters={() => { setProviderFilter(null); setTypeFilter("all"); }}
            filters={<>
              <AppFilterSection label={tc("Provider")}>
                <select aria-label={tc("Provider")} className={cn(appInputShellClassName, styles.provider)} value={provider ?? ""}
                  onChange={event => setProviderFilter(event.target.value || null)}>
                  <option value="">{tc("All Providers")}</option>
                  {providers.map(name => <option key={name} value={name}>{name}</option>)}
                </select>
              </AppFilterSection>
              <AppFilterSection label={tc("Model capability")}>
                <div role="group" aria-label={tc("Model capability")} className={styles.types}>
                  {(initialType ? [initialType] : modelTypes).map(value => <AppFilterToggle key={value} type="button"
                    active={type === value} aria-pressed={type === value} disabled={!!initialType}
                    onClick={() => setTypeFilter(value)}>{tc(typeLabels[value])}</AppFilterToggle>)}
                </div>
              </AppFilterSection>
            </>}>
            <AppButton type="button" variant="ghost" size="icon" aria-label={tc("Refresh models & schemas")}
              title={tc("Refresh models & schemas")} disabled={!onRefresh || loading || isRefreshing} onClick={() => void handleRefresh()}>
              <RefreshCw aria-hidden="true" className={cn("size-4", isRefreshing && styles.spinning)} />
            </AppButton>
          </AppFilterToolbar>
        </div>
        <div className={styles.body} aria-busy={loading || isRefreshing}>
          {loading ? <div className={styles.state} role="status"><LoaderCircle className={styles.spinning} aria-hidden="true" /><span>{tc("Loading models...")}</span></div>
            : currentError ? <div className={styles.state} role="alert"><Sparkles aria-hidden="true" /><p>{currentError}</p>
              {onRefresh && <AppButton type="button" variant="surface" disabled={isRefreshing} onClick={() => void handleRefresh()}>{tc("Try Again")}</AppButton>}
            </div>
              : !results.length ? <div className={styles.state}><Sparkles aria-hidden="true" /><p>{tc("No models found")}</p><p>{tc("Try adjusting your search or filters")}</p></div>
                : <>
                  {recent.length > 0 && !query && <section className={styles.recent} aria-labelledby={recentHeading}>
                    <h3 id={recentHeading}>{tc("Recently Used")}</h3>
                    <ul className={styles.cards}>{recent.map(entry => card(entry, true))}</ul>
                  </section>}
                  <ul className={styles.cards} aria-label={tc("All models")}>{results.map(entry => card(entry))}</ul>
                </>}
        </div>
      </NodeTextEditorScope>
      {!loading && !currentError && results.length > 0 && <div className={styles.footer} aria-live="polite">
        {tc("{count} models found").replace("{count}", String(results.length))}
      </div>}
    </AppDialogContent>
  </AppDialog>;
}
