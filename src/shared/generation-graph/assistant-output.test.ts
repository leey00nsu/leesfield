import { describe, expect, it } from "vitest";
import { parseAssistantList, assistantTextResult, assistantTextForPort } from "./assistant-output";

describe("Assistant list contract", () => {
  it("trims items, preserves duplicate identities, and accepts one whole JSON fence", () => {
    const result = parseAssistantList('```json\n{"items":["  coat  ","coat"]}\n```', "run");
    expect(result).toEqual({ text: "1. coat\n\n2. coat", items: [{ id: "run:1", text: "coat" }, { id: "run:2", text: "coat" }] });
    const ports = assistantTextResult(result.text, result.items, "run:2");
    expect(assistantTextForPort(ports, "item")).toBe("coat");
    expect(assistantTextForPort(ports)).toBe("1. coat\n\n2. coat");
    expect(assistantTextForPort("legacy", "item")).toBeNull();
    expect(parseAssistantList('{"items":["coat"]}', "other").items[0].id).not.toBe("run:1");
  });
  it.each([
    'Here is the list: {"items":["coat"]}', '{"items":[]}', '{"items":[" "]}', '{"items":[{}]}', '{"items":[["coat"]]}',
    '{"items":["coat"],"extra":1}', '```json\n{"items":["coat"]}\n```\ncomment', '{"items":["coat"]',
    JSON.stringify({ items: Array(51).fill("a") }), JSON.stringify({ items: ["a".repeat(4001)] }),
    JSON.stringify({ items: Array(5).fill("a".repeat(4000)) }),
  ].map((raw, index) => [index + 1, raw] as const))("rejects invalid or excessive output without guessing: case %s", (_index, raw) => {
    expect(() => parseAssistantList(raw, "run")).toThrow("ASSISTANT_LIST_INVALID");
  });
});
