import { describe, expect, it, vi } from "vitest";
import { createPanActivityTracker, createViewportPanBatcher } from "../useWheelPanZoom";

describe("createViewportPanBatcher", () => {
  it("coalesces multiple wheel events into one viewport update per frame", () => {
    let frameCallback: FrameRequestCallback | null = null;
    const requestFrame = vi.fn((callback: FrameRequestCallback) => {
      frameCallback = callback;
      return 7;
    });
    const getViewport = vi.fn(() => ({ x: 100, y: 200, zoom: 0.5 }));
    const setViewport = vi.fn();
    const batcher = createViewportPanBatcher({
      getViewport,
      setViewport,
      requestFrame,
      cancelFrame: vi.fn(),
    });

    batcher.queue(4, 6);
    batcher.queue(-1, 3);

    expect(requestFrame).toHaveBeenCalledTimes(1);
    expect(setViewport).not.toHaveBeenCalled();

    frameCallback?.(0);

    expect(setViewport).toHaveBeenCalledTimes(1);
    expect(setViewport).toHaveBeenCalledWith({ x: 97, y: 191, zoom: 0.5 });
  });

  it("cancels pending work when disposed", () => {
    const cancelFrame = vi.fn();
    const setViewport = vi.fn();
    const batcher = createViewportPanBatcher({
      getViewport: () => ({ x: 0, y: 0, zoom: 1 }),
      setViewport,
      requestFrame: () => 12,
      cancelFrame,
    });

    batcher.queue(10, 10);
    batcher.dispose();

    expect(cancelFrame).toHaveBeenCalledWith(12);
    expect(setViewport).not.toHaveBeenCalled();
  });
});

describe("createPanActivityTracker", () => {
  it("keeps performance mode active until wheel activity settles", () => {
    let endCallback: (() => void) | null = null;
    const setActive = vi.fn();
    const cancelEnd = vi.fn();
    const tracker = createPanActivityTracker({
      setActive,
      scheduleEnd: (callback) => {
        endCallback = callback;
        return 9 as ReturnType<typeof setTimeout>;
      },
      cancelEnd,
    });

    tracker.signal();
    tracker.signal();

    expect(setActive).toHaveBeenCalledTimes(1);
    expect(setActive).toHaveBeenCalledWith(true);
    expect(cancelEnd).toHaveBeenCalledWith(9);

    endCallback?.();
    expect(setActive).toHaveBeenLastCalledWith(false);
  });

  it("clears performance mode when disposed", () => {
    const setActive = vi.fn();
    const cancelEnd = vi.fn();
    const tracker = createPanActivityTracker({
      setActive,
      scheduleEnd: () => 11 as ReturnType<typeof setTimeout>,
      cancelEnd,
    });

    tracker.signal();
    tracker.dispose();

    expect(cancelEnd).toHaveBeenCalledWith(11);
    expect(setActive).toHaveBeenLastCalledWith(false);
  });
});
