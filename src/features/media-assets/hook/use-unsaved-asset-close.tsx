"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { AppConfirmDialog, AppConfirmDialogContent, AppConfirmDialogHeader, AppConfirmDialogTitle, AppConfirmDialogDescription, AppConfirmDialogFooter, AppConfirmDialogCancel, AppConfirmDialogAction } from "@/shared/ui/app-confirm-dialog";

/** Protect local metadata drafts without treating immediate star writes as dirty. */
export function useUnsavedAssetClose(onClose: () => void, busy: boolean) {
  const t = useTranslations("assets");
  const [dirty, setDirty] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const requestClose = () => {
    if (busy || confirm) return;
    if (dirty) setConfirm(true);
    else onClose();
  };
  const confirmation = <AppConfirmDialog open={confirm} onOpenChange={setConfirm}>
    <AppConfirmDialogContent className="z-[10100]">
      <AppConfirmDialogHeader><AppConfirmDialogTitle>{t("unsavedTitle")}</AppConfirmDialogTitle><AppConfirmDialogDescription>{t("unsavedDescription")}</AppConfirmDialogDescription></AppConfirmDialogHeader>
      <AppConfirmDialogFooter><AppConfirmDialogCancel>{t("keepEditing")}</AppConfirmDialogCancel><AppConfirmDialogAction variant="danger" onClick={() => { setConfirm(false); onClose(); }}>{t("discardChanges")}</AppConfirmDialogAction></AppConfirmDialogFooter>
    </AppConfirmDialogContent>
  </AppConfirmDialog>;
  return { setDirty, requestClose, confirmation };
}
