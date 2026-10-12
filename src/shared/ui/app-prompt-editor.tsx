"use client";

import { useCallback, useLayoutEffect, useMemo, useRef, useState, type ComponentProps, type ReactNode, type Ref } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/shared/lib/utils";

const TOKEN = "\uFFFC";
export type AppPromptToken = { id: string; label: string; offset?: number; content: ReactNode };
export type AppPromptTokenPosition = { id: string; offset: number };
type Props = Omit<ComponentProps<"div">, "onChange" | "children"> & {
  value: string;
  token?: AppPromptToken;
  tokens?: AppPromptToken[];
  disabled?: boolean;
  placeholder?: string;
  onChange: (text: string, tokenPresent: boolean, tokenOffset: number, tokens?: AppPromptTokenPosition[]) => void;
};

// The browser owns editable DOM; React owns only the noneditable token portal.
export function AppPromptEditor({ value, token, tokens, disabled, placeholder, onChange, ref: formRef, className, ...props }: Props) {
  const root = useRef<HTMLDivElement | null>(null);
  const [hosts, setHosts] = useState<{ token: AppPromptToken; element: HTMLSpanElement }[]>([]);
  const allTokens = useMemo(() => [...(token ? [token] : []), ...(tokens ?? [])], [token, tokens]);
  const identity = allTokens.map(item => item.id).sort().join("\u0000");
  const composing = useRef(false);
  const caret = useRef<{ start: number; end: number } | null>(null);

  const mount = useCallback((element: HTMLDivElement | null) => {
    if (!element && root.current) caret.current = selectionOffsets(root.current);
    root.current = element;
    assignRef(formRef, element);
    if (!element) return;
    const nextHosts = allTokens.map(item => {
      const element = document.createElement("span");
      element.contentEditable = "false";
      element.dataset.promptToken = item.id;
      element.className = "mr-2 inline-block max-w-full align-middle";
      return { token: item, element };
    });
    renderDocument(element, value, nextHosts);
    setHosts(nextHosts);
    if (caret.current) restoreSelection(element, caret.current);
  // Rebuild only when token identity changes, never during ordinary typing.
  // The current snapshot is used only when token identity changes.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [identity]);

  useLayoutEffect(() => {
    const element = root.current;
    if (!element || composing.current) return;
    const current = readDocument(element);
    if (current.text === value && current.tokens.map(item => item.id).sort().join("\u0000") === identity) return;
    const selection = selectionOffsets(element);
    renderDocument(element, value, hosts.map(host => ({ ...host, token: allTokens.find(item => item.id === host.token.id) ?? host.token })));
    if (selection) restoreSelection(element, selection);
  }, [value, allTokens, hosts, identity]);

  const publish = () => {
    if (disabled) return;
    const element = root.current;
    if (!element) return;
    const current = readDocument(element);
    element.dataset.empty = String(!current.units.length);
    const primary = current.tokens.find(item => item.id === token?.id);
    if (tokens) onChange(current.text, Boolean(primary), primary?.offset ?? 0, current.tokens.map(({ id, offset }) => ({ id, offset })));
    else onChange(current.text, Boolean(primary), primary?.offset ?? 0);
  };
  const insertText = (text: string) => {
    if (disabled) return;
    const element = root.current;
    if (!element) return;
    const activeSelection = window.getSelection();
    const savedRange = activeSelection?.rangeCount && element.contains(activeSelection.anchorNode)
      ? activeSelection.getRangeAt(0).cloneRange() : null;
    element.focus();
    if (savedRange) { activeSelection?.removeAllRanges(); activeSelection?.addRange(savedRange); }
    // insertText preserves the browser's native text undo history.
    if (document.execCommand?.("insertText", false, text)) { publish(); return; }
    const selection = window.getSelection();
    if (!selection?.rangeCount || !element.contains(selection.anchorNode)) return;
    const range = selection.getRangeAt(0);
    range.deleteContents();
    const node = document.createTextNode(text);
    range.insertNode(node);
    range.setStartAfter(node); range.collapse(true);
    selection.removeAllRanges(); selection.addRange(range);
    publish();
  };

  return <>
    <div {...props} ref={mount} role="textbox" aria-multiline="true" aria-disabled={disabled || undefined}
      aria-label={props["aria-label"] ?? placeholder} contentEditable={!disabled}
      suppressContentEditableWarning data-app-prompt-editor="" data-placeholder={placeholder}
      className={cn("min-h-[160px] w-full whitespace-pre-wrap break-words px-5 py-5 text-base leading-8 text-foreground outline-none [overflow-wrap:anywhere] data-[empty=true]:before:pointer-events-none data-[empty=true]:before:absolute data-[empty=true]:before:text-muted-foreground data-[empty=true]:before:content-[attr(data-placeholder)]", className)}
      onInput={() => {
        const element = root.current;
        if (element) element.dataset.empty = String(!readDocument(element).units.length);
        if (!composing.current) publish();
      }}
      onCompositionStart={() => {
        composing.current = true;
        if (!disabled && root.current) root.current.dataset.empty = "false";
      }}
      onCompositionEnd={() => { composing.current = false; publish(); }}
      onBeforeInput={event => {
        const input = event.nativeEvent as InputEvent;
        if (input.isComposing || composing.current) return;
        if (input.inputType === "insertParagraph" || input.inputType === "insertLineBreak") {
          event.preventDefault(); insertText("\n");
        }
      }}
      onKeyDown={event => {
        if (disabled || (event.target instanceof HTMLElement && event.target.closest("button"))) return;
        if (event.nativeEvent.isComposing || composing.current || event.keyCode === 229) return;
        if (event.key === "Enter") { event.preventDefault(); insertText("\n"); return; }
        if (event.key !== "Backspace" && event.key !== "Delete") return;
        const element = root.current;
        if (!element || !hosts.length) return;
        const selection = selectionOffsets(element);
        if (!selection || selection.start !== selection.end) return;
        const current = readDocument(element);
        const index = event.key === "Backspace" ? selection.start - 1 : selection.start;
        const position = current.tokens.find(item => item.unitOffset === index);
        const host = hosts.find(item => item.token.id === position?.id)?.element;
        if (!host || !element.contains(host)) return;
        event.preventDefault();
        const range = document.createRange(); range.selectNode(host); range.deleteContents();
        const browserSelection = window.getSelection();
        range.collapse(true); browserSelection?.removeAllRanges(); browserSelection?.addRange(range);
        publish();
      }}
      onPaste={event => {
        event.preventDefault();
        insertText(event.clipboardData.getData("text/plain").replace(/\r\n?/g, "\n"));
      }}
      onDrop={event => {
        event.preventDefault();
        if (Array.from(event.dataTransfer.types ?? []).includes("Files")) return;
        // Do not allow HTML, file blobs, or another editor's token markup.
        const text = event.dataTransfer.getData("text/plain");
        if (text) insertText(text.replace(/\r\n?/g, "\n"));
      }}
    />
    {hosts.map(host => {
      const item = allTokens.find(item => item.id === host.token.id);
      return item ? createPortal(item.content, host.element, item.id) : null;
    })}
  </>;
}

function assignRef(ref: Ref<HTMLDivElement> | undefined, value: HTMLDivElement | null) {
  if (typeof ref === "function") ref(value);
  else if (ref) ref.current = value;
}
function readDocument(root: Node) {
  const ids: string[] = [];
  const walk = (node: Node): string => {
    if (node.nodeType === Node.TEXT_NODE) return node.textContent ?? "";
    if (!(node instanceof Element)) return Array.from(node.childNodes).map(walk).join("");
    if (node.hasAttribute("data-prompt-token")) { ids.push(node.getAttribute("data-prompt-token")!); return TOKEN; }
    if (node.hasAttribute("data-editor-end")) return "";
    if (node.tagName === "BR") return "\n";
    let text = "";
    for (const child of node.childNodes) {
      if (child instanceof Element && ["DIV", "P"].includes(child.tagName) && text && !text.endsWith("\n")) text += "\n";
      text += walk(child);
    }
    return text;
  };
  const units = walk(root);
  let tokenIndex = 0;
  const tokens = Array.from(units.matchAll(/\uFFFC/g), match => ({
    id: ids[tokenIndex++], unitOffset: match.index!, offset: units.slice(0, match.index).replaceAll(TOKEN, "").length,
  }));
  return { units, text: units.replaceAll(TOKEN, ""), tokens };
}
function renderDocument(root: HTMLElement, text: string, hosts: { token: AppPromptToken; element: HTMLElement }[]) {
  const children: Node[] = [];
  let cursor = 0;
  for (const host of [...hosts].sort((a, b) => (a.token.offset ?? 0) - (b.token.offset ?? 0))) {
    const at = Math.max(cursor, Math.min(host.token.offset ?? 0, text.length));
    children.push(document.createTextNode(text.slice(cursor, at)), host.element);
    cursor = at;
  }
  children.push(document.createTextNode(text.slice(cursor)));
  const end = document.createElement("br"); end.dataset.editorEnd = "";
  root.replaceChildren(...children, end);
  root.dataset.empty = String(!hosts.length && !text.length);
}
function selectionOffsets(root: HTMLElement) {
  const selection = window.getSelection();
  if (!selection?.rangeCount) return null;
  const range = selection.getRangeAt(0);
  if (!root.contains(range.startContainer) || !root.contains(range.endContainer)) return null;
  const before = document.createRange(); before.selectNodeContents(root);
  before.setEnd(range.startContainer, range.startOffset);
  const start = readDocument(before.cloneContents()).units.length;
  before.setEnd(range.endContainer, range.endOffset);
  return { start, end: readDocument(before.cloneContents()).units.length };
}
function restoreSelection(root: HTMLElement, offsets: { start: number; end: number }) {
  const point = (offset: number): [Node, number] => {
    let remaining = offset;
    for (let index = 0; index < root.childNodes.length; index++) {
      const node = root.childNodes[index];
      const length = readDocument(node).units.length;
      if (node.nodeType === Node.TEXT_NODE && remaining <= length) return [node, remaining];
      if (remaining === 0) return [root, index];
      remaining -= length;
      if (remaining <= 0) return [root, index + 1];
    }
    return [root, root.childNodes.length - 1];
  };
  const range = document.createRange();
  const [startNode, startAt] = point(offsets.start), [endNode, endAt] = point(offsets.end);
  range.setStart(startNode, startAt); range.setEnd(endNode, endAt);
  const selection = window.getSelection(); selection?.removeAllRanges(); selection?.addRange(range);
}
