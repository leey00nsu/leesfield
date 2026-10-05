"use client";
import { useTranslations } from "next-intl";
import { GenerationPresetPicker } from "@/shared/ui/generation-preset-picker";
import { AppDialog, AppDialogContent, AppDialogHeading, AppDialogTitle, AppDialogDescription, AppDialogFooter, AppDialogCancelButton, AppDialogActionButton } from "@/shared/ui/app-dialog";
import type { GenerationPromptPresetController } from "../model/use-generation-prompt-preset";
import type { PromptPresetInputIssue } from "@/shared/prompt-presets/prompt-preset-application";
import { AppPromptMessage } from "@/shared/ui/app-prompt-message";

export function GenerationPromptPresetControls({ controller: c, disabled = false, inputIssue }: { controller: Pick<GenerationPromptPresetController, "catalog" | "preset" | "modified" | "requestApply" | "pending" | "cancel" | "confirm">; disabled?: boolean; inputIssue?: PromptPresetInputIssue | null }) {
  const t = useTranslations("promptPresets");
  return <>
    <GenerationPresetPicker items={c.catalog.data ?? []} selected={c.preset} loading={c.catalog.isLoading} error={c.catalog.isError}
      disabled={disabled} modified={c.modified} onSelect={c.requestApply} onRetry={() => { void c.catalog.refetch(); }} />
    {inputIssue ? <AppPromptMessage className="basis-full">{t(inputIssue === "referenceRequired" ? "referenceMissing" : inputIssue)}</AppPromptMessage> : null}
    <AppDialog open={c.pending !== null} onOpenChange={open => { if (!open) c.cancel(); }}>
      <AppDialogContent size="sm">
        <AppDialogHeading><AppDialogTitle>{t("replaceChipTitle")}</AppDialogTitle><AppDialogDescription>{t("replaceChipDescription")}</AppDialogDescription></AppDialogHeading>
        <AppDialogFooter>
          <AppDialogCancelButton type="button" onClick={c.cancel}>{t("cancel")}</AppDialogCancelButton>
          <AppDialogActionButton type="button" onClick={c.confirm}>{t("replace")}</AppDialogActionButton>
        </AppDialogFooter>
      </AppDialogContent>
    </AppDialog>
  </>;
}
