import { z } from "zod";

export const assistantOutputModeSchema = z.enum(["text", "list"]);
export type AssistantOutputMode = z.infer<typeof assistantOutputModeSchema>;
const listResponseSchema = z.object({ items: z.array(z.string().trim().min(1).max(4_000)).min(1).max(50) }).strict();
export const assistantItemsSchema = z.array(z.object({ id: z.string().min(1).max(256), text: z.string().trim().min(1).max(4_000) }).strict()).min(1).max(50);
export type AssistantItem = z.infer<typeof assistantItemsSchema>[number];
export type AssistantTextResult = { text: string | null; item: string | null };
export type AssistantResults = Readonly<Record<string, string | AssistantTextResult>>;
export const assistantSelectionSchema = z.object({
  action: z.literal("select-item"), itemId: z.string().min(1).max(256), expectedSelectionVersion: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
}).strict();

export class AssistantListInvalidError extends Error {
  readonly code = "ASSISTANT_LIST_INVALID";
  constructor() { super("ASSISTANT_LIST_INVALID"); }
}

export function parseAssistantList(raw: string, executionId: string) {
  try {
    const source = raw.trim();
    const fence = /^```(?:json)?\s*\n([\s\S]*?)\n```$/i.exec(source);
    const { items } = listResponseSchema.parse(JSON.parse(fence ? fence[1] : source));
    const text = items.map((item, index) => `${index + 1}. ${item}`).join("\n\n");
    if (text.length > 20_000) throw new AssistantListInvalidError();
    return { text, items: items.map((text, index) => ({ id: `${executionId}:${index + 1}`, text })) };
  } catch { throw new AssistantListInvalidError(); }
}

export function assistantTextForPort(result: string | AssistantTextResult | null | undefined, portId = "text"): string | null {
  if (typeof result === "string") return portId === "text" ? result : null;
  return portId === "text" ? result?.text ?? null : portId === "item" ? result?.item ?? null : null;
}

export function assistantTextResult(text: string | null, rawItems: unknown, selectedItemId: string | null): AssistantTextResult {
  const items = assistantItemsSchema.safeParse(rawItems);
  return { text, item: items.success ? items.data.find(item => item.id === selectedItemId)?.text ?? null : null };
}
