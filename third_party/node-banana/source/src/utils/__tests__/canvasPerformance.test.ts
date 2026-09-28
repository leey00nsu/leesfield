import { describe, expect, it } from "vitest";
import {
  OVERVIEW_ZOOM_THRESHOLD,
  selectCanvasOverview,
  setCanvasPanningClass,
  setCanvasWheelPanningClass,
} from "../canvasPerformance";

describe("canvas performance helpers", () => {
  it("enters overview mode only below the zoom threshold", () => {
    expect(selectCanvasOverview({ transform: [0, 0, OVERVIEW_ZOOM_THRESHOLD] } as never)).toBe(
      false
    );
    expect(
      selectCanvasOverview({ transform: [120, -40, OVERVIEW_ZOOM_THRESHOLD - 0.01] } as never)
    ).toBe(true);
  });

  it("toggles the panning performance class without affecting other classes", () => {
    const root = document.createElement("div");
    root.classList.add("existing");

    setCanvasPanningClass(true, root);
    expect(root).toHaveClass("existing", "canvas-native-navigation-active");

    setCanvasPanningClass(false, root);
    expect(root).toHaveClass("existing");
    expect(root).not.toHaveClass("canvas-native-navigation-active");
  });

  it("toggles wheel-panning independently from React Flow gestures", () => {
    const root = document.createElement("div");

    setCanvasWheelPanningClass(true, root);
    expect(root).toHaveClass("canvas-wheel-navigation-active");

    setCanvasWheelPanningClass(false, root);
    expect(root).not.toHaveClass("canvas-wheel-navigation-active");
  });
});
