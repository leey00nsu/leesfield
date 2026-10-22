import { describe, expect, it } from "vitest";
import { spaceInspectorPanOffset } from "./space-editor-interactions";

const bounds = (left: number, top: number, width: number, height: number) => ({ left, top, right: left + width, bottom: top + height });

describe("opening the node inspector", () => {
  it("moves an obscured desktop node fully clear of the panel without changing its vertical position", () => {
    const node = bounds(810, 230, 320, 320), panel = bounds(1095, 150, 320, 600);
    const offset = spaceInspectorPanOffset(node, panel, bounds(0, 80, 1440, 820))!;
    expect(node.right + offset.x).toBeLessThan(panel.left);
    expect(offset.y).toBe(0);
  });
  it("does not pan when the node already clears the inspector or is above it", () => {
    const canvas = bounds(0, 80, 1440, 820), panel = bounds(1095, 230, 320, 500);
    expect(spaceInspectorPanOffset(bounds(400, 300, 320, 320), panel, canvas)).toBeNull();
    expect(spaceInspectorPanOffset(bounds(1100, 80, 100, 80), panel, canvas)).toBeNull();
  });
  it("moves mobile content above the bottom inspector while leaving corner actions inside the canvas", () => {
    const canvas = bounds(0, 80, 390, 764), panel = bounds(12, 520, 366, 260);
    const node = bounds(40, 460, 300, 300), offset = spaceInspectorPanOffset(node, panel, canvas)!;
    expect(offset.x).toBe(0);
    expect(node.bottom + offset.y).toBeLessThan(panel.top);
    expect(node.top + offset.y).toBeGreaterThan(canvas.top);
  });
  it("keeps the top actions visible even when a tall mobile node cannot fit above the panel", () => {
    const canvas = bounds(0, 80, 390, 764), panel = bounds(12, 520, 366, 260);
    const node = bounds(40, 400, 300, 900), offset = spaceInspectorPanOffset(node, panel, canvas)!;
    expect(node.top + offset.y).toBeGreaterThan(canvas.top);
    expect(node.top + offset.y).toBeLessThan(panel.top);
    expect(offset.x).toBe(0);
  });
});
