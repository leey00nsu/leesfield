"use client";
import { useEffect, useRef, useState } from "react";
import { usePromptPresetCatalog } from "./use-prompt-preset-catalog";
import { applyPromptPreset, emptyPromptPresetDraft, promptPresetRecommendations, type PromptPresetDraft } from "@/shared/prompt-presets/prompt-preset-application";
import { promptPresetReference, type PromptPreset, type PromptPresetModality } from "@/shared/prompt-presets/prompt-preset-contract";
import type { RuntimeModelBase } from "@/shared/model-catalog/runtime-utils";

type Options = {
  modality: PromptPresetModality; enabled: boolean; prompt: string;
  model?: RuntimeModelBase; getValues: () => Record<string, unknown>;
  isEdited: (path: string) => boolean;
  onApply: (prompt: string, updates: Record<string, unknown>) => void;
};
export function useGenerationPromptPreset(options: Options) {
  const catalog = usePromptPresetCatalog(options.modality, false, options.enabled);
  const [draft, setDraft] = useState<PromptPresetDraft>(emptyPromptPresetDraft);
  const [pending, setPending] = useState<{ preset: PromptPreset; original: boolean } | null>(null);
  const [tokenOffset, setTokenOffset] = useState(0);
  const text = userText(options.prompt, draft.appliedPrompt, tokenOffset);
  const modified = Boolean(draft.preset && draft.appliedPrompt !== draft.preset.prompt);
  const live = useRef({ options, draft, text, tokenOffset });
  const editedSettings = useRef(new Set<string>());
  useEffect(() => { editedSettings.current.clear(); }, [options.model?.key]);
  useEffect(() => { live.current = { options, draft, text, tokenOffset }; }, [options, draft, text, tokenOffset]);
  // A history/query replacement supplies a complete prompt, not an addition.
  if (draft.appliedPrompt !== null && !containsBody(options.prompt, draft.appliedPrompt, tokenOffset)) {
    setDraft(emptyPromptPresetDraft);
  }
  const commit = (preset: PromptPreset, original: boolean) => {
    const current = live.current.options;
    const result = applyPromptPreset(preset, original);
    const recommendation = current.model ? promptPresetRecommendations(current.model, current.getValues(), result.reference, path => editedSettings.current.has(path) || current.isEdited(path)) : null;
    current.onApply(combine(result.prompt, live.current.text, live.current.draft.preset ? live.current.tokenOffset : 0), recommendation?.updates ?? {});
    if (!live.current.draft.preset) setTokenOffset(0);
    setDraft(result.draft);
    setPending(null);
  };
  const requestApply = (preset: PromptPreset, original = false) => {
    if (live.current.draft.preset && live.current.draft.appliedPrompt !== live.current.draft.preset.prompt) setPending({ preset, original });
    else commit(preset, original);
  };
  return {
    catalog, preset: draft.preset, text, tokenOffset, presetText: draft.appliedPrompt ?? "",
    editText: (next: string, includePreset = true, offset = tokenOffset) => {
      options.onApply(draft.preset && includePreset ? combine(draft.appliedPrompt ?? "", next, offset) : next, {});
      setTokenOffset(offset);
      if (!includePreset) setDraft(emptyPromptPresetDraft);
    },
    editPreset: (next: string) => {
      if (!draft.preset || !next.trim()) return;
      options.onApply(combine(next, text, tokenOffset), {});
      setDraft({ ...draft, appliedPrompt: next });
    },
    markProviderEdits: (previous: Record<string, unknown>, next: Record<string, unknown>) => {
      for (const key of new Set([...Object.keys(previous), ...Object.keys(next)])) {
        if (JSON.stringify(previous[key]) !== JSON.stringify(next[key])) editedSettings.current.add("dynamicParams." + key);
      }
    },
    reference: draft.preset ? promptPresetReference(draft.preset) : undefined,
    modified, pending, requestApply,
    clear: () => {
      if (draft.preset) options.onApply(text, {});
      setDraft(emptyPromptPresetDraft);
    },
    cancel: () => setPending(null),
    confirm: () => { if (pending) commit(pending.preset, pending.original); },
  };
}
export type GenerationPromptPresetController = ReturnType<typeof useGenerationPromptPreset>;

function combine(body: string, text: string, offset: number) {
  const before = text.slice(0, offset), after = text.slice(offset);
  return (before ? before + "\n\n" : "") + body + (after ? "\n\n" + after : "");
}
function containsBody(prompt: string, body: string, offset: number) {
  const tail = prompt.slice(offset);
  const expected = (offset ? "\n\n" : "") + body;
  return tail === expected || tail.startsWith(expected + "\n\n");
}
function userText(prompt: string, body: string | null, offset: number) {
  if (body === null) return prompt;
  if (!containsBody(prompt, body, offset)) return prompt;
  const before = prompt.slice(0, offset);
  const tail = prompt.slice(offset + (offset ? 2 : 0) + body.length);
  return before + (tail ? tail.slice(2) : "");
}
