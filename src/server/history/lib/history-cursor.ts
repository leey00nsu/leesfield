import type { GenerationHistoryItem } from "@/entities/generation/model/types";
export type HistoryCursor = { v: 1; at: string; rank: number; id: string; scope: string };
export class InvalidHistoryCursor extends Error {}
export function historyRank(item: Pick<GenerationHistoryItem, "origin" | "type">) { return item.origin === "edit" ? 3 : ({ image: 0, video: 1, audio: 2 })[item.type]; }
export function decodeHistoryCursor(raw: string | null, scope: string): HistoryCursor | null {
  if (!raw) return null;
  try {
    if (raw.length > 4096) throw new Error();
    const value = JSON.parse(Buffer.from(raw, "base64url").toString());
    if (value.v !== 1 || typeof value.at !== "string" || !Number.isFinite(Date.parse(value.at)) || !Number.isInteger(value.rank) || value.rank < 0 || value.rank > 3 || typeof value.id !== "string" || !value.id || value.scope !== scope) throw new Error();
    return value;
  } catch { throw new InvalidHistoryCursor("INVALID_HISTORY_CURSOR"); }
}
export function encodeHistoryCursor(item: GenerationHistoryItem, scope: string) { return Buffer.from(JSON.stringify({ v: 1, at: item.createdAt, rank: historyRank(item), id: item.id, scope })).toString("base64url"); }
export function cursorWhere(cursor: HistoryCursor | null, rank: number, idField: "requestId" | "id", asc: boolean) {
  if (!cursor) return {};
  const op = asc ? "gt" : "lt";
  const at = new Date(cursor.at);
  const sameTime = rank === cursor.rank ? { createdAt: at, [idField]: { [op]: cursor.id } } : ((asc ? rank > cursor.rank : rank < cursor.rank) ? { createdAt: at } : null);
  return { OR: [{ createdAt: { [op]: at } }, ...(sameTime ? [sameTime] : [])] };
}
export function compareHistory(a: GenerationHistoryItem, b: GenerationHistoryItem, asc: boolean) {
  const delta = Date.parse(a.createdAt) - Date.parse(b.createdAt) || historyRank(a) - historyRank(b) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  return asc ? delta : -delta;
}
