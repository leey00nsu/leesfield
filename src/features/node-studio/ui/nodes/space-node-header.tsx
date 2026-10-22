"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { ChevronLeft, ChevronRight, Maximize2, MessageCircle, Play } from "lucide-react";
import { useCanvasTranslation } from "@/shared/i18n/use-canvas-translation";
import { cn } from "@/shared/lib/utils";
import { AppButton } from "@/shared/ui/app-button";
import { AppInput } from "@/shared/ui/app-input";
import { AppTextarea } from "@/shared/ui/app-form-control";
import styles from "./space-node-frame.module.css";

export interface SpaceNodeCommentNavigation {
  currentIndex: number;
  totalCount: number;
  onPrevious: () => void;
  onNext: () => void;
}

export interface SpaceNodeHeaderProps {
  id: string;
  title: string;
  customTitle?: string;
  comment?: string;
  selected?: boolean;
  hovered?: boolean;
  writable?: boolean;
  executing?: boolean;
  supportsOptionalInput?: boolean;
  optional?: boolean;
  onOptionalChange?: (optional: boolean) => void;
  onCustomTitleChange?: (title: string) => void;
  onCommentChange?: (comment: string) => void;
  onExpand?: () => void;
  onBrowse?: () => void;
  onRun?: () => void;
  onCancel?: () => void;
  runReady?: boolean;
  runDisabledReason?: string | null;
  headerButtons?: ReactNode;
  alwaysVisibleButtons?: ReactNode;
  commentNavigation?: SpaceNodeCommentNavigation;
  focusedComment?: boolean;
  onCommentViewed?: () => void;
}

