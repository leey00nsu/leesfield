import { X } from "lucide-react";
import type { ApiKeyView } from "@/features/api-key-management/hook/use-api-key-management";
import { cn } from "@/shared/lib/utils";
import { AppButton } from "@/shared/ui/app-button";
import {
  AppDialog,
  AppDialogClose,
  AppDialogContent,
  AppDialogDescription,
  AppDialogTitle,
} from "@/shared/ui/app-dialog";
import { AppInput, AppLabel } from "@/shared/ui/app-form-control";
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
      <AppDialogContent className="w-[calc(100%-2rem)] max-w-xl rounded-2xl border-white/10 bg-surface-dark p-6 shadow-2xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <AppDialogDescription className="text-xs font-mono uppercase tracking-widest text-gray-500">
              {t("editTitle")}
            </AppDialogDescription>
            <AppDialogTitle className="mt-2 text-xl font-bold text-white">
              {apiKey.label}
            </AppDialogTitle>
            <p className="mt-1 text-xs font-mono text-gray-500">
              {apiKey.maskedKey}
            </p>
          </div>
          <AppDialogClose asChild>
            <AppButton
              type="button"
              variant="ghost"
              className="rounded-lg border border-white/10 p-2 text-gray-400 transition-colors hover:border-white/30 hover:text-white"
              aria-label={t("close")}
            >
              <X className="h-4 w-4" />
            </AppButton>
          </AppDialogClose>
        </div>
        <div className="mt-6 space-y-3">
          <AppLabel className="text-xs font-mono uppercase tracking-widest text-gray-500">
            {t("keyLabel")}
          </AppLabel>
          <AppInput
            type="text"
            value={label}
            onChange={(event) => onLabelChange(event.target.value)}
            className="h-11 w-full rounded-xl border-white/10 bg-black/40 px-4 text-sm text-white focus-visible:ring-0 focus-visible:border-primary"
          />
          {error ? <p className="text-xs text-red-300">{error}</p> : null}
        </div>
        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <AppButton
            type="button"
            onClick={onRevoke}
            disabled={apiKey.status === "revoked" || isRevoking}
            variant="danger"
            className={cn(
              "flex h-10 items-center justify-center rounded-full border border-red-500 px-6 text-xs font-bold uppercase tracking-wider text-white",
              "bg-red-500 transition-colors hover:bg-red-500 hover:text-white",
              "disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:bg-red-500",
            )}
          >
            {apiKey.status === "revoked"
              ? t("revoked")
              : isRevoking
                ? t("revoking")
                : t("revoke")}
          </AppButton>
          <div className="flex gap-2">
            <AppDialogClose asChild>
              <AppButton
                type="button"
                variant="ghost"
                className="rounded-full border border-white/10 px-5 py-2 text-xs font-bold uppercase tracking-wider text-gray-300 transition-colors hover:bg-white/10"
              >
                {t("cancel")}
              </AppButton>
            </AppDialogClose>
            <AppButton
              type="button"
              onClick={onSave}
              disabled={isSaving}
              className={cn(
                "rounded-full bg-primary px-5 py-2 text-xs font-bold uppercase tracking-wider text-black transition-colors hover:bg-primary hover:text-black",
                "disabled:cursor-not-allowed disabled:opacity-60",
              )}
            >
              {isSaving ? t("saving") : t("save")}
            </AppButton>
          </div>
        </div>
      </AppDialogContent>
    </AppDialog>
  );
}
