"use client";
import { GenerationComposerLayout } from "@/shared/ui/generation-media-rail";
import { useState, type ReactNode, type ClipboardEvent, type DragEvent } from "react";
import { useLocale } from "next-intl";
import { AppPromptMessage } from "./app-prompt-message";
import { fileInputAccepts, isFileDrag, normalizeDroppedMediaFile } from "@/shared/media-assets/media-file-drop";
import {
  AppPromptField,
  AppPromptSurface,
} from "@/shared/ui/app-prompt-surface";

interface GenerationPromptFieldProps {
  mediaSelector?: ReactNode;
  textarea: ReactNode;
  attachments?: ReactNode;
  header?: ReactNode;
  feedback?: ReactNode;
  footer?: ReactNode;
  footerLeft?: ReactNode;
  footerRight?: ReactNode;
  promptMeta?: ReactNode;
  contentWrapper?: (children: ReactNode) => ReactNode;
  className?: string;
  ariaLabel?: string;
  testId?: string;
  surface?: "default" | "hero";
}

interface GenerationPromptSurfaceProps {
  className?: string;
  textarea: ReactNode;
  attachments?: ReactNode;
  header?: ReactNode;
  feedback?: ReactNode;
  footer?: ReactNode;
  footerLeft?: ReactNode;
  footerRight?: ReactNode;
}

export function GenerationPromptSurface({
  className,
  textarea,
  attachments,
  header,
  feedback,
  footer,
  footerLeft,
  footerRight,
}: GenerationPromptSurfaceProps) {
  const attachmentsInput = usePromptFileAttachments();
  return (
    <div style={{ display: "contents" }} onPasteCapture={attachmentsInput.onPasteCapture}>
    <AppPromptSurface
      className={className}
      textarea={textarea}
      attachments={attachments}
      header={header}
      feedback={attachmentsInput.error ? <>{feedback}{attachmentsInput.error}</> : feedback}
      footer={footer}
      footerLeft={footerLeft}
      footerRight={footerRight}
    />
    </div>
  );
}

export function GenerationPromptField({
  mediaSelector,
  textarea,
  attachments,
  header,
  feedback,
  footer,
  footerLeft,
  footerRight,
  promptMeta,
  contentWrapper,
  className,
  ariaLabel,
  testId,
  surface,
}: GenerationPromptFieldProps) {
  const attachmentsInput = usePromptFileAttachments();
  return (
    <GenerationComposerLayout rail={mediaSelector}>
      <div style={{ display: "contents" }} {...attachmentsInput.handlers}>
      <AppPromptField
        bounded
        textarea={textarea}
        attachments={attachments}
        header={header}
        feedback={attachmentsInput.error ? <>{feedback}{attachmentsInput.error}</> : feedback}
        footer={footer}
        footerLeft={footerLeft}
        footerRight={footerRight}
        promptMeta={promptMeta}
        contentWrapper={contentWrapper}
        className={className}
        ariaLabel={ariaLabel}
        testId={testId}
        surface={surface}
      />
      </div>
    </GenerationComposerLayout>
  );
}

/** Paste and drop use the same file picker, so model/count/upload guards stay shared. */
function usePromptFileAttachments() {
  const ko = useLocale() === "ko";
  const [message, setMessage] = useState<string | null>(null);
  const attach = (container: HTMLElement, original: File[]) => {
    const files = original.map(normalizeDroppedMediaFile);
    const input = files.length && files.every((file): file is File => file !== null)
      ? Array.from(container.querySelectorAll<HTMLInputElement>("input[type=file]:not(:disabled):not([data-paired-file-slot])"))
        .find(candidate => files.every(file => fileInputAccepts(candidate, file))) : undefined;
    if (!input) { setMessage(ko ? "현재 모델이 지원하는 파일만 첨부할 수 있습니다." : "Attach a file supported by the current model."); return; }
    if (!input.multiple && files.length > 1) {
      setMessage(ko ? "이 입력에는 한 번에 파일 한 개만 첨부할 수 있습니다." : "This input accepts one file at a time."); return;
    }
    setMessage(null);
    const transfer = new DataTransfer();
    for (const file of files as File[]) transfer.items.add(file);
    input.files = transfer.files;
    input.dispatchEvent(new Event("change", { bubbles: true }));
  };
  const onPasteCapture = (event: ClipboardEvent<HTMLDivElement>) => {
    const files = Array.from(event.clipboardData.files ?? []);
    if (!files.length) for (const item of Array.from(event.clipboardData.items ?? [])) {
      if (item.kind === "file") { const file = item.getAsFile(); if (file) files.push(file); }
    }
    if (!files.length || !(event.target instanceof Element)) return;
    const editor = event.target.closest("textarea, [data-app-prompt-editor]");
    if (!editor) return;
    event.preventDefault(); event.stopPropagation();
    if (editor instanceof HTMLTextAreaElement ? editor.disabled || editor.readOnly : editor.getAttribute("contenteditable") !== "true") return;
    // A copied URL/HTML/video frame is not a clipboard media file.
    if (files.some(file => !/^(image|video)\//.test(file.type))) {
      setMessage(ko ? "이미지 또는 영상 파일을 붙여넣어 주세요." : "Paste an image or video file."); return;
    }
    attach(event.currentTarget, files);
  };
  const handlers = {
    onPasteCapture,
    onDragOverCapture: (event: DragEvent<HTMLDivElement>) => {
      if (!isFileDrag(event.dataTransfer)) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = event.currentTarget.querySelector("input[type=file]:not(:disabled)") ? "copy" : "none";
    },
    onDropCapture: (event: DragEvent<HTMLDivElement>) => {
      if (!isFileDrag(event.dataTransfer)) return;
      event.preventDefault(); event.stopPropagation();
      attach(event.currentTarget, Array.from(event.dataTransfer.files));
    },
  };
  return { handlers, onPasteCapture, error: message ? <AppPromptMessage>{message}</AppPromptMessage> : null };
}
