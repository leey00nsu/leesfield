import { recordObject } from "@/server/generation-request/request-snapshot";
import { findBuiltinPromptPreset } from "@/shared/prompt-presets/builtin-prompt-presets";
import { promptPresetRefSchema, promptPresetWorkStateSchema } from "@/shared/prompt-presets/prompt-preset-contract";

/** Recover legacy text only against an exact, versioned preset prefix. */
export function historyPromptAuthoring(raw: unknown, finalPrompt: string) {
  const snapshot = recordObject(raw);
  const source = typeof recordObject(snapshot.cinema).sourcePrompt === "string" ? String(recordObject(snapshot.cinema).sourcePrompt) : finalPrompt;
  let inputPrompt = typeof snapshot.inputPrompt === "string" ? snapshot.inputPrompt : null;
  const ref = promptPresetRefSchema.safeParse(snapshot.promptPreset);
  if (!ref.success) return { inputPrompt: snapshot.promptPreset ? inputPrompt : inputPrompt ?? source, promptPreset: null };
  const state = promptPresetWorkStateSchema.safeParse(snapshot.promptPresetState);
  const builtin = findBuiltinPromptPreset(ref.data.key);
  let tokenOffset = state.success ? state.data.tokenOffset ?? 0 : 0;
  if (inputPrompt === null) {
    const body = state.success ? state.data.appliedPrompt
      : builtin && (ref.data.builtinRevision ?? ref.data.revision) === builtin.revision ? builtin.prompt : null;
    if (body !== null && source === body) inputPrompt = "";
    else if (body !== null && source.startsWith(body + "\n\n")) inputPrompt = source.slice(body.length + 2);
    else if (state.success && state.data.userText !== undefined && state.data.tokenOffset !== undefined) {
      const text = state.data.userText, offset = Math.min(state.data.tokenOffset, text.length);
      const before = text.slice(0, offset), after = text.slice(offset);
      if ((before ? before + "\n\n" : "") + body + (after ? "\n\n" + after : "") === source) inputPrompt = text;
    }
  }
  if (inputPrompt !== null) tokenOffset = Math.min(tokenOffset, inputPrompt.length);
  return { inputPrompt, promptPreset: { key: ref.data.key, name: state.success ? state.data.name : builtin?.name ?? ref.data.key,
    builtinKey: builtin?.key ?? null, tokenOffset } };
}
