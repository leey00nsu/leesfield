import type { ReactNode } from "react";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { ReactFlowProvider, useStoreApi } from "@xyflow/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  NodeBananaUpstreamHostProvider, clearThumbnailCache, generateThumbnail, getPending,
  getThumbnail, setThumbnail, useAdaptiveImageSrc, useErrorToast,
} from "@node-banana-runtime/upstream-node-host";

class DeferredImage {
  static instances: DeferredImage[] = [];
  naturalWidth = 800;
  naturalHeight = 400;
  src = "";
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  removeAttribute = vi.fn((attribute: string) => { if (attribute === "src") this.src = ""; });
  constructor() { DeferredImage.instances.push(this); }
}

const original = "/api/media-assets/owned-original/content";
const thumbnail = "data:image/jpeg;base64,thumbnail";
const drawImage = vi.fn();
function FlowWrapper({ children }: { children: ReactNode }) {
  return <ReactFlowProvider initialNodes={[{
    id: "image", data: {}, position: { x: 0, y: 0 }, width: 400, measured: { width: 250, height: 200 },
  }]}>{children}</ReactFlowProvider>;
}
function useImage(src: string | null) {
  return { src: useAdaptiveImageSrc(src, "image"), store: useStoreApi() };
}

describe("Node Banana adaptive image lifecycle", () => {
  beforeEach(() => {
    clearThumbnailCache(); DeferredImage.instances = []; drawImage.mockClear();
    vi.stubGlobal("Image", DeferredImage);
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({ drawImage } as unknown as CanvasRenderingContext2D);
    vi.spyOn(HTMLCanvasElement.prototype, "toDataURL").mockReturnValue(thumbnail);
  });
  afterEach(async () => {
    cleanup();
    await act(async () => clearThumbnailCache());
    vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers();
  });

  it("uses persisted roles without downloading or recompressing the original", () => {
    const roles = {list: ["https://media.example/thumb.webp", "https://media.example/display.webp", original], display: ["https://media.example/display.webp", original]};
    const wrapper = ({children}: {children: ReactNode}) => <ReactFlowProvider initialNodes={[{id: "image", data: {imagePresentations: {[original]: roles}}, position: {x: 0, y: 0}, width: 100}]}>{children}</ReactFlowProvider>;
    const {result} = renderHook(() => useImage(original), {wrapper});
    expect(result.current.src).toBe(roles.list[0]);
    expect(DeferredImage.instances[0].src).toBe(roles.list[0]);
    expect(getPending(original)).toBeUndefined();
    expect(drawImage).not.toHaveBeenCalled();
    act(() => DeferredImage.instances[0].onerror!());
    expect(result.current.src).toBe(roles.display[0]);
    act(() => DeferredImage.instances[0].onerror!());
    expect(result.current.src).toBe(original);
    act(() => result.current.store.setState({transform: [0, 0, 3]}));
    expect(result.current.src).toBe(roles.display[0]);
  });

  it("switches below effective width 200, prioritizes measured width, and restores the exact original at 200", async () => {
    const { result } = renderHook(() => useImage(original), { wrapper: FlowWrapper });
    expect(result.current.src).toBe(original);
    act(() => result.current.store.setState({ transform: [0, 0, 0.79] }));
    expect(result.current.src).toBe(original);
    await act(async () => DeferredImage.instances[0].onload!());
    expect(result.current.src).toBe(thumbnail);
    expect(getThumbnail(original)).toBe(thumbnail);
    act(() => result.current.store.setState({ transform: [0, 0, 0.8] }));
    expect(result.current.src).toBe(original);
    expect(drawImage).toHaveBeenCalledWith(DeferredImage.instances[0], 0, 0, 256, 128);
    expect(HTMLCanvasElement.prototype.toDataURL).toHaveBeenCalledWith("image/jpeg", 0.6);
  });

  it("ignores an old decode after source changes and clears presentation when source is removed", async () => {
    const next = "/api/media-assets/next/content";
    const initialProps: { src: string | null } = { src: original };
    const { result, rerender } = renderHook(({ src }: { src: string | null }) => useImage(src), { initialProps, wrapper: FlowWrapper });
    act(() => result.current.store.setState({ transform: [0, 0, 0.5] }));
    const first = DeferredImage.instances[0];
    rerender({ src: next });
    expect(result.current.src).toBe(next);
    await act(async () => first.onload!());
    expect(result.current.src).toBe(next);
    await act(async () => DeferredImage.instances[1].onload!());
    expect(result.current.src).toBe(thumbnail);
    rerender({ src: null });
    expect(result.current.src).toBeNull();
  });

  it("shares pending work for the same source and falls back to original on decode failure", async () => {
    const { result } = renderHook(() => ({ one: useImage(original), two: useAdaptiveImageSrc(original, "image") }), { wrapper: FlowWrapper });
    act(() => result.current.one.store.setState({ transform: [0, 0, 0.5] }));
    expect(DeferredImage.instances).toHaveLength(1);
    expect(getPending(original)).toBeInstanceOf(Promise);
    await act(async () => DeferredImage.instances[0].onerror!());
    expect(result.current.one.src).toBe(original);
    expect(result.current.two).toBe(original);
    expect(getPending(original)).toBeUndefined();
    expect(DeferredImage.instances[0].removeAttribute).toHaveBeenCalledWith("src");
  });

  it("cancels image jobs on cache clear and prevents late writes from replacing a new session's cache", async () => {
    const first = renderHook(() => useImage(original), { wrapper: FlowWrapper });
    const image = DeferredImage.instances[0];
    const lateLoad = image.onload!;
    expect(getPending(original)).toBeDefined();
    first.unmount();
    await act(async () => clearThumbnailCache());
    expect(image.onload).toBeNull();
    expect(image.onerror).toBeNull();
    expect(image.src).toBe("");
    expect(getPending(original)).toBeUndefined();
    expect(getThumbnail(original)).toBeUndefined();
    setThumbnail(original, "new-session-thumbnail");
    await act(async () => lateLoad());
    expect(getThumbnail(original)).toBe("new-session-thumbnail");
  });

  it("bounds cached entries to 500 and refreshes replacement insertion order", () => {
    for (let index = 0; index < 500; index += 1) setThumbnail(`source-${index}`, `thumbnail-${index}`);
    setThumbnail("source-0", "refreshed");
    setThumbnail("source-500", "new");
    expect(getThumbnail("source-0")).toBe("refreshed");
    expect(getThumbnail("source-1")).toBeUndefined();
    expect(getThumbnail("source-2")).toBe("thumbnail-2");
    expect(getThumbnail("source-500")).toBe("new");
    clearThumbnailCache();
    expect(getThumbnail("source-0")).toBeUndefined();
  });

  it("falls back and releases decoder resources on the 15-second timeout", async () => {
    vi.useFakeTimers();
    const pending = generateThumbnail(original);
    await vi.advanceTimersByTimeAsync(15_000);
    await expect(pending).resolves.toBe(original);
    expect(DeferredImage.instances[0].src).toBe("");
    expect(DeferredImage.instances[0].onload).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("keeps small source images intact and survives canvas encoding failure", async () => {
    const small = generateThumbnail(original);
    DeferredImage.instances[0].naturalWidth = 100;
    DeferredImage.instances[0].naturalHeight = 80;
    DeferredImage.instances[0].onload!();
    await expect(small).resolves.toBe(original);
    expect(drawImage).not.toHaveBeenCalled();
    vi.mocked(HTMLCanvasElement.prototype.toDataURL).mockImplementationOnce(() => { throw new Error("encoding failed"); });
    const failed = generateThumbnail(original);
    DeferredImage.instances[1].onload!();
    await expect(failed).resolves.toBe(original);
  });
});

describe("Node Banana host error lifecycle", () => {
  it("reports only transitions into error, including a subsequent new failed attempt", async () => {
    const report = vi.fn();
    const wrapper = ({ children }: { children: ReactNode }) => <NodeBananaUpstreamHostProvider value={{ onHostError: report }}>{children}</NodeBananaUpstreamHostProvider>;
    const { rerender } = renderHook(({ status, error }) => useErrorToast(status, error, "Generation failed"), {
      initialProps: { status: "idle", error: null as string | null }, wrapper,
    });
    rerender({ status: "error", error: "Provider unavailable" });
    await waitFor(() => expect(report).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ message: "Generation failed: Provider unavailable" })));
    rerender({ status: "error", error: "More diagnostic text" });
    expect(report).toHaveBeenCalledTimes(1);
    rerender({ status: "running", error: null });
    rerender({ status: "error", error: "Second failure" });
    expect(report).toHaveBeenCalledTimes(2);
  });
});
