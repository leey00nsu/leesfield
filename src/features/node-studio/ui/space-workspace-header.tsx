"use client";

import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode, type RefObject } from "react";
import { FolderOpen, Keyboard, MessageSquare, Save, Settings } from "lucide-react";
import { useCanvasTranslation } from "@/shared/i18n/use-canvas-translation";
import { AppDialog, AppDialogContent, AppDialogHeader, AppDialogTitle } from "@/shared/ui/app-dialog";
import { AppTabs } from "@/shared/ui/app-tabs";
import { defaultSpaceCanvasSettings, type SpaceCanvasSettings } from "../model/space-editor-types";
import styles from "./space-workspace-header.module.css";

export type SpaceDefaultKind = "image" | "video" | "audio";
export type SpaceNodeDefaults = Partial<Record<SpaceDefaultKind, string>>;
export type SpaceHeaderGraph = { id: string; title: string };
export type SpaceWorkspaceSettingsProps = {
  nodeDefaults?: SpaceNodeDefaults;
  /** IDs are canonical model keys, never provider IDs. */
  models?: readonly { id: string; name: string; mediaKind: SpaceDefaultKind; provider?: string }[];
  onSaveNodeDefaults?: (defaults: SpaceNodeDefaults) => Promise<void>;
  onSaveSettings?: (changes: { defaults?: SpaceNodeDefaults; inlineParametersEnabled?: boolean }) => Promise<void>;
  nodeDefaultsLoading?: boolean;
  nodeDefaultsError?: string | null;
  onRetryNodeDefaults?: () => void;
  inlineParametersEnabled?: boolean;
  onInlineParametersChange?: (enabled: boolean) => void | Promise<void>;
  renderModelPicker?: (kind: SpaceDefaultKind, onSelect: (key: string) => void, onClose: () => void) => ReactNode;
};
export type SpaceWorkspaceHeaderProps = SpaceWorkspaceSettingsProps & {
  hasUnsavedChanges?: boolean;
  commentsNavigation?: ReactNode;
  title: string;
  brand?: ReactNode;
  graphs: readonly SpaceHeaderGraph[];
  activeGraphId: string;
  saveLabel: string;
  saving?: boolean;
  writable?: boolean;
  creating?: boolean;
  deleting?: boolean;
  canvasSettings?: SpaceCanvasSettings;
  onCanvasSettingsChange?: (settings: SpaceCanvasSettings) => void;
  onTitleChange: (title: string) => void;
  onSelectGraph: (id: string) => void;
  onCreateGraph: (title: string) => void;
  onSave: () => void;
  onDelete: () => void;
};

export function SpaceWorkspaceHeader(props: SpaceWorkspaceHeaderProps) {
  const tc = useCanvasTranslation();
  const [panel, setPanel] = useState<"settings" | "browser" | "shortcuts" | null>(null);
  const settingsButton = useRef<HTMLButtonElement>(null);
  const browserButton = useRef<HTMLButtonElement>(null);
  const shortcutsButton = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const key = (event: globalThis.KeyboardEvent) => {
      if (event.key !== "?" || event.defaultPrevented || event.isComposing || event.keyCode === 229 ||
        event.altKey || event.metaKey || event.ctrlKey || document.querySelector('[role="dialog"],[role="alertdialog"]') ||
        (event.target instanceof Element && event.target.closest('input,textarea,select,[contenteditable="true"]'))) return;
      event.preventDefault(); setPanel("shortcuts");
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, []);
  return <>
    <header className={styles.header} data-space-workspace-header="">
      <div className={styles.left}>
        <div className={styles.brand}>{props.brand ?? <span className={styles.brandLabel}>{tc("Spaces")}</span>}</div>
        <div className={styles.workspace}>
          <span className={styles.title} title={props.title}>{props.title || tc("Untitled")}</span>
          <div className={styles.actions}>
            <button type="button" className={styles.icon} disabled={props.saving || props.writable === false}
              aria-label={tc("Save space")} title={props.saving ? tc("Saving...") : tc("Save space")}
              data-tutorial="save-button" onClick={() => props.title ? props.onSave() : setPanel("settings")}>
              <Save aria-hidden="true" />{props.hasUnsavedChanges && !props.saving && <span className={styles.dirty} />}
            </button>
            <button ref={browserButton} type="button" className={styles.icon} aria-label={tc("Open space")} title={tc("Open space")}
              aria-haspopup="dialog" aria-expanded={panel === "browser"} onClick={() => setPanel("browser")}><FolderOpen aria-hidden="true" /></button>
          </div>
          <div className={styles.actions}>
            <button ref={settingsButton} type="button" className={styles.icon} aria-label={tc("Space settings")} title={tc("Space settings")}
              aria-haspopup="dialog" aria-expanded={panel === "settings"} onClick={() => setPanel("settings")}><Settings aria-hidden="true" /></button>
          </div>
        </div>
      </div>
      <div className={styles.right}>
        {props.commentsNavigation}
        <span className={styles.saveStatus} role="status" title={props.saveLabel}>{props.saveLabel}</span>
        <span className={styles.separator} aria-hidden="true">·</span>
        <button ref={shortcutsButton} type="button" className={styles.icon} aria-label={tc("Keyboard shortcuts")} title={tc("Keyboard shortcuts (?)")}
          aria-haspopup="dialog" onClick={() => setPanel("shortcuts")}><Keyboard aria-hidden="true" /></button>
      </div>
    </header>
    {panel === "settings" && <WorkspaceSettings {...props} onClose={() => setPanel(null)} returnFocus={settingsButton} />}
    {panel === "browser" && <SpaceBrowser {...props} onClose={() => setPanel(null)} returnFocus={browserButton} />}
    {panel === "shortcuts" && <WorkspaceShortcuts onClose={() => setPanel(null)} returnFocus={shortcutsButton} />}
  </>;
}

