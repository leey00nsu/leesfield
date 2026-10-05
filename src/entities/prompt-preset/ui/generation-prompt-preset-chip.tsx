"use client";
import { useState } from "react";
import { LayoutTemplate, SlidersHorizontal, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { AppButton } from "@/shared/ui/app-button";
import { AppTextarea } from "@/shared/ui/app-form-control";
import { AppDialog, AppDialogContent, AppDialogHeading, AppDialogTitle, AppDialogDescription, AppDialogFooter, AppDialogCancelButton, AppDialogActionButton } from "@/shared/ui/app-dialog";
import { promptPresetDisplayName } from "@/shared/prompt-presets/prompt-preset-display-name";
import type { GenerationPromptPresetController } from "../model/use-generation-prompt-preset";

export function GenerationPromptPresetChip({ controller: c, disabled = false }: { controller: Pick<GenerationPromptPresetController, "preset" | "presetText" | "modified" | "editPreset" | "clear">; disabled?: boolean }) {
  const t = useTranslations("promptPresets");
  const [editing, setEditing] = useState(false);
  const [body, setBody] = useState("");
  if (!c.preset) return null;
  const name = promptPresetDisplayName(c.preset, t);
  return <>
    <div data-generation-preset-chip="" className="inline-flex max-w-full shrink-0 items-center gap-1 rounded-full border border-border bg-secondary px-2 py-1 text-sm">
      <LayoutTemplate aria-hidden="true" className="mx-1 h-4 w-4 shrink-0 text-data-accent-foreground" />
      <span title={name} className="min-w-0 max-w-64 truncate">{name}{c.modified ? " *" : ""}</span>
      <AppButton type="button" variant="ghost" size="icon-sm" className="h-7 w-7 shrink-0" disabled={disabled}
        aria-label={t("editChip", { name })} onClick={() => { setBody(c.presetText); setEditing(true); }}><SlidersHorizontal className="h-4 w-4" /></AppButton>
      <AppButton type="button" variant="ghost" size="icon-sm" className="h-7 w-7 shrink-0" disabled={disabled}
        aria-label={t("removeChip", { name })} onClick={c.clear}><X className="h-4 w-4" /></AppButton>
    </div>
    <AppDialog open={editing} onOpenChange={setEditing}>
      <AppDialogContent size="lg">
        <AppDialogHeading><AppDialogTitle>{t("editChip", { name })}</AppDialogTitle><AppDialogDescription>{t("editChipDescription")}</AppDialogDescription></AppDialogHeading>
        <AppTextarea aria-label={t("prompt")} value={body} maxLength={20000} onChange={event => setBody(event.target.value)} disabled={disabled} className="min-h-64" />
        <AppDialogFooter>
          <AppDialogCancelButton type="button" onClick={() => setEditing(false)}>{t("cancel")}</AppDialogCancelButton>
          <AppDialogActionButton type="button" disabled={disabled || !body.trim()} onClick={() => { c.editPreset(body); setEditing(false); }}>{t("applyChip")}</AppDialogActionButton>
        </AppDialogFooter>
      </AppDialogContent>
    </AppDialog>
  </>;
}
