import { X } from "lucide-react";
import type { ApiKeyView } from "@/features/api-key-management/hook/use-api-key-management";
import {
  AppDialog,
  AppDialogActionButton,
  AppDialogCancelButton,
  AppDialogClose,
  AppDialogContent,
  AppDialogDangerButton,
  AppDialogDescription,
  AppDialogFooter,
  AppDialogIconButton,
  AppDialogTitle,
} from "@/shared/ui/app-dialog";
import { AppInput } from "@/shared/ui/app-input";
import { AppLabel } from "@/shared/ui/app-form-control";
import { useTranslations } from "next-intl";

type ApiKeyEditModalProps = {
  open: boolean;
  apiKey: ApiKeyView | null;
  label: string;
  error: string | null;
  isSaving: boolean;
  isRevoking: boolean;
  onLabelChange: (value: string) => void;
  onClose: () => void;
  onSave: () => void;
  onRevoke: () => void;
};

export function ApiKeyEditModal({
  open,
  apiKey,
  label,
  error,
  isSaving,
  isRevoking,
  onLabelChange,
  onClose,
  onSave,
  onRevoke,
}: ApiKeyEditModalProps) {
  const t = useTranslations("apiKey.modal");

  if (!apiKey) return null;

  return (
    <AppDialog
      open={open}
      onOpenChange={(nextOpen) => (!nextOpen ? onClose() : undefined)}
    >
      <AppDialogContent size="sm">
        <div className="flex items-start justify-between gap-4">
          <div>
            <AppDialogDescription>
              {t("editTitle")}
            </AppDialogDescription>
            <AppDialogTitle>
              {apiKey.label}
            </AppDialogTitle>
            <p className="mt-2 rounded-xl border border-white/10 bg-black/28 px-3 py-2 font-mono text-xs text-white/44">
              {apiKey.maskedKey}
            </p>
          </div>
          <AppDialogClose asChild>
            <AppDialogIconButton
              type="button"
              aria-label={t("close")}
            >
              <X className="h-4 w-4" />
            </AppDialogIconButton>
          </AppDialogClose>
        </div>
        <div className="mt-6 space-y-3">
          <AppLabel className="text-xs font-semibold text-white/52">
            {t("keyLabel")}
          </AppLabel>
          <AppInput
            type="text"
            value={label}
            onChange={(event) => onLabelChange(event.target.value)}
            className="h-14 w-full rounded-[1.25rem] border-white/10 bg-black/40 px-4 text-sm text-white focus-visible:border-primary focus-visible:ring-0"
          />
          {error ? <p className="text-xs text-red-300">{error}</p> : null}
        </div>
        <AppDialogFooter className="justify-between">
          <AppDialogDangerButton
            type="button"
            onClick={onRevoke}
            disabled={apiKey.status === "revoked" || isRevoking}
            className="sm:mr-auto"
          >
            {apiKey.status === "revoked"
              ? t("revoked")
              : isRevoking
                ? t("revoking")
                : t("revoke")}
          </AppDialogDangerButton>
          <div className="flex gap-2">
            <AppDialogClose asChild>
              <AppDialogCancelButton
                type="button"
              >
                {t("cancel")}
              </AppDialogCancelButton>
            </AppDialogClose>
            <AppDialogActionButton
              type="button"
              onClick={onSave}
              disabled={isSaving}
            >
              {isSaving ? t("saving") : t("save")}
            </AppDialogActionButton>
          </div>
        </AppDialogFooter>
      </AppDialogContent>
    </AppDialog>
  );
}
