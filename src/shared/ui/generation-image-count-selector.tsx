"use client";

import { useState } from "react";
import { Check, ChevronDown, Images } from "lucide-react";
import { useTranslations } from "next-intl";
import { MAX_GENERATION_REPETITIONS, isGenerationRepeatCount } from "@/shared/generation/generation-repeat";
import { AppButton } from "./app-button";
import { AppInput } from "./app-input";
import { AppPickerItem } from "./app-picker-item";
import { AppPopover, AppPopoverContent, AppPopoverTrigger } from "./app-popover";
import { AppPromptMessage } from "./app-prompt-message";

export function GenerationImageCountSelector({ value, disabled, onChange }: {
  value: number;
  disabled: boolean;
  onChange: (value: number) => void;
}) {
  const t = useTranslations("generation.imageCountPicker");
  const [open, setOpen] = useState(false);
  const [custom, setCustom] = useState(false);
  const [draft, setDraft] = useState("");
  const next = Number(draft);
  const valid = draft.trim() !== "" && isGenerationRepeatCount(next);
  const constraint = t("range", { min: 1, max: MAX_GENERATION_REPETITIONS, step: 1 });
  const select = (selected: number) => {
    if (disabled || !isGenerationRepeatCount(selected)) return;
    onChange(selected);
    setOpen(false);
  };
  return <AppPopover open={open && !disabled} onOpenChange={nextOpen => {
    setOpen(nextOpen);
    setCustom(false);
    setDraft(String(value));
  }}>
    <AppPopoverTrigger asChild>
      <AppButton type="button" variant="surface" disabled={disabled} aria-haspopup="dialog" aria-expanded={open && !disabled}>
        <Images className="h-4 w-4" /><span>{t("label")} · {t("count", { count: value })}</span>
        <ChevronDown className="h-4 w-4 text-white/46" />
      </AppButton>
    </AppPopoverTrigger>
    <AppPopoverContent side="top" align="start" sideOffset={12} aria-label={t("label")} className="w-[min(18rem,calc(100vw-2rem))]">
      <div className="flex flex-col gap-1">
        {[1, 2, 4].map(option => <AppPickerItem key={option} selected={!custom && option === value} onClick={() => select(option)}>
          {t("count", { count: option })}{!custom && option === value && <Check className="ml-auto h-4 w-4 text-data-accent-foreground" />}
        </AppPickerItem>)}
        <AppPickerItem selected={custom} onClick={() => { setCustom(true); setDraft(String(value)); }}>{t("custom")}</AppPickerItem>
        <p className="mt-2 text-xs text-muted-foreground">{constraint}</p>
        {custom && <div className="mt-2 flex flex-col gap-3">
          <AppInput autoFocus type="number" aria-label={t("custom")} min={1} max={MAX_GENERATION_REPETITIONS} step={1}
            value={draft} onChange={event => setDraft(event.target.value)} aria-invalid={!valid}
            onKeyDown={event => { if (event.key === "Enter") { event.preventDefault(); if (valid) select(next); } }} />
          {!valid && <AppPromptMessage>{t("invalid", { constraint })}</AppPromptMessage>}
          <AppButton type="button" variant="brand" className="self-end" disabled={!valid} onClick={() => select(next)}>{t("apply")}</AppButton>
        </div>}
      </div>
    </AppPopoverContent>
  </AppPopover>;
}
