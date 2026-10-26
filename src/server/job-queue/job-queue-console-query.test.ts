// @vitest-environment node
import { describe, expect, it } from "vitest";
import { parseConsoleQuery, encodeConsoleCursor } from "./job-queue-console-query";
const now = new Date("2026-10-25T03:00:00Z");
describe("console bounded queries", () => {
  it("keeps current work unbounded by age and gives history a bounded window", () => {
    expect(parseConsoleQuery({}, now).from).toBeNull();
    expect(parseConsoleQuery({ view: "history" }, now).from?.toISOString()).toBe("2026-10-24T03:00:00.000Z");
    expect(() => parseConsoleQuery({ view: "history", from: "2026-01-01T00:00:00Z" }, now)).toThrow();
  });
  it.each([{ limit: 101 }, { limit: 0 }, { q: "a".repeat(201) }, { worker: "app-01" }, { kind: "other" }, { unknown: "x" }, { from: "2026-10-26T00:00:00Z" }, { cursor: "bad" }])("rejects invalid query %j", input => {
    expect(() => parseConsoleQuery(input as never, now)).toThrow();
  });
  it("pins relative history and cursor scope to the first page while permitting a different page size", () => {
    const first = parseConsoleQuery({ view: "history", kind: "assistant" }, now);
    const cursor = encodeConsoleCursor({ v: 1, scope: "jobs", filter: first.fingerprint, anchor: first.anchor.toISOString(), at: now.toISOString(), id: "00000000-0000-4000-8000-000000000001" });
    const next = parseConsoleQuery({ view: "history", kind: "assistant", cursor, limit: 20 }, new Date(now.getTime()+10000));
    expect(next.from).toEqual(first.from);
    expect(() => parseConsoleQuery({ view: "history", kind: "generate_image", cursor }, now)).toThrow();
    expect(() => parseConsoleQuery({ view: "history", kind: "assistant", cursor }, now, "timeline")).toThrow();
  });
});
