"use client";
import { useState } from "react";
import { Check, ChevronDown, LayoutTemplate, Search } from "lucide-react";
import { useTranslations } from "next-intl";
import { AppModalityTag } from "./app-modality-tag";
import { promptPresetInputMode } from "@/shared/prompt-presets/prompt-preset-input-mode";
import { promptPresetDisplayName } from "@/shared/prompt-presets/prompt-preset-display-name";
import type { PromptPreset } from "@/shared/prompt-presets/prompt-preset-contract";
import { AppButton } from "./app-button";
import { AppPickerItem } from "./app-picker-item";
import { AppPopover, AppPopoverContent, AppPopoverTrigger } from "./app-popover";
import { AppInput } from "./app-input";
import { StatePanel } from "./brand/state-panel/state-panel";
import { cn } from "@/shared/lib/utils";

export type GenerationPresetPickerProps = {
  items: readonly PromptPreset[]; selected: PromptPreset | null;
  loading?: boolean; error?: boolean; disabled?: boolean; modified?: boolean;
  onSelect: (preset: PromptPreset) => void; onRetry: () => void;
  onReapply?: () => void; onRestore?: () => void; onClear?: () => void;
  appearance?: "modern" | "space";
};
export function GenerationPresetPicker(props: GenerationPresetPickerProps) {
  const t = useTranslations("promptPresets");
  const [open, setOpen] = useState(false), [query, setQuery] = useState("");
  const close = () => { setOpen(false); setQuery(""); };
  const items = props.items.filter(p => [promptPresetDisplayName(p, t), p.name, p.description].join(" ").toLowerCase().includes(query.toLowerCase().trim()));
  return <AppPopover open={open} onOpenChange={value => { setOpen(value); if (!value) setQuery(""); }}>
    <AppPopoverTrigger asChild>
      <AppButton type="button" variant="surface" size="md" disabled={props.disabled} aria-haspopup="dialog" aria-expanded={open}
        className={cn("w-auto max-w-full min-w-0 gap-2", props.selected && (props.appearance === "space" ? "border-primary" : "border-data-accent/50"),
          props.appearance === "space" && "!h-auto min-h-9 !w-full !rounded-lg !border-neutral-700 !bg-neutral-900 !px-3 !py-2 !text-xs !text-neutral-200")}>
        {props.appearance !== "space" ? <LayoutTemplate aria-hidden="true" className="h-4 w-4 shrink-0" /> : null}
        <span className="truncate">{props.appearance === "space" ? (props.selected ? promptPresetDisplayName(props.selected, t) : t("select")) + (props.modified ? " *" : "") : t("button")}</span>
        <ChevronDown className={cn("h-4 w-4 shrink-0", props.appearance === "space" ? "text-primary" : "text-muted-foreground")} />
      </AppButton>
    </AppPopoverTrigger>
    <AppPopoverContent data-space-preset-picker={props.appearance === "space" ? "" : undefined} side="top" align="start" sideOffset={12} aria-label={t("select")} className={cn("flex max-h-[min(70vh,44rem)] w-[min(92vw,34rem)] flex-col overflow-hidden p-0",
      props.appearance === "space" && "!z-[2000] !rounded-xl !border-neutral-700 !bg-neutral-800 !text-neutral-200")}>
      <div className="flex items-center gap-3 border-b border-border p-4">
        <Search className="h-5 w-5 shrink-0 text-muted-foreground" />
        <AppInput value={query} onChange={e => setQuery(e.target.value)} placeholder={t("search")} aria-label={t("search")} />
      </div>
      <div className="min-h-0 overflow-y-auto p-4">
        {props.loading ? <StatePanel title={t("loading")} aria-busy="true" />
          : props.error ? <StatePanel title={t("loadFailed")} tone="destructive" action={<AppButton type="button" variant="surface" onClick={props.onRetry}>{t("retry")}</AppButton>} />
          : !items.length ? <StatePanel title={t("empty")} description={t("emptyDescription")} />
          : <div className="space-y-1">{items.map(p => <AppPickerItem key={p.key} selected={props.selected?.key === p.key}
            onClick={() => { props.onSelect(p); close(); }}>
            <span className="min-w-0 flex-1"><span className="block text-sm font-semibold">{promptPresetDisplayName(p, t)}</span><span data-picker-secondary="" className="block text-xs font-normal text-muted-foreground">{p.builtinKey ? t("provided") : t("personal")}{p.isModified ? " · " + t("modified") : ""}</span></span>
            <AppModalityTag data-picker-secondary="">{promptPresetInputMode(p)}</AppModalityTag>
            {props.selected?.key === p.key ? <Check className="h-4 w-4 text-data-accent-foreground" aria-label={t("selected")} /> : null}
          </AppPickerItem>)}</div>}
      </div>
      <div className="flex shrink-0 flex-wrap gap-2 border-t border-border p-3">
        {props.selected && props.appearance === "space" ? <>
          <AppButton type="button" size="sm" variant="ghost" onClick={() => { props.onReapply?.(); close(); }}>{t("reapply")}</AppButton>
          {props.selected.defaultPrompt !== null ? <AppButton type="button" size="sm" variant="ghost" onClick={() => { props.onRestore?.(); close(); }}>{t("restoreWork")}</AppButton> : null}
          <AppButton type="button" size="sm" variant="ghost" onClick={() => { props.onClear?.(); close(); }}>{t("clear")}</AppButton>
        </> : null}
        <AppButton size="sm" variant="surface" asChild><a href="/prompt-presets" target="_blank" rel="noopener noreferrer">{t("manage")}</a></AppButton>
      </div>
    </AppPopoverContent>
  </AppPopover>;
}