export function SpaceCommentsNavigationIcon({ count, unreadCount, onNavigate }: { count: number; unreadCount: number; onNavigate: () => void }) {
  const tc = useCanvasTranslation();
  if (count <= 0) return null;
  return <button type="button" className={styles.icon} onClick={onNavigate} data-canvas-action="comments"
    aria-label={tc("Navigate comments")} title={tc(unreadCount === 1 ? "{unread} unviewed comment ({count} total)" : "{unread} unviewed comments ({count} total)").replace("{unread}", String(unreadCount)).replace("{count}", String(count))}>
    <MessageSquare aria-hidden="true" />
    {unreadCount > 0 && <span className={styles.unread}>{unreadCount > 9 ? "9+" : unreadCount}</span>}
  </button>;
}

type ModalProps = { onClose: () => void; returnFocus: RefObject<HTMLButtonElement | null> };
const kinds = ["image", "video", "audio"] as const;
const kindLabels = { image: "Default Image Model", video: "Default Video Model", audio: "Default Audio Model" };

function WorkspaceSettings({ title, writable = true, canvasSettings = defaultSpaceCanvasSettings, onCanvasSettingsChange, onTitleChange,
  nodeDefaults = {}, models = [], onSaveNodeDefaults, onSaveSettings, nodeDefaultsLoading = false, nodeDefaultsError,
  onRetryNodeDefaults, inlineParametersEnabled = true, onInlineParametersChange, renderModelPicker, onClose, returnFocus,
}: SpaceWorkspaceHeaderProps & ModalProps) {
  const tc = useCanvasTranslation();
  const [name, setName] = useState(title);
  const [defaultsDraft, setDefaultsDraft] = useState<SpaceNodeDefaults | null>(null);
  const [inlineDraft, setInlineDraft] = useState<boolean | null>(null);
  const [canvasDraft, setCanvasDraft] = useState<SpaceCanvasSettings>({ ...canvasSettings });
  const [pickerKind, setPickerKind] = useState<SpaceDefaultKind | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [conflict, setConflict] = useState(false);
  const pending = useRef(false), composing = useRef(false), mounted = useRef(true);
  const nameInput = useRef<HTMLInputElement>(null);
  const defaults = defaultsDraft ?? nodeDefaults, inline = inlineDraft ?? inlineParametersEnabled;
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const save = async () => {
    if (pending.current || composing.current || conflict || nodeDefaultsLoading || !name.trim()) return;
    pending.current = true; setBusy(true); setError(null);
    try {
      if (defaultsDraft !== null) {
        for (const kind of kinds) {
          if (defaults[kind] && !models.some(model => model.id === defaults[kind] && model.mediaKind === kind)) {
            throw new Error(tc("Select an available model before saving."));
          }
        }
        if (!onSaveSettings && !onSaveNodeDefaults) throw new Error(tc("Node defaults are unavailable."));
      }
      const inlineChanged = inlineDraft !== null && inline !== inlineParametersEnabled;
      if (onSaveSettings && (defaultsDraft !== null || inlineChanged)) {
        await onSaveSettings({ ...(defaultsDraft !== null ? { defaults: { ...defaults } } : {}), ...(inlineChanged ? { inlineParametersEnabled: inline } : {}) });
      } else {
        if (defaultsDraft !== null) await onSaveNodeDefaults?.({ ...defaults });
        if (inlineChanged) await onInlineParametersChange?.(inline);
      }
      if (!mounted.current) return;
      onCanvasSettingsChange?.(canvasDraft);
      if (writable) onTitleChange(name.trim());
      onClose();
    } catch (cause) {
      if (mounted.current) {
        if (cause instanceof Error && "code" in cause && cause.code === "SPACE_PREFERENCES_CONFLICT") setConflict(true);
        setError(cause instanceof Error ? cause.message : tc("Could not save settings. Please try again."));
      }
    } finally { pending.current = false; if (mounted.current) setBusy(false); }
  };
  return <AppDialog open onOpenChange={(open, details) => {
    if (open) return;
    if (pending.current || composing.current || pickerKind || (details.event instanceof KeyboardEvent && (details.event.isComposing || details.event.keyCode === 229))) details.cancel();
    else onClose();
  }}>
    <AppDialogContent surface="canvas" padding="none" showCloseButton={false} className={styles.settingsDialog}
      finalFocus={() => returnFocus.current ?? true} initialFocus={() => nameInput.current ?? true}
      onPointerDown={event => event.stopPropagation()} onKeyDown={event => event.stopPropagation()}
      onCompositionStartCapture={() => { composing.current = true; }} onCompositionEndCapture={() => { composing.current = false; }}>
      <AppDialogHeader className={styles.modalHeader}><AppDialogTitle>{tc("Space Settings")}</AppDialogTitle></AppDialogHeader>
      <form className={styles.settingsForm} onSubmit={event => { event.preventDefault(); void save(); }}
        onKeyDownCapture={event => { if ((composing.current || event.nativeEvent.isComposing || event.keyCode === 229) && (event.key === "Enter" || event.key === "Escape")) event.stopPropagation(); }}>
        <AppTabs ariaLabel={tc("Settings sections")} className={styles.tabs} listClassName={styles.tabList} panelClassName={styles.panel} triggerClassName={styles.settingsTab}
          items={[
            { value: "project", label: tc("Space"), content: <div className={styles.stack}>
              <label className={styles.field}>{tc("Space name")}<input ref={nameInput} value={name} onChange={event => setName(event.target.value)}
                aria-label={tc("Space name")} placeholder={tc("Untitled Space")} maxLength={120} disabled={!writable || busy} /></label>
              <label className={styles.inlineSetting}>
                <span><span>{tc("Show model settings on nodes")}</span><small>{tc("Show model parameters inside generation nodes instead of the side panel")}</small></span>
                <button type="button" role="switch" aria-label={tc("Show model settings on nodes")} aria-checked={inline}
                  disabled={busy || nodeDefaultsLoading} className={styles.switch} onClick={() => setInlineDraft(!inline)}><span /></button>
              </label>
            </div> },
            { value: "nodeDefaults", label: tc("Node Defaults"), content: <div className={styles.stack}>
              {nodeDefaultsLoading && <p role="status">{tc("Loading defaults...")}</p>}
              {nodeDefaultsError && <div className={styles.error} role="alert">{nodeDefaultsError}{onRetryNodeDefaults && <button type="button" className={styles.button} disabled={busy || nodeDefaultsLoading} onClick={onRetryNodeDefaults}>{tc("Retry")}</button>}</div>}
              {kinds.map(kind => <div className={styles.defaultRow} key={kind} role="group" aria-label={tc(kindLabels[kind])}>
                <span>{tc(kindLabels[kind])}</span>
                <div className={styles.defaultActions}>
                  <span className={styles.modelName} title={defaults[kind]}>{defaults[kind] ? models.find(model => model.id === defaults[kind] && model.mediaKind === kind)?.name ?? defaults[kind] : tc("None set (select on first use)")}</span>
                  <button type="button" className={styles.button} disabled={busy || nodeDefaultsLoading || !renderModelPicker} onClick={() => setPickerKind(kind)}>{tc(defaults[kind] ? "Change" : "Select Model")}</button>
                  {defaults[kind] && <button type="button" className={styles.textButton} disabled={busy || nodeDefaultsLoading} onClick={() => setDefaultsDraft(previous => { const next = { ...(previous ?? nodeDefaults) }; delete next[kind]; return next; })}>{tc("Clear")}</button>}
                </div>
              </div>)}
              <button type="button" className={styles.textButton} disabled={busy || nodeDefaultsLoading} onClick={() => setDefaultsDraft({})}>{tc("Reset defaults")}</button>
            </div> },
            { value: "canvas", label: tc("Canvas"), content: <div className={styles.stack}>
              <p>{tc("Configure how you navigate and interact with the canvas.")}</p>
              <CanvasChoice label={tc("Pan Mode")} value={canvasDraft.panMode} disabled={busy}
                options={[["space", tc("Space + Drag")], ["middleMouse", tc("Middle Mouse")], ["always", tc("Always On")]]}
                onChange={panMode => setCanvasDraft(previous => ({ ...previous, panMode }))} />
              <CanvasChoice label={tc("Zoom Mode")} value={canvasDraft.zoomMode} disabled={busy}
                options={[["altScroll", tc("Alt + Scroll")], ["ctrlScroll", tc("Ctrl + Scroll")], ["scroll", tc("Scroll")]]}
                onChange={zoomMode => setCanvasDraft(previous => ({ ...previous, zoomMode }))} />
              <CanvasChoice label={tc("Selection Mode")} value={canvasDraft.selectionMode} disabled={busy}
                options={[["click", tc("Click")], ["altDrag", tc("Alt + Drag")], ["shiftDrag", tc("Shift + Drag")]]}
                onChange={selectionMode => setCanvasDraft(previous => ({ ...previous, selectionMode }))} />
            </div> },
          ]} />
        {error && <p role="alert" className={styles.error}>{error}</p>}
        <footer className={styles.footer}>
          <button type="button" className={styles.button} disabled={busy} onClick={onClose}>{tc("Cancel")}</button>
          <button type="submit" className={styles.primary} disabled={conflict || busy || nodeDefaultsLoading || !name.trim()}>{tc(busy ? "Saving..." : "Save")}</button>
        </footer>
      </form>
      {pickerKind && renderModelPicker?.(pickerKind, key => {
        if (pending.current || !models.some(model => model.id === key && model.mediaKind === pickerKind)) return;
        setDefaultsDraft(previous => ({ ...(previous ?? nodeDefaults), [pickerKind]: key })); setPickerKind(null);
      }, () => setPickerKind(null))}
    </AppDialogContent>
  </AppDialog>;
}

