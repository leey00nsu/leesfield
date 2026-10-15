"use client";
import { useState, type ReactNode } from "react";
import { LayoutTemplate, SlidersHorizontal, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { AppButton } from "@/shared/ui/app-button";
import { AppTextarea } from "@/shared/ui/app-form-control";
import { AppDialog, AppDialogContent, AppDialogHeading, AppDialogTitle, AppDialogDescription, AppDialogFooter, AppDialogCancelButton, AppDialogActionButton } from "@/shared/ui/app-dialog";
import { promptPresetDisplayName } from "@/shared/prompt-presets/prompt-preset-display-name";
import type { GenerationPromptPresetController } from "../model/use-generation-prompt-preset";
import styles from "@/shared/ui/app-prompt-chip.module.css";

export function PromptPresetChip({ preset, modified = false, children }: { preset: { key: string; name: string; builtinKey?: string | null }; modified?: boolean; children?: ReactNode }) {
  const t = useTranslations("promptPresets");
  const name = promptPresetDisplayName(preset, t);
  return <span data-generation-preset-chip="" className={`${styles.chip} rounded-full border border-border bg-secondary`}>
    <LayoutTemplate aria-hidden="true" className="mx-1 h-4 w-4 shrink-0 text-data-accent-foreground" />
    <span title={name} className="min-w-0 max-w-64 truncate">{name}{modified ? " *" : ""}</span>{children}
  </span>;
}

export function PromptPresetInputText({ text, preset }: { text: string; preset?: { key: string; name: string; builtinKey?: string | null; tokenOffset: number } | null }) {
  if (!preset) return <>{text}</>;
  const offset = Math.min(Math.max(0, preset.tokenOffset), text.length);
  return <>{text.slice(0, offset)}<span className="mr-2 inline-block max-w-full align-baseline"><PromptPresetChip preset={preset} /></span>{text.slice(offset)}</>;
}

export function GenerationPromptPresetChip({ controller: c, disabled = false }: { controller: Pick<GenerationPromptPresetController, "preset" | "presetText" | "modified" | "editPreset" | "clear">; disabled?: boolean }) {
  const t = useTranslations("promptPresets");
  const [editing, setEditing] = useState(false);
  const [body, setBody] = useState("");
  if (!c.preset) return null;
  const name = promptPresetDisplayName(c.preset, t);
  return <>
    <PromptPresetChip preset={c.preset} modified={c.modified}>
      <AppButton type="button" variant="ghost" size="icon-sm" className="h-7 w-7 shrink-0" disabled={disabled}
        aria-label={t("editChip", { name })} onClick={() => { setBody(c.presetText); setEditing(true); }}><SlidersHorizontal className="h-4 w-4" /></AppButton>
      <AppButton type="button" variant="ghost" size="icon-sm" className="h-7 w-7 shrink-0" disabled={disabled}
        aria-label={t("removeChip", { name })} onClick={c.clear}><X className="h-4 w-4" /></AppButton>
    </PromptPresetChip>
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
