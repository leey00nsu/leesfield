import { z } from "zod";
import { promptPresetSchema, type PromptPreset, type PromptPresetModality } from "@/shared/prompt-presets/prompt-preset-contract";

export class PromptPresetApiError extends Error {
  constructor(public code: string, public status: number) { super(code); }
}
export async function promptPresetRequest(path: string, init?: RequestInit) {
  const response = await fetch("/api/prompt-presets" + path, { cache: "no-store", ...init });
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new PromptPresetApiError(body?.message ?? "REQUEST_FAILED", response.status);
  return body;
}
export async function listPromptPresets(modality?: PromptPresetModality, includeInactive = false, signal?: AbortSignal): Promise<PromptPreset[]> {
  const query = new URLSearchParams({ includeInactive: String(includeInactive) });
  if (modality) query.set("modality", modality);
  const body = await promptPresetRequest("?" + query, { signal });
  return z.object({ items: z.array(promptPresetSchema) }).parse(body).items;
}
export async function getPromptPreset(key: string): Promise<PromptPreset> {
  return z.object({ item: promptPresetSchema }).parse(await promptPresetRequest("/" + encodeURIComponent(key))).item;
}
export function mutatePromptPreset(path: string, method: string, body: unknown) {
  return promptPresetRequest(path, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
}