function CanvasChoice<T extends string>({ label, value, options, onChange, disabled }: {
  label: string; value: T; options: readonly (readonly [T, string])[]; onChange: (value: T) => void; disabled: boolean;
}) {
  return <div className={styles.canvasChoice} role="group" aria-label={label}><span>{label}</span>
    <AppTabs selectionOnly ariaLabel={label} value={value} className={styles.choiceTabs} listClassName={styles.choiceList} triggerClassName={styles.choiceTab}
      onValueChange={next => { const option = options.find(([key]) => key === next); if (!disabled && option) onChange(option[0]); }}
      items={options.map(([key, text]) => ({ value: key, label: text, disabled }))} />
  </div>;
}

function SpaceBrowser({ graphs, activeGraphId, onSelectGraph, onCreateGraph, onDelete, creating, deleting, onClose, returnFocus }: SpaceWorkspaceHeaderProps & ModalProps) {
  const tc = useCanvasTranslation();
  const [creatingDraft, setCreatingDraft] = useState(false), [name, setName] = useState(tc("Untitled Space"));
  const list = useRef<HTMLDivElement>(null), input = useRef<HTMLInputElement>(null), composing = useRef(false);
  const listKeys = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.nativeEvent.isComposing || event.keyCode === 229 || event.altKey || event.metaKey || event.ctrlKey) return;
    const buttons = Array.from(list.current?.querySelectorAll<HTMLButtonElement>("button") ?? []);
    const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
    const next = event.key === "Home" ? 0 : event.key === "End" ? buttons.length - 1 : event.key === "ArrowDown" ? (index + 1) % buttons.length : event.key === "ArrowUp" ? (index - 1 + buttons.length) % buttons.length : -1;
    if (next >= 0) { event.preventDefault(); event.stopPropagation(); buttons[next]?.focus(); }
  };
  useEffect(() => { if (creatingDraft) input.current?.focus(); }, [creatingDraft]);
  return <AppDialog open onOpenChange={(open, details) => { if (!open && !composing.current) onClose(); else if (!open) details.cancel(); }}>
    <AppDialogContent surface="canvas" padding="none" showCloseButton={false} className={styles.browserDialog}
      initialFocus={() => list.current?.querySelector<HTMLButtonElement>('[aria-current="page"]') ?? true} finalFocus={() => returnFocus.current ?? true}
      onPointerDown={event => event.stopPropagation()} onKeyDown={event => event.stopPropagation()}
      onCompositionStartCapture={() => { composing.current = true; }} onCompositionEndCapture={() => { composing.current = false; }}>
      <AppDialogHeader className={styles.modalHeader}><AppDialogTitle>{tc(creatingDraft ? "New space" : "Spaces")}</AppDialogTitle></AppDialogHeader>
      {creatingDraft ? <form className={styles.newSpace} onSubmit={event => {
        event.preventDefault(); if (creating || composing.current || !name.trim()) return; onCreateGraph(name.trim()); onClose();
      }}>
        <label className={styles.field}>{tc("Space name")}<input ref={input} maxLength={120} aria-label={tc("Space name")} value={name} onChange={event => setName(event.target.value)} disabled={creating} /></label>
        <footer className={styles.footer}><button type="button" className={styles.button} onClick={() => setCreatingDraft(false)}>{tc("Cancel")}</button><button type="submit" className={styles.primary} disabled={creating || !name.trim()}>{tc("Create")}</button></footer>
      </form> : <>
        <div ref={list} className={styles.spaceList} onKeyDown={listKeys}>
          {!graphs.length && <p>{tc("No spaces available.")}</p>}
          {graphs.map(graph => <button type="button" key={graph.id} aria-current={graph.id === activeGraphId ? "page" : undefined}
            onClick={() => { onSelectGraph(graph.id); onClose(); }}>{graph.title}</button>)}
        </div>
        <footer className={styles.footer}>
          <button type="button" className={styles.button} disabled={creating} onClick={() => setCreatingDraft(true)}>{tc("New space")}</button>
          <button type="button" className={styles.danger} disabled={deleting} onClick={() => { onClose(); onDelete(); }}>{tc("Delete space")}</button>
          <button type="button" className={styles.button} onClick={onClose}>{tc("Close")}</button>
        </footer>
      </>}
    </AppDialogContent>
  </AppDialog>;
}

