"use client";
import { useId, type RefObject } from "react";
import { useTranslations } from "next-intl";
import type { PlatformPermission } from "@/shared/api/platform-permissions";
import { AppDialog, AppDialogContent, AppDialogTitle, AppDialogDescription, AppDialogFooter, AppDialogActionButton, AppDialogCancelButton } from "@/shared/ui/app-dialog";
import { AppInput } from "@/shared/ui/app-input";
import { AppLabel } from "@/shared/ui/app-form-control";
import { ApiKeyPermissionSelect } from "./api-key-permission-select";

export interface ApiKeyIssueModalProps {
  open: boolean;
  finalFocus?: RefObject<HTMLElement | null>;
  label: string;
  onLabelChange: (value: string) => void;
  permissions: PlatformPermission[];
  onPermissionsChange: (value: PlatformPermission[]) => void;
  error: string | null;
  isIssuing: boolean;
  onGenerate: () => void;
  onClose: () => void;
  pendingKey: { label: string; apiKey: string } | null;
  copied: boolean;
  copyError: string | null;
  onCopy: () => void;
}
export function ApiKeyIssueModal(props: ApiKeyIssueModalProps) {
  const t = useTranslations("apiKey.issue");
  const tPending = useTranslations("apiKey.pending");
  const tModal = useTranslations("apiKey.modal");
  const id = useId();
  return (
    <AppDialog open={props.open} onOpenChange={(open) => { if (!open) props.onClose(); }}>
      <AppDialogContent size="sm" showCloseButton={!props.isIssuing} finalFocus={props.finalFocus}>
        <AppDialogTitle>{t(props.pendingKey ? "createdTitle" : "title")}</AppDialogTitle>
        <AppDialogDescription>{props.pendingKey ? tPending("note") : t("description")}</AppDialogDescription>
        {props.pendingKey ? (
          <>
            <div className="space-y-3">
              <p className="text-sm font-medium">{props.pendingKey.label}</p>
              <AppLabel htmlFor={id + "-key"}>{t("key")}</AppLabel>
              <AppInput id={id + "-key"} readOnly value={props.pendingKey.apiKey}
                onFocus={(event) => event.currentTarget.select()} className="font-mono text-xs" />
              {props.copyError ? <p role="alert" className="text-sm text-destructive">{props.copyError}</p> : null}
              {props.copied ? <p role="status" className="text-sm text-muted-foreground">{tPending("copied")}</p> : null}
            </div>
            <AppDialogFooter>
              <AppDialogCancelButton type="button" onClick={props.onClose}>{t("done")}</AppDialogCancelButton>
              <AppDialogActionButton type="button" onClick={props.onCopy}>{tPending("copy")}</AppDialogActionButton>
            </AppDialogFooter>
          </>
        ) : (
          <form onSubmit={(event) => { event.preventDefault(); props.onGenerate(); }} className="space-y-5">
            <div className="space-y-2">
              <AppLabel htmlFor={id + "-label"}>{tModal("keyLabel")}</AppLabel>
              <AppInput id={id + "-label"} autoFocus maxLength={80} value={props.label}
                onChange={(event) => props.onLabelChange(event.target.value)} placeholder={t("placeholder")} disabled={props.isIssuing} />
            </div>
            <ApiKeyPermissionSelect permissions={props.permissions} onChange={props.onPermissionsChange} disabled={props.isIssuing} />
            {props.error ? <p role="alert" className="text-sm text-destructive">{props.error}</p> : null}
            <AppDialogFooter>
              <AppDialogCancelButton type="button" onClick={props.onClose} disabled={props.isIssuing}>{tModal("cancel")}</AppDialogCancelButton>
              <AppDialogActionButton type="submit" disabled={props.isIssuing}>{t(props.isIssuing ? "creating" : "create")}</AppDialogActionButton>
            </AppDialogFooter>
          </form>
        )}
      </AppDialogContent>
    </AppDialog>
  );
}
