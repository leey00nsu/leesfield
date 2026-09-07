import { describe, it, expect } from "vitest";
import { compareHistory, cursorWhere, decodeHistoryCursor, encodeHistoryCursor } from "./history-cursor";
import type { GenerationHistoryItem } from "@/entities/generation/model/types";
describe("history cursor", () => {
  it("orders equal timestamps by source and id and binds cursor to filters", () => {
    const items = [0, 1, 2, 3].flatMap(rank => ["a", "b"].map(id => ({ id, createdAt: "2026-01-01T00:00:00.000Z", type: ["image", "video", "audio", "image"][rank], origin: rank === 3 ? "edit" : "generation" } as GenerationHistoryItem)));
    expect([...items].sort((a,b) => compareHistory(a,b,false))).toEqual(items.toReversed());
    const encoded = encodeHistoryCursor(items[3], "scope");
    const cursor = decodeHistoryCursor(encoded, "scope")!;
    expect(cursorWhere(cursor, 0, "requestId", false).OR).toHaveLength(2);
    expect(cursorWhere(cursor, 2, "requestId", false).OR).toHaveLength(1);
    expect(() => decodeHistoryCursor(encoded, "different-filter")).toThrow("INVALID_HISTORY_CURSOR");
    expect(() => decodeHistoryCursor("malformed", "scope")).toThrow();
  });
});