function WorkspaceShortcuts({ onClose, returnFocus }: ModalProps) {
  const tc = useCanvasTranslation();
  const mod = typeof navigator !== "undefined" && /Mac|iPod|iPhone|iPad/.test(navigator.userAgent) ? "⌘" : "Ctrl";
  const groups = [
    ["General", [[`${mod} C`, "Copy selected nodes"], [`${mod} V`, "Paste nodes / image / text"], [`${mod} Z`, "Undo"], [`${mod} Shift Z`, "Redo"], [`${mod} K`, "All nodes"], ["?", "Show keyboard shortcuts"]]],
    ["Add Nodes", [["Shift P", "Add Prompt node"], ["Shift I", "Add Image Input node"], ["Shift G", "Add Generate Image node"], ["Shift V", "Add Generate Video node"], ["Shift T", "Add Audio node"], ["Shift Y", "Add Video Input node"]]],
    ["Layout (select 2+ nodes first)", [["V", "Stack selected vertically"], ["H", "Stack selected horizontally"], ["G", "Arrange selected as grid"]]],
    ["Canvas", [["Delete", "Delete selected nodes"]]],
  ] as const;
  return <AppDialog open onOpenChange={open => { if (!open) onClose(); }}>
    <AppDialogContent surface="canvas" padding="none" showCloseButton={false} className={styles.shortcutsDialog} finalFocus={() => returnFocus.current ?? true}
      onPointerDown={event => event.stopPropagation()} onKeyDown={event => event.stopPropagation()}>
      <AppDialogHeader className={styles.modalHeader}><AppDialogTitle>{tc("Keyboard Shortcuts")}</AppDialogTitle></AppDialogHeader>
      <div className={styles.shortcutGroups}>{groups.map(([heading, rows]) => <section key={heading}><h3>{tc(heading)}</h3><dl>
        {rows.map(([keys, label]) => <div key={label}><dt>{tc(label)}</dt><dd><kbd>{keys}</kbd></dd></div>)}
      </dl></section>)}</div>
      <footer className={styles.footer}><button type="button" className={styles.button} onClick={onClose}>{tc("Close")}</button></footer>
    </AppDialogContent>
  </AppDialog>;
}
