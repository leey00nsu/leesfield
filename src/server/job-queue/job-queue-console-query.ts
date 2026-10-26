import { createHash } from "node:crypto";
import { z } from "zod";
import { consoleFailedQuerySchema, consoleQuerySchema } from "@/shared/api/job-queue-console-contract";

const cursorSchema = z.object({
  v: z.literal(1), scope: z.string().max(80), filter: z.string().regex(/^[a-f0-9]{64}$/),
  anchor: z.iso.datetime(), at: z.iso.datetime(), id: z.string().uuid(), ordinal: z.number().int().positive().optional(),
}).strict();
export type ConsoleCursor = z.infer<typeof cursorSchema>;
export function encodeConsoleCursor(cursor: ConsoleCursor) { return Buffer.from(JSON.stringify(cursor)).toString("base64url"); }
export function readConsoleCursor(raw: string | undefined, scope: string, filter: string) {
  if (!raw) return null;
  try {
    if (!/^[A-Za-z0-9_-]+$/.test(raw)) throw new Error();
    const value = cursorSchema.parse(JSON.parse(Buffer.from(raw, "base64url").toString("utf8")));
    if (value.scope !== scope || value.filter !== filter || new Date(value.at) > new Date(value.anchor)) throw new Error();
    return value;
  } catch { throw new ConsoleInputError(); }
}
export class ConsoleInputError extends Error { constructor() { super("INVALID_REQUEST"); } }
export function parseConsoleQuery(raw: unknown, now = new Date(), scope = "jobs") {
  const input = scope === "failed-jobs" ? consoleFailedQuerySchema.parse(raw) : consoleQuerySchema.parse(raw);
  const rawCursor = input.cursor;
  const filters = Object.fromEntries(Object.entries(input).filter(([key]) => key !== "cursor" && key !== "limit"));
  const fingerprint = createHash("sha256").update(JSON.stringify(filters)).digest("hex");
  const cursor = readConsoleCursor(rawCursor, scope, fingerprint);
  const anchor = new Date(cursor?.anchor ?? now.toISOString());
  if (anchor > now) throw new ConsoleInputError();
  const to = new Date(input.to ?? anchor.toISOString());
  const maxWindow = scope === "timeline" ? 86_400_000 : 31 * 86_400_000;
  const defaultWindow = scope === "timeline" ? 300_000 : 86_400_000;
  const from = input.from ? new Date(input.from) : input.view === "history" || scope === "timeline" ? new Date(to.getTime() - defaultWindow) : null;
  if (to > anchor || (from && (from >= to || to.getTime() - from.getTime() > maxWindow))) throw new ConsoleInputError();
  return { input, fingerprint, scope, cursor, anchor, from, to };
}
export type ParsedConsoleQuery = ReturnType<typeof parseConsoleQuery>;
