// @vitest-environment node
import { describe, expect, it } from "vitest";
import { adjustCrop, containedMediaBox, mediaEditBarPosition, presetCrop } from "./media-crop-geometry";
describe("original media crop coordinates", () => {
  it("contains a landscape source in a portrait body and keeps centre presets", () => {
    expect(containedMediaBox({ x: 10, y: 20, width: 200, height: 300 }, 400, 200)).toEqual({ x: 10, y: 120, width: 200, height: 100 });
    expect(presetCrop(400, 200, "1:1")).toEqual({ x: 100, y: 0, width: 200, height: 200 });
    expect(presetCrop(400, 200, "original")).toEqual({ x: 0, y: 0, width: 400, height: 200 });
  });
  it("never crosses edges or flips a handle and uses even video pixels", () => {
    const rect = { x: 100, y: 20, width: 200, height: 100 };
    expect(adjustCrop(rect, "move", 400, -200, 400, 200, false)).toEqual({ x: 200, y: 0, width: 200, height: 100 });
    expect(adjustCrop(rect, "nw", 400, 400, 400, 200, false)).toEqual({ x: 299, y: 119, width: 1, height: 1 });
    expect(adjustCrop(rect, "se", 7, 3, 400, 200, true)).toEqual({ x: 100, y: 20, width: 206, height: 102 });
  });
  it.each([390, 768, 1440])("clamps the screen-size bar at viewport %i", width => {
    for (const zoom of [0.5, 1, 1.5]) for (const y of [20, 300, 850]) {
      const bar = mediaEditBarPosition({ x: width - 50, y, width: 400 * zoom, height: 200 * zoom }, 959, 73, { width, height: 900 }, false);
      expect(bar.left).toBeGreaterThanOrEqual(8); expect(bar.left + bar.width).toBeLessThanOrEqual(width - 8);
      expect(bar.top).toBeGreaterThanOrEqual(72); expect(bar.top + 73).toBeLessThanOrEqual(812);
    }
  });
});
