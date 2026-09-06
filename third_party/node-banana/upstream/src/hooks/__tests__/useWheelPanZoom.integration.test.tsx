import { afterEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";

const reactFlow = vi.hoisted(() => ({
  getViewport: vi.fn(() => ({ x: 100, y: 200, zoom: 0.5 })),
  setViewport: vi.fn(),
  zoomIn: vi.fn(),
  zoomOut: vi.fn(),
}));

vi.mock("@xyflow/react", () => ({
  useReactFlow: () => reactFlow,
}));

describe("useWheelPanZoom", () => {
  const originalPlatform = navigator.platform;

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    Object.defineProperty(navigator, "platform", {
      configurable: true,
      value: originalPlatform,
    });
    document.documentElement.className = "";
    document.body.innerHTML = "";
  });

  it("batches Mac trackpad movement and scopes activity to its wrapper", async () => {
    Object.defineProperty(navigator, "platform", {
      configurable: true,
      value: "MacIntel",
    });
    vi.resetModules();

    let frameCallback: FrameRequestCallback | null = null;
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      frameCallback = callback;
      return 1;
    });
    vi.stubGlobal("cancelAnimationFrame", vi.fn());

    const { useWheelPanZoom } = await import("../useWheelPanZoom");
    const wrapper = document.createElement("div");
    wrapper.className = "react-flow-wrapper";
    document.body.appendChild(wrapper);

    const { unmount } = renderHook(() =>
      useWheelPanZoom(
        { current: wrapper },
        { panMode: "space", zoomMode: "altScroll", selectionMode: "click" }
      )
    );
    const wheelEvent = new WheelEvent("wheel", {
      bubbles: true,
      cancelable: true,
      deltaMode: 0,
      deltaX: 4,
      deltaY: 6,
    });

    act(() => wrapper.dispatchEvent(wheelEvent));

    expect(wheelEvent.defaultPrevented).toBe(true);
    expect(wrapper).toHaveClass("canvas-wheel-navigation-active");
    expect(document.documentElement).not.toHaveClass("canvas-wheel-navigation-active");
    expect(reactFlow.setViewport).not.toHaveBeenCalled();

    act(() => frameCallback?.(0));
    expect(reactFlow.setViewport).toHaveBeenCalledWith({ x: 96, y: 194, zoom: 0.5 });

    unmount();
    expect(wrapper).not.toHaveClass("canvas-wheel-navigation-active");
  });
});
