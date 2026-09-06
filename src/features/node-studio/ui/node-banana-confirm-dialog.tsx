"use client";

import { useTranslations } from "next-intl";
import { useId } from "react";

import styles from "./node-banana-studio.module.css";

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
  const titleId = useId();
  const descriptionId = useId();

  if (!open) return null;

  return (
    <div
      className={`${styles.dialogHost} node-banana-hosted__modal-backdrop`}
      role="presentation"
      onMouseDown={onCancel}
    >
      <section
        className="node-banana-hosted__dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header>
          <h2 id={titleId}>{title}</h2>
          <button type="button" onClick={onCancel} aria-label={t("close")}>×</button>
        </header>
        <p id={descriptionId}>{description}</p>
        <footer>
          <button type="button" onClick={onCancel}>{cancelLabel ?? t("cancel")}</button>
          <button
            type="button"
            data-variant={danger ? "danger" : "primary"}
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </footer>
      </section>
    </div>
  );
}