/** Action availability comes from capabilities/callbacks, never a model or node-name list. */
export function SpaceNodeHeader({
  id, title, customTitle = "", comment = "", selected = false, hovered = false,
  writable = true, executing = false, supportsOptionalInput = false, optional = false,
  onOptionalChange, onCustomTitleChange, onCommentChange, onExpand, onBrowse, onRun,
  onCancel, runReady = true, runDisabledReason, headerButtons, alwaysVisibleButtons,
  commentNavigation, focusedComment = false, onCommentViewed,
}: SpaceNodeHeaderProps) {
  const tc = useCanvasTranslation();
  const commentId = useId();
  const titleButton = useRef<HTMLButtonElement>(null);
  const titleInput = useRef<HTMLInputElement>(null);
  const commentButton = useRef<HTMLButtonElement>(null);
  const commentEditor = useRef<HTMLDivElement>(null);
  const commentInput = useRef<HTMLTextAreaElement>(null);
  const titleActive = useRef(false);
  const restoreTitleFocus = useRef(false);
  const commentActive = useRef(false);
  const [titleDraft, setTitleDraft] = useState<string | null>(null);
  const [commentDraft, setCommentDraft] = useState<string | null>(null);
  const [headerHovered, setHeaderHovered] = useState(false);
  const [commentHovered, setCommentHovered] = useState(false);
  const [anchor, setAnchor] = useState<{ top: number; bottom: number; left: number; host: HTMLElement } | null>(null);
  const editingTitle = titleDraft !== null;
  const editingComment = commentDraft !== null;
  const showComment = Boolean(comment && !editingComment && (focusedComment || commentHovered));
  const needsAnchor = editingComment || showComment;
  const commentMounted = editingComment && Boolean(anchor);
  const controlsVisible = selected || hovered || headerHovered || editingTitle || editingComment || focusedComment;

  useLayoutEffect(() => {
    if (!editingTitle) {
      if (restoreTitleFocus.current) titleButton.current?.focus({ preventScroll: true });
      restoreTitleFocus.current = false;
      return;
    }
    titleInput.current?.focus();
    titleInput.current?.select();
  }, [editingTitle]);

  // Only an open comment follows the viewport. Hover never touches graph state.
  useEffect(() => {
    if (!needsAnchor) return;
    const button = commentButton.current;
    const view = button?.ownerDocument.defaultView;
    if (!button || !view) return;
    let frame: number;
    const update = () => {
      const rect = button.getBoundingClientRect();
      setAnchor(previous => previous?.top === rect.top && previous.bottom === rect.bottom && previous.left === rect.right
        ? previous : { top: rect.top, bottom: rect.bottom, left: rect.right, host: button.ownerDocument.body });
      frame = view.requestAnimationFrame(update);
    };
    frame = view.requestAnimationFrame(update);
    return () => view.cancelAnimationFrame(frame);
  }, [needsAnchor]);

  const closeTitle = (save: boolean, restoreFocus = false) => {
    if (!titleActive.current) return;
    titleActive.current = false;
    const next = titleDraft?.trim() ?? "";
    if (save && writable && next !== customTitle) onCustomTitleChange?.(next);
    restoreTitleFocus.current = restoreFocus;
    setTitleDraft(null);
  };
  const closeComment = (save: boolean, restoreFocus = true) => {
    if (!commentActive.current) return;
    commentActive.current = false;
    const next = commentDraft?.trim() ?? "";
    if (save && writable && next !== comment) onCommentChange?.(next);
    setCommentDraft(null);
    if (restoreFocus) commentButton.current?.focus({ preventScroll: true });
  };

  useLayoutEffect(() => { if (commentMounted) commentInput.current?.focus(); }, [commentMounted]);
  useEffect(() => {
    if (!editingComment) return;
    const owner = commentButton.current?.ownerDocument;
    const onOutside = (event: MouseEvent) => {
      if (!commentEditor.current?.contains(event.target as Node) && !commentButton.current?.contains(event.target as Node)) {
        closeComment(true, false);
      }
    };
    owner?.addEventListener("mousedown", onOutside);
    return () => owner?.removeEventListener("mousedown", onOutside);
  });

  const unavailable = !writable ? tc("This workflow is read-only.")
    : executing ? tc("This node is currently running.")
      : !runReady ? tc(runDisabledReason || "This node is not ready to run.") : null;
  const runLabel = unavailable ? `${tc("Run node unavailable:")} ${unavailable}` : tc("Run this node");
  const actionClass = cn(styles.action, "nodrag nopan");

  return <div className={styles.header} data-space-node-header={id} data-controls-visible={controlsVisible}
    data-selected={selected} data-writable={writable}
    onMouseEnter={() => setHeaderHovered(true)} onMouseLeave={() => setHeaderHovered(false)}>
    <div className={styles.headerInner}>
      <div className={styles.titleSection}>
        {editingTitle ? <AppInput ref={titleInput} value={titleDraft} disabled={!writable}
          className={cn(styles.titleInput, "nodrag nopan nowheel")} surface="transparent"
          aria-label={tc("Custom title...")} placeholder={tc("Custom title...")}
          onChange={event => setTitleDraft(event.target.value)}
          onBlur={() => closeTitle(true)}
          onKeyDown={event => {
            event.stopPropagation();
            if (event.nativeEvent.isComposing || event.keyCode === 229) return;
            if (event.key === "Enter" || event.key === "Escape") {
              event.preventDefault(); closeTitle(event.key === "Enter", true);
            }
          }} /> : <AppButton ref={titleButton} type="button" variant="ghost"
          className={cn(styles.title, "nodrag nopan")}
          aria-label={tc("Click to edit title")} title={tc("Click to edit title")}
          aria-disabled={!writable || !onCustomTitleChange}
          onClick={() => {
            if (!writable || !onCustomTitleChange) return;
            titleActive.current = true; setTitleDraft(customTitle);
          }}>
          {customTitle ? `${customTitle} - ${tc(title)}` : tc(title)}
        </AppButton>}
      </div>
      <div className={styles.controlsWrapper}>
        {alwaysVisibleButtons && <div className={cn(styles.buttonGroup, "nodrag nopan")}>{alwaysVisibleButtons}</div>}
        <div className={cn(styles.controls, "nodrag nopan")}>
          {onBrowse && <AppButton type="button" variant="ghost" className={cn(actionClass, styles.textAction)}
            disabled={!writable} aria-label={tc("Browse models")} title={tc("Browse models")}
            onClick={onBrowse}>{tc("Browse")}</AppButton>}
          {supportsOptionalInput && <AppButton type="button" variant="ghost"
            className={cn(actionClass, styles.textAction, styles.optional)} data-optional={optional}
            disabled={!writable || !onOptionalChange} aria-pressed={optional}
            title={tc(optional ? "This input is optional" : "Mark input as optional")}
            onClick={() => onOptionalChange?.(!optional)}>{tc(optional ? "Optional" : "Required")}</AppButton>}
          {headerButtons}
          {executing && onCancel && <AppButton type="button" variant="ghost" className={cn(actionClass, styles.textAction)}
            disabled={!writable} aria-label={tc("Cancel operation")} title={tc("Cancel operation")}
            onClick={onCancel}>{tc("Cancel")}</AppButton>}
          {(onCommentChange || comment) && <AppButton ref={commentButton} type="button" variant="ghost"
            className={cn(actionClass, styles.commentAction)} data-has-comment={Boolean(comment)}
            aria-label={tc(comment ? "Edit comment" : "Add comment")} title={tc(comment ? "Edit comment" : "Add comment")}
            aria-expanded={editingComment} aria-controls={editingComment ? commentId : undefined}
            aria-describedby={showComment ? commentId : undefined} aria-disabled={!writable || !onCommentChange}
            onMouseEnter={() => { setCommentHovered(true); if (comment) onCommentViewed?.(); }} onMouseLeave={() => setCommentHovered(false)}
            onFocus={() => { setCommentHovered(true); if (comment) onCommentViewed?.(); }} onBlur={() => setCommentHovered(false)}
            onClick={() => {
              if (!writable || !onCommentChange) return;
              if (editingComment) closeComment(true);
              else { commentActive.current = true; setCommentDraft(comment); }
            }}><MessageCircle size={14} aria-hidden="true" fill={comment ? "currentColor" : "none"} /></AppButton>}
          {onExpand && <AppButton type="button" variant="ghost" className={cn(actionClass, styles.expandingAction)}
            aria-label={tc("Expand editor")} title={tc("Expand editor")} onClick={onExpand}>
            <Maximize2 size={14} aria-hidden="true" /><span>{tc("Expand")}</span>
          </AppButton>}
          {onRun && <AppButton type="button" variant="ghost" className={cn(actionClass, styles.expandingAction, styles.runAction)}
            disabled={Boolean(unavailable)} aria-label={runLabel} title={runLabel} data-canvas-action="run" onClick={onRun}>
            <Play size={14} fill="currentColor" aria-hidden="true" /><span>{tc("Run node")}</span>
          </AppButton>}
        </div>
      </div>
    </div>
    {needsAnchor && anchor && createPortal(editingComment ? <div ref={commentEditor}
      id={commentId} role="dialog" aria-label={tc("Edit comment")} className={cn(styles.commentEditor, "nodrag nopan nowheel")}
      style={{ top: anchor.bottom + 4, left: anchor.left }}
      onKeyDown={event => {
        event.stopPropagation();
        if (event.nativeEvent.isComposing || event.keyCode === 229) return;
        if (event.key === "Escape") { event.preventDefault(); closeComment(false); }
        else if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) { event.preventDefault(); closeComment(true); }
      }}>
      <AppTextarea ref={commentInput} value={commentDraft ?? ""} disabled={!writable}
        aria-label={tc("Add a comment...")} placeholder={tc("Add a comment...")}
        className={cn(styles.commentInput, "nodrag nopan nowheel")} onChange={event => setCommentDraft(event.target.value)} />
      <div className={styles.commentActions}>
        <AppButton type="button" variant="ghost" className={styles.dialogAction} onClick={() => closeComment(false)}>{tc("Cancel")}</AppButton>
        <AppButton type="button" className={styles.dialogAction} disabled={!writable} onClick={() => closeComment(true)}>{tc("Save")}</AppButton>
      </div>
    </div> : <div id={commentId} role={focusedComment && commentNavigation ? "group" : "tooltip"}
      aria-label={tc("Comment")} className={cn(styles.commentTooltip, "nodrag nopan nowheel")}
      style={{ top: anchor.top - 8, left: anchor.left }}>
      {focusedComment && commentNavigation && <div className={styles.commentNavigation}>
        <AppButton type="button" variant="ghost" className={styles.navigationAction} aria-label={tc("Previous comment")}
          data-canvas-action="previous-comment" onClick={commentNavigation.onPrevious}><ChevronLeft size={16} aria-hidden="true" /></AppButton>
        <span>{commentNavigation.currentIndex}/{commentNavigation.totalCount}</span>
        <AppButton type="button" variant="ghost" className={styles.navigationAction} aria-label={tc("Next comment")}
          data-canvas-action="next-comment" onClick={commentNavigation.onNext}><ChevronRight size={16} aria-hidden="true" /></AppButton>
      </div>}
      <div>{comment}</div>
    </div>, anchor.host)}
  </div>;
}
