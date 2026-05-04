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
      <AppDialogContent className="w-[calc(100%-2rem)] max-w-xl rounded-[1.5rem] border-white/10 bg-[#0b0d0e] p-6 text-white shadow-[0_34px_120px_rgba(0,0,0,0.65)]">
        <div className="flex items-start justify-between gap-4">
          <div>
            <AppDialogDescription className="text-[11px] font-black uppercase tracking-[0.24em] text-primary">
              {t("editTitle")}
            </AppDialogDescription>
            <AppDialogTitle className="mt-2 text-xl font-semibold text-white">
              {apiKey.label}
            </AppDialogTitle>
            <p className="mt-2 rounded-xl border border-white/10 bg-black/28 px-3 py-2 font-mono text-xs text-white/44">
              {apiKey.maskedKey}
            </p>
          </div>
          <AppDialogClose asChild>
            <AppButton
              type="button"
              variant="ghost"
              className="rounded-full border border-white/10 p-2 text-white/46 transition-colors hover:border-white/20 hover:bg-white/6 hover:text-white"
              aria-label={t("close")}
            >
              <X className="h-4 w-4" />
            </AppButton>
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
        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <AppButton
            type="button"
            onClick={onRevoke}
            disabled={apiKey.status === "revoked" || isRevoking}
            variant="danger"
            className={cn(
              "flex h-11 items-center justify-center rounded-full border border-red-500/60 px-6 text-sm font-semibold text-white",
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
                className="h-11 rounded-full border border-white/10 px-5 text-sm font-semibold text-white/70 transition-colors hover:bg-white/6 hover:text-white"
              >
                {t("cancel")}
              </AppButton>
            </AppDialogClose>
            <AppButton
              type="button"
              onClick={onSave}
              disabled={isSaving}
              className={cn(
                "h-11 rounded-full bg-primary px-5 text-sm font-semibold text-black transition-colors hover:bg-primary hover:text-black",
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
