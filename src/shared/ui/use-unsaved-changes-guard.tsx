"use client";

import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { AppConfirmDialog, AppConfirmDialogContent, AppConfirmDialogHeader, AppConfirmDialogTitle, AppConfirmDialogDescription, AppConfirmDialogFooter, AppConfirmDialogCancel, AppConfirmDialogAction } from "./app-confirm-dialog";

/** One exit path for close, navigation and other actions that discard a draft. */
export function useUnsavedChangesGuard(onClose: () => void, busy: boolean) {
  const t = useTranslations("assets");
  const [dirty, setDirty] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const confirming = useRef(false);
  const pending = useRef<(() => void) | null>(null);
  const finish = () => {
    const action = pending.current;
    pending.current = null;
    setDirty(false);
    if (action) action(); else onClose();
  };
  const requestAction = (action: (() => void) | null) => {
    if (busy || confirm || confirming.current) return;
    pending.current = action;
    if (dirty) { confirming.current = true; setConfirm(true); }
    else finish();
  };
  const requestClose = () => requestAction(null);
  const confirmation = <AppConfirmDialog open={confirm} onOpenChange={open => {
    if (busy) return;
    confirming.current = open; setConfirm(open);
    if (!open) pending.current = null;
  }}>
    <AppConfirmDialogContent className="z-[10100]" overlayClassName="z-[10099]" onKeyDownCapture={event => {
      if (event.key !== "Escape" || event.nativeEvent.isComposing || event.keyCode === 229) return;
      event.preventDefault(); event.stopPropagation();
      if (busy) return;
      pending.current = null; confirming.current = false; setConfirm(false);
    }}>
      <AppConfirmDialogHeader><AppConfirmDialogTitle>{t("unsavedTitle")}</AppConfirmDialogTitle><AppConfirmDialogDescription>{t("unsavedDescription")}</AppConfirmDialogDescription></AppConfirmDialogHeader>
      <AppConfirmDialogFooter>
        <AppConfirmDialogCancel disabled={busy}>{t("keepEditing")}</AppConfirmDialogCancel>
        <AppConfirmDialogAction variant="danger" disabled={busy} onClick={event => {
          if (busy) { event.preventDefault(); return; }
          confirming.current = false; setConfirm(false); finish();
        }}>{t("discardChanges")}</AppConfirmDialogAction>
      </AppConfirmDialogFooter>
    </AppConfirmDialogContent>
  </AppConfirmDialog>;
  return { setDirty, requestClose, requestAction, confirmation, confirming: confirm };
}
