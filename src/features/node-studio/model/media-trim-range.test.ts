import { describe, expect, it } from "vitest";
import { adjustTrimRange, trimKeyboardRange } from "./media-trim-range";
describe("direct trim range", () => {
  const range = { startMs: 1000, endMs: 2000 };
  it("moves the whole interval without changing duration at either source boundary", () => {
    expect(adjustTrimRange(range, "move", -4000, 5000)).toEqual({ startMs: 0, endMs: 1000 });
    expect(adjustTrimRange(range, "move", 9000, 5000)).toEqual({ startMs: 4000, endMs: 5000 });
    expect(adjustTrimRange(range, "start", 2000, 5000)).toEqual({ startMs: 1960, endMs: 2000 });
  });
  it("snaps pointer boundaries to whole seconds before source/minimum limits", () => {
    expect(adjustTrimRange(range, "end", 750, 5000, true).endMs).toBe(3000);
    expect(adjustTrimRange(range, "move", 650, 5000, true)).toEqual({ startMs: 2000, endMs: 3000 });
  });
  it("implements normal/fine/fast and playhead in/out shortcuts", () => {
    expect(trimKeyboardRange(range, "ArrowRight", 5000, 0)).toEqual({ startMs: 1100, endMs: 2100 });
    expect(trimKeyboardRange(range, "ArrowDown", 5000, 0, true)?.endMs).toBe(2010);
    expect(trimKeyboardRange(range, "ArrowDown", 5000, 0, false, true)?.endMs).toBe(3000);
    expect(trimKeyboardRange(range, "i", 5000, 1500)?.startMs).toBe(1500);
    expect(trimKeyboardRange(range, "O", 5000, 4900)?.endMs).toBe(4900);
    expect(trimKeyboardRange(range, "ArrowDown", 5000, 0, false, false, true)?.endMs).toBe(3000);
    expect(trimKeyboardRange(range, "ArrowDown", 5000, 0, true, false, true)?.endMs).toBe(2010);
  });
});
