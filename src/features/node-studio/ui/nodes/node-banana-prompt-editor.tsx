"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";

import {
  AppDialog,
  AppDialogActionButton,
  AppDialogCancelButton,
  AppDialogContent,
  AppDialogFooter,
  AppDialogHeader,
  AppDialogTitle,
} from "@/shared/ui/app-dialog";

const FONT_SIZE_STORAGE_KEY = "prompt-editor-font-size";
const FONT_SIZES = [10, 12, 14, 16, 18, 20, 24] as const;

function initialFontSize() {
  if (typeof window === "undefined") return 14;
  const saved = Number(window.localStorage.getItem(FONT_SIZE_STORAGE_KEY));
  return FONT_SIZES.includes(saved as (typeof FONT_SIZES)[number]) ? saved : 14;
}

export function NodeBananaPromptEditor({
  open,
  initialPrompt,
  onClose,
  onSubmit,
}: {
  open: boolean;
  initialPrompt: string;
  onClose: () => void;
  onSubmit: (prompt: string) => void;
}) {
  const t = useTranslations("nodeStudio.host");
  const [draftState, setDraftState] = useState({ source: initialPrompt, value: initialPrompt });
  const [fontSize, setFontSize] = useState(initialFontSize);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const draft = draftState.source === initialPrompt ? draftState.value : initialPrompt;
  const dirty = draft !== initialPrompt;

  const close = () => {
    if (dirty) {
      setConfirmDiscard(true);
      return;
    }
    onClose();
  };
  const submit = () => {
    onSubmit(draft);
    setConfirmDiscard(false);
    onClose();
  };

  return (
    <AppDialog open={open} onOpenChange={(next, details) => { if (!next) { if (dirty) details.cancel(); close(); } }}>
      <AppDialogContent
        size="md"
        surface="editor"
        padding="none"
        className="flex h-[85vh] max-h-[85vh] flex-col"
        aria-label={t("editPrompt")}
        aria-describedby={undefined}
        data-node-banana-component="PromptEditorModal"
      >
        <AppDialogHeader className="px-6 pb-4 pt-6">
          <AppDialogTitle className="m-0 text-xl">{t("editPrompt")}</AppDialogTitle>
        </AppDialogHeader>

        <div className="mx-6 mb-4 flex min-h-0 flex-1 flex-col overflow-hidden rounded border border-neutral-700 bg-neutral-900/30">
          <div className="flex h-12 shrink-0 items-center gap-3 border-b border-neutral-700 bg-neutral-900 px-4">
            <label className="sr-only" htmlFor="node-banana-prompt-font-size">{t("fontSize")}</label>
            <select
              id="node-banana-prompt-font-size"
              value={fontSize}
              className="rounded border border-neutral-700 bg-neutral-900/50 px-2 py-1 text-sm text-neutral-300 outline-none focus:ring-1 focus:ring-neutral-600"
              onChange={(event) => {
                const next = Number(event.target.value);
                setFontSize(next);
                window.localStorage.setItem(FONT_SIZE_STORAGE_KEY, String(next));
              }}
            >
              {FONT_SIZES.map((size) => <option key={size} value={size}>{size}px</option>)}
            </select>
          </div>
          <textarea
            autoFocus
            value={draft}
            maxLength={20_000}
            placeholder={t("promptPlaceholder")}
            aria-label={t("prompt")}
            className="nodrag nopan nowheel min-h-0 flex-1 resize-none border-0 bg-transparent p-6 leading-relaxed text-neutral-100 outline-none placeholder:text-neutral-500"
            style={{ fontSize }}
            onChange={(event) => setDraftState({ source: initialPrompt, value: event.target.value })}
          />
        </div>

        <AppDialogFooter className="m-0 px-6 pb-6">
          <AppDialogCancelButton type="button" onClick={close}>{t("cancel")}</AppDialogCancelButton>
          <AppDialogActionButton type="button" onClick={submit}>{t("submit")}</AppDialogActionButton>
        </AppDialogFooter>

        {confirmDiscard ? (
          <div className="absolute inset-0 z-10 flex items-center justify-center rounded-xl bg-black/60">
            <section className="relative mx-4 w-full max-w-sm rounded-lg border border-neutral-600 bg-neutral-800 p-6 shadow-xl" role="alertdialog" aria-modal="true" aria-label={t("unsavedTitle")}>
              <p className="mb-6 text-center text-neutral-100">{t("unsaved")}</p>
              <div className="flex justify-center gap-3">
                <AppDialogCancelButton type="button" onClick={() => setConfirmDiscard(false)}>{t("cancel")}</AppDialogCancelButton>
                <AppDialogCancelButton type="button" onClick={() => { setConfirmDiscard(false); onClose(); }}>{t("discard")}</AppDialogCancelButton>
                <AppDialogActionButton type="button" onClick={submit}>{t("submit")}</AppDialogActionButton>
              </div>
            </section>
          </div>
        ) : null}
      </AppDialogContent>
    </AppDialog>
  );
}
