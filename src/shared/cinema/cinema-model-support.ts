import { getGradioContract } from "@/shared/model-catalog/gradio-contract";

type CinemaModel = { providerConfig?: unknown; parameters?: unknown };
const record = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
export function cinemaPromptField(model: CinemaModel): { supported: boolean; dynamicName?: string } {
  const contract = getGradioContract(model);
  if (!contract) return { supported: true }; // Legacy generation contracts accept the canonical prompt.
  const field = contract.inputs.find(field => field.canonical === "prompt" && field.kind === "string");
  return field ? { supported: true, dynamicName: field.name } : { supported: false };
}
export function cinemaSourcePrompt(model: CinemaModel, payload: Record<string, unknown>): string {
  const support = cinemaPromptField(model);
  const dynamic = record(payload.dynamicParams);
  const value = support.dynamicName && Object.hasOwn(dynamic, support.dynamicName) ? dynamic[support.dynamicName] : payload.prompt;
  return typeof value === "string" ? value : "";
}
export function applyCinemaFinalPrompt(model: CinemaModel, payload: Record<string, unknown>, finalPrompt: string) {
  const support = cinemaPromptField(model);
  return { ...payload, prompt: finalPrompt, ...(support.dynamicName ? { dynamicParams: { ...record(payload.dynamicParams), [support.dynamicName]: finalPrompt } } : {}) };
}
