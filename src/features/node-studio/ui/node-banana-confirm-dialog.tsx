"use client";

import { useTranslations } from "next-intl";
import {
  AppDialog, AppDialogContent, AppDialogHeading, AppDialogTitle,
  AppDialogDescription, AppDialogFooter, AppDialogCancelButton,
  AppDialogActionButton, AppDialogDangerButton,
} from "@/shared/ui/app-dialog";

type NodeBananaConfirmDialogProps = {
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  cancelLabel?: string;
  danger?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
};

export function NodeBananaConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  cancelLabel,
  danger = false,
  onCancel,
  onConfirm,
}: NodeBananaConfirmDialogProps) {
  const t = useTranslations("nodeStudio.host");
  return (
    <AppDialog open={open} onOpenChange={(nextOpen) => { if (!nextOpen) onCancel(); }}>
      <AppDialogContent size="sm" surface="canvas" role="alertdialog" showCloseButton={false}>
        <AppDialogHeading>
          <AppDialogTitle>{title}</AppDialogTitle>
          <AppDialogDescription>{description}</AppDialogDescription>
        </AppDialogHeading>
        <AppDialogFooter>
          <AppDialogCancelButton type="button" onClick={onCancel}>{cancelLabel ?? t("cancel")}</AppDialogCancelButton>
          {danger
            ? <AppDialogDangerButton type="button" onClick={onConfirm}>{confirmLabel}</AppDialogDangerButton>
            : <AppDialogActionButton type="button" onClick={onConfirm}>{confirmLabel}</AppDialogActionButton>}
        </AppDialogFooter>
      </AppDialogContent>
    </AppDialog>
  );
}
