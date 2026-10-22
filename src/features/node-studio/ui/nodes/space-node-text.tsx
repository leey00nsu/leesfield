"use client";

/* Prompt/Constructor layout and autocomplete adapted from Node Banana.
 * Copyright (c) 2026 William Falloon. MIT License.
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 */

import { useId, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { constructPrompt, promptVariables, resolveGraphText, type PromptSource, type PromptVariable } from "@/shared/generation-graph/prompt-constructor";
import { memoBackgroundColorSchema } from "@/shared/generation-graph/node-registry";
import { useCanvasTranslation } from "@/shared/i18n/use-canvas-translation";
import { cn } from "@/shared/lib/utils";
import { AppButton } from "@/shared/ui/app-button";
import { AppChoiceSelect } from "@/shared/ui/app-choice-select";
import { AppInput } from "@/shared/ui/app-input";
import { AppTextarea } from "@/shared/ui/app-form-control";
import { AppPromptSurface } from "@/shared/ui/app-prompt-surface";
import { AppDialog, AppDialogActionButton, AppDialogCancelButton, AppDialogContent, AppDialogDangerButton, AppDialogDescription, AppDialogFooter, AppDialogHeader, AppDialogTitle } from "@/shared/ui/app-dialog";
import { NodeTextEditor } from "@/shared/ui/node-text-editor";
import { useSpaceEditor, useSpaceInputRevision, useSpaceResolvedInput, useSpaceSelector, useSpaceViewSelector, type SpaceEditorScope } from "../space-editor-provider";
import { SpaceNodeFrame } from "./space-node-frame";
import styles from "./space-node-text.module.css";

function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
function string(value: unknown) { return typeof value === "string" ? value : ""; }
function memoColors(value: unknown): CSSProperties | undefined {
  const color = memoBackgroundColorSchema.safeParse(value);
  if (!color.success) return;
  const channels = [1, 3, 5].map(offset => parseInt(color.data.slice(offset, offset + 2), 16) / 255)
    .map(channel => channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4);
  const luminance = channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
  return { backgroundColor: color.data, "--memo-background-color": color.data, "--memo-foreground": luminance > 0.179 ? "#171717" : "#f5f5f5" } as CSSProperties;
}
function ime(event: { isComposing?: boolean; keyCode?: number }) { return event.isComposing || event.keyCode === 229; }
function closeExpanded(scope: SpaceEditorScope, nodeId: string) {
  const next = new Set(scope.view.getState().expandedNodeIds);
  next.delete(nodeId);
  scope.view.setState({ expandedNodeIds: next });
}

function useConstructorSources(nodeId: string, enabled: boolean): PromptSource[] {
  const scope = useSpaceEditor();
  return useSpaceResolvedInput(nodeId, inputs => {
    // The revision is the dependency signal; read the latest document here so a
    // source edit cannot leave variables built from a previous render's graph.
    if (!enabled) return [];
    const document = scope.session.getDocument();
    const nodes = new Map(document.nodes.map(node => [node.id, node]));
    return inputs.incomingEdges(nodeId, "text").filter(edge => !edge.hasPause).flatMap(edge => {
      const node = nodes.get(edge.sourceNodeId);
      if (!node) return [];
      let text = "";
      try { text = resolveGraphText(document, node.id, new Set([nodeId]), scope.getInputRuntime().assistantResults, edge.sourcePortId); }
      catch { /* Invalid source text never replaces the authored template. */ }
      const variableName = record(node.config).variableName;
      return [{ id: node.id, kind: node.kind, text, ...(typeof variableName === "string" ? { variableName } : {}) }];
    });
  });
}

/** Full native presenter. The canvas dispatches only these three text kinds here. */
export function SpaceTextNode({ nodeId }: { nodeId: string }) {
  const node = useSpaceSelector(state => state.nodeById.get(nodeId));
  const spaceId = useSpaceSelector(state => state.id);
  if (!node || !["note.memo", "input.prompt", "process.promptConstructor"].includes(node.kind)) return null;
  return <SpaceNodeFrame nodeId={nodeId} style={node.kind === "note.memo" ? memoColors(record(node.config).backgroundColor) : undefined}>
    <TextBody key={`${spaceId}:${nodeId}:${node.kind}`} nodeId={nodeId} kind={node.kind} config={record(node.config)} />
  </SpaceNodeFrame>;
}

function TextBody({ nodeId, kind, config }: { nodeId: string; kind: string; config: Record<string, unknown> }) {
  const scope = useSpaceEditor(), tc = useCanvasTranslation();
  const writable = useSpaceSelector(state => state.writable);
  const expanded = useSpaceViewSelector(state => state.expandedNodeIds.has(nodeId));
  const sources = useConstructorSources(nodeId, kind === "process.promptConstructor");
  const [naming, setNaming] = useState(false);
  const constructor = kind === "process.promptConstructor", memo = kind === "note.memo";
  const incoming = useSpaceResolvedInput(nodeId, inputs => kind === "input.prompt" ? inputs.promptInput(nodeId) : { connected: false, text: null });
  const field = constructor ? "template" : "text";
  const text = incoming.connected ? incoming.text ?? "" : string(config[field]);
  const disabled = !writable || incoming.connected;
  const label = memo ? tc("Memo") : incoming.connected ? tc("Text from connected Prompt node") : tc("Describe what to generate...");
  const patch = (value: string) => {
    if (!scope.session.getSnapshot().writable || (kind === "input.prompt" && scope.inputs.promptInput(nodeId).connected)) return;
    scope.session.dispatch({ type: "node.config.patch", nodeId, patch: { [field]: value } });
  };
  return <div className={cn(styles.body, memo && styles.memo)} style={memo ? memoColors(config.backgroundColor) : undefined} onFocusCapture={event => {
    // Entering a text body also selects its node, so Escape can return to
    // canvas commands without losing the target the user just edited.
    if (event.target instanceof Element && event.currentTarget.contains(event.target)
      && event.target.closest("[data-node-text-editor]")) scope.session.select([nodeId]);
  }}>
    <AppPromptSurface className={styles.surface} textarea={constructor ? <ConstructorEditor value={text} sources={sources} disabled={disabled} onChange={patch} inline /> :
      <NodeTextEditor label={label} disabled={disabled} className={styles.textEditor}>
        {editing => <AppTextarea surface="transparent" aria-label={label} value={text} disabled={disabled} readOnly={!editing} tabIndex={editing ? 0 : -1}
          maxLength={20_000} placeholder={memo ? tc("Write a note...") : incoming.connected ? tc("Text from connected Prompt node...") : record(config.presentation).isOptional === true ? tc("Optional prompt (leave empty to skip)...") : tc("Describe what to generate...")}
          className={styles.textarea}
          onPointerDown={event => { if (editing) event.stopPropagation(); }} onChange={event => patch(event.target.value)} />}
      </NodeTextEditor>}
      footer={kind === "input.prompt" ? <div className={styles.footer}>
        <AppButton type="button" variant="ghost" size="sm" disabled={!writable} className={cn(styles.variableButton, "nodrag nopan")}
          title={tc("Set variable name")} onClick={() => setNaming(true)}>
          {string(config.variableName) ? `@${config.variableName}` : tc("Add variable")}
        </AppButton>
      </div> : <></>} />
    {naming && <VariableNameDialog nodeId={nodeId} name={string(config.variableName)} onClose={() => setNaming(false)} />}
    {expanded && !memo && <ExpandedTextEditor nodeId={nodeId} field={field} initialText={text} sources={sources} disabled={disabled}
      onClose={() => closeExpanded(scope, nodeId)} />}
  </div>;
}

function VariableNameDialog({ nodeId, name, onClose }: { nodeId: string; name: string; onClose: () => void }) {
  const scope = useSpaceEditor(), tc = useCanvasTranslation(), id = useId();
  const writable = useSpaceSelector(state => state.writable);
  const [source] = useState(() => ({ scope, spaceId: scope.session.getSnapshot().id, name, returnFocus: document.activeElement as HTMLElement | null }));
  const [draft, setDraft] = useState(name), composing = useRef(false);
  const current = scope.session.getSnapshot();
  const valid = writable && scope === source.scope && current.id === source.spaceId && string(record(current.nodeById.get(nodeId)?.config).variableName) === source.name;
  const save = (value: string) => {
    const state = scope.session.getSnapshot();
    if (!valid || !state.writable || state.id !== source.spaceId || string(record(state.nodeById.get(nodeId)?.config).variableName) !== source.name) return;
    const result = scope.session.dispatch({ type: "node.config.fields", nodeId, changes: value
      ? [{ path: ["variableName"], value }] : [{ path: ["variableName"], remove: true }] });
    if (result.ok) onClose();
  };
  return <AppDialog open onOpenChange={(open, details) => {
    if (open) return;
    if (composing.current || (details.event instanceof globalThis.KeyboardEvent && ime(details.event))) { details.cancel(); return; }
    onClose();
  }}>
    <AppDialogContent size="sm" surface="editor" finalFocus={() => source.returnFocus?.isConnected ? source.returnFocus : false} onKeyDownCapture={event => {
      if (ime(event.nativeEvent) || composing.current) event.stopPropagation();
    }}>
      <AppDialogHeader><AppDialogTitle>{tc("Set Variable Name")}</AppDialogTitle></AppDialogHeader>
      <AppDialogDescription>{tc("Use this prompt as a variable in PromptConstructor nodes")}</AppDialogDescription>
      <label htmlFor={id}>{tc("Variable name")}</label>
      <AppInput id={id} autoFocus value={draft} disabled={!valid} maxLength={30} placeholder={tc("e.g. color, style, subject")}
        onCompositionStart={() => { composing.current = true; }} onCompositionEnd={() => { composing.current = false; }}
        onChange={event => setDraft(event.target.value.replace(/[^a-zA-Z0-9_]/g, "").slice(0, 30))}
        onKeyDown={event => {
          if (event.key === "Enter" && !ime(event.nativeEvent) && !composing.current) { event.preventDefault(); event.stopPropagation(); save(draft); }
        }} />
      {draft && <div className={styles.variablePreview}>{tc("Preview:")} <span>@{draft}</span></div>}
      <AppDialogFooter>
        {name && <AppDialogDangerButton disabled={!valid} onClick={() => save("")}>{tc("Clear")}</AppDialogDangerButton>}
        <AppDialogCancelButton onClick={onClose}>{tc("Cancel")}</AppDialogCancelButton>
        <AppDialogActionButton disabled={!valid} onClick={() => save(draft)}>{tc("Save")}</AppDialogActionButton>
      </AppDialogFooter>
    </AppDialogContent>
  </AppDialog>;
}

function ConstructorEditor({ value, sources, disabled, onChange, inline = false, fontSize }: {
  value: string; sources: PromptSource[]; disabled: boolean; onChange: (value: string) => void; inline?: boolean; fontSize?: number;
}) {
  const tc = useCanvasTranslation(), menuId = useId();
  const textarea = useRef<HTMLTextAreaElement>(null), highlight = useRef<HTMLDivElement>(null), composing = useRef(false);
  const [query, setQuery] = useState<{ filter: string; top: number } | null>(null), [selected, setSelected] = useState(0);
  const variables = useMemo(() => promptVariables(sources), [sources]);
  const names = new Set(variables.map(variable => variable.name));
  const unresolved = [...new Set([...value.matchAll(/@(\w+)/g)].map(match => match[1]).filter(name => !names.has(name)))];
  const options = query ? variables.filter(variable => variable.name.toLowerCase().includes(query.filter.toLowerCase())) : [];
  const selectedIndex = Math.min(selected, Math.max(0, options.length - 1));
  let preview = "";
  try { preview = constructPrompt(value, sources); } catch { /* Oversized input does not replace the authored template. */ }
  const parts: ReactNode[] = [];
  let last = 0;
  for (const match of value.matchAll(/@(\w+)/g)) {
    parts.push(value.slice(last, match.index));
    parts.push(<mark key={match.index} data-resolved={names.has(match[1])}>{match[0]}</mark>);
    last = match.index + match[0].length;
  }
  parts.push(value.slice(last));
  const updateQuery = (input: HTMLTextAreaElement) => {
    const before = input.value.slice(0, input.selectionStart), match = before.match(/@(\w*)$/);
    setSelected(0);
    setQuery(!disabled && !composing.current && match ? { filter: match[1], top: Math.max(12, Math.min(before.split("\n").length * (fontSize ?? 14) * (12 / 7) + 10 - input.scrollTop, Math.max(30, input.clientHeight - 160))) } : null);
  };
  const choose = (variable: PromptVariable) => {
    const input = textarea.current;
    if (!input || disabled || composing.current) return;
    const cursor = input.selectionStart, match = value.slice(0, cursor).match(/@(\w*)$/);
    if (!match) return;
    const start = cursor - match[0].length, next = value.slice(0, start) + `@${variable.name}` + value.slice(input.selectionEnd);
    if (next.length > 20_000) return;
    onChange(next);
    setQuery(null);
    requestAnimationFrame(() => {
      if (!input.isConnected || (inline && input.readOnly)) return;
      input.focus();
      input.setSelectionRange(start + variable.name.length + 1, start + variable.name.length + 1);
    });
  };
  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (ime(event.nativeEvent) || composing.current || disabled || !query || !options.length) return;
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault(); event.stopPropagation();
      setSelected((selectedIndex + (event.key === "ArrowDown" ? 1 : options.length - 1)) % options.length);
    } else if (event.key === "Enter" || event.key === "Tab") {
      event.preventDefault(); event.stopPropagation(); choose(options[selectedIndex]);
    }
  };
  const editor = (editing: boolean) => <>
    <div className={styles.templateSurface}>
      <div ref={highlight} aria-hidden="true" className={cn(styles.highlight, !inline && styles.expandedPadding)} style={{ fontSize }}>{parts}{"\n"}</div>
      <AppTextarea surface="transparent" ref={textarea} autoFocus={!inline} value={value} aria-label={tc("Type @ to insert variables...")} placeholder={tc("Type @ to insert variables...")}
        disabled={disabled} readOnly={!editing} tabIndex={editing ? 0 : -1} maxLength={20_000} title={preview ? `${tc("Preview:")} ${preview}` : undefined}
        aria-autocomplete="list" aria-controls={!disabled && query && options.length ? menuId : undefined} aria-activedescendant={!disabled && query && options.length ? `${menuId}-${selectedIndex}` : undefined}
        className={cn(styles.textarea, styles.templateText, !inline && styles.expandedPadding)} style={{ fontSize }}
        onPointerDown={event => { if (editing) event.stopPropagation(); }}
        onCompositionStart={() => { composing.current = true; setQuery(null); }}
        onCompositionEnd={event => { composing.current = false; updateQuery(event.currentTarget); }}
        onChange={event => { if (!disabled) { onChange(event.target.value); updateQuery(event.target); } }}
        onBlur={() => setQuery(null)} onKeyDown={onKeyDown}
        onScroll={event => {
          if (highlight.current) { highlight.current.scrollTop = event.currentTarget.scrollTop; highlight.current.scrollLeft = event.currentTarget.scrollLeft; }
          setQuery(null);
        }} />
      {!disabled && editing && query && options.length > 0 && <div id={menuId} role="listbox" aria-label={tc("Available variables")} className={cn(styles.autocomplete, "nodrag nopan nowheel")} style={{ top: query.top }}>
        {options.map((variable, index) => <AppButton type="button" variant="ghost" size="sm" role="option" id={`${menuId}-${index}`} key={variable.nodeId}
          aria-label={`@${variable.name} ${variable.value || tc("(empty)")}`} aria-selected={index === selectedIndex} tabIndex={-1} className={styles.suggestion}
          onPointerDown={event => event.preventDefault()} onMouseDown={event => { event.preventDefault(); event.stopPropagation(); choose(variable); }}
          onClick={() => choose(variable)}>
          <span>@{variable.name}</span><span>{variable.value || tc("(empty)")}</span>
        </AppButton>)}
      </div>}
    </div>
    {(variables.length > 0 || unresolved.length > 0) && <div className={cn(styles.footer, styles.constructorFooter)}>
      <span>{variables.length > 0 ? `${tc("Available:")} ${variables.map(variable => `@${variable.name}`).join(", ")}` : ""}</span>
      {unresolved.length > 0 && <span className={styles.missing}>{unresolved.length} {tc(unresolved.length === 1 ? "var" : "vars")} {tc("missing")}</span>}
    </div>}
  </>;
  return <div className={styles.constructorEditor} onKeyDownCapture={event => {
    // Close suggestions before NodeTextEditor's capture handler exits editing.
    if (event.key === "Escape" && query && !ime(event.nativeEvent) && !composing.current) {
      event.preventDefault(); event.stopPropagation(); setQuery(null);
    }
  }}>
    {inline ? <NodeTextEditor label={tc("Type @ to insert variables...")} disabled={disabled} className={styles.textEditor}>{editor}</NodeTextEditor> : editor(true)}
  </div>;
}

const FONT_SIZES = [10, 12, 14, 16, 18, 20, 24];
const FONT_SIZE_STORAGE_KEY = "prompt-editor-font-size";
function initialFontSize() {
  const saved = typeof window === "undefined" ? 14 : Number(window.localStorage.getItem(FONT_SIZE_STORAGE_KEY));
  return FONT_SIZES.includes(saved) ? saved : 14;
}

function ExpandedTextEditor({ nodeId, field, initialText, sources, disabled, onClose }: {
  nodeId: string; field: string; initialText: string; sources: PromptSource[]; disabled: boolean; onClose: () => void;
}) {
  const scope = useSpaceEditor(), t = useTranslations("nodeStudio.host");
  const revision = useSpaceInputRevision(nodeId);
  const [source] = useState(() => ({ scope, spaceId: scope.session.getSnapshot().id, revision: scope.inputs.inputRevision(nodeId), text: initialText,
    fieldValue: record(scope.session.getSnapshot().nodeById.get(nodeId)?.config)[field], returnFocus: document.activeElement as HTMLElement | null }));
  const [draft, setDraft] = useState(initialText), [fontSize, setFontSize] = useState(initialFontSize), [confirmDiscard, setConfirmDiscard] = useState(false);
  const composing = useRef(false);
  const current = scope.session.getSnapshot();
  const valid = !disabled && scope === source.scope && current.id === source.spaceId && revision === source.revision
    && record(current.nodeById.get(nodeId)?.config)[field] === source.fieldValue;
  const dirty = draft !== source.text;
  const close = () => { if (dirty) setConfirmDiscard(true); else onClose(); };
  const submit = () => {
    const state = scope.session.getSnapshot();
    if (!valid || !state.writable || state.id !== source.spaceId || scope.inputs.inputRevision(nodeId) !== source.revision
      || record(state.nodeById.get(nodeId)?.config)[field] !== source.fieldValue || (field === "text" && scope.inputs.promptInput(nodeId).connected)) return;
    if (scope.session.dispatch({ type: "node.config.patch", nodeId, patch: { [field]: draft } }).ok) onClose();
  };
  return <AppDialog open onOpenChange={(open, details) => {
    if (open) return;
    if (composing.current || (details.event instanceof globalThis.KeyboardEvent && ime(details.event))) { details.cancel(); return; }
    if (dirty) details.cancel();
    close();
  }}>
    <AppDialogContent size="md" surface="editor" padding="none" className={styles.expandedDialog} aria-describedby={undefined}
      finalFocus={() => source.returnFocus?.isConnected ? source.returnFocus : false} onCompositionStart={() => { composing.current = true; }} onCompositionEnd={() => { composing.current = false; }}
      onKeyDownCapture={event => { if (ime(event.nativeEvent) || composing.current) event.stopPropagation(); }}>
      <AppDialogHeader className={styles.dialogHeader}><AppDialogTitle>{t("editPrompt")}</AppDialogTitle></AppDialogHeader>
      <div className={styles.expandedSurface}>
        <div className={styles.fontToolbar}><AppChoiceSelect label={t("fontSize")} value={String(fontSize)} options={FONT_SIZES.map(size => ({ value: String(size), label: `${size}px` }))}
          onValueChange={value => { const next = Number(value); setFontSize(next); window.localStorage.setItem(FONT_SIZE_STORAGE_KEY, String(next)); }} /></div>
        {field === "template" ? <ConstructorEditor value={draft} sources={sources} disabled={!valid} onChange={setDraft} fontSize={fontSize} /> :
          <AppTextarea surface="transparent" autoFocus value={draft} readOnly={!valid} maxLength={20_000} aria-label={t("prompt")} placeholder={t("promptPlaceholder")}
            className={cn(styles.textarea, styles.expandedText, "nodrag nopan nowheel")} style={{ fontSize }} onChange={event => { if (valid) setDraft(event.target.value); }} />}
      </div>
      <AppDialogFooter className={styles.dialogFooter}>
        <AppDialogCancelButton onClick={close}>{t("cancel")}</AppDialogCancelButton>
        <AppDialogActionButton disabled={!valid} onClick={submit}>{t("submit")}</AppDialogActionButton>
      </AppDialogFooter>
      <AppDialog open={confirmDiscard} onOpenChange={(open, details) => {
        if (!open && (composing.current || (details.event instanceof globalThis.KeyboardEvent && ime(details.event)))) { details.cancel(); return; }
        setConfirmDiscard(open);
      }}>
        <AppDialogContent size="sm" surface="editor" role="alertdialog" aria-describedby={undefined}>
          <AppDialogHeader><AppDialogTitle>{t("unsavedTitle")}</AppDialogTitle></AppDialogHeader>
          <p>{t("unsaved")}</p>
          <AppDialogFooter>
            <AppDialogCancelButton onClick={() => setConfirmDiscard(false)}>{t("cancel")}</AppDialogCancelButton>
            <AppDialogDangerButton onClick={onClose}>{t("discard")}</AppDialogDangerButton>
            <AppDialogActionButton disabled={!valid} onClick={submit}>{t("submit")}</AppDialogActionButton>
          </AppDialogFooter>
        </AppDialogContent>
      </AppDialog>
    </AppDialogContent>
  </AppDialog>;
}
