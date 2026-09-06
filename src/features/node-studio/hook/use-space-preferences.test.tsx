import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SpacePreferences } from "@/shared/generation-graph/space-preferences";
import { useSpacePreferencesSession } from "./use-space-preferences";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}
const preferences = (revision = 4, modelKey = "image/original"): SpacePreferences => ({
  schemaVersion: 1, revision, recentModelKeys: [modelKey], defaults: { image: { modelKey, parameters: { steps: 5 } } },
});
const response = (value = preferences(), status = 200) => ({ ok: status < 400, status, json: async () => ({ preferences: value }) }) as Response;
const fetchMock = vi.fn<typeof fetch>();

describe("Space preference sessions", () => {
  it("persists inline controls with the owner revision and restores them without leaking to the next scope", async () => {
    fetchMock.mockResolvedValueOnce(response()).mockResolvedValueOnce(response({ ...preferences(5), inlineParametersEnabled: true }))
      .mockResolvedValueOnce(response({ ...preferences(5), inlineParametersEnabled: true })).mockResolvedValueOnce(response(preferences(1, "image/bob")));
    const { result, rerender } = renderHook(({ scope }) => useSpacePreferencesSession(scope), { initialProps: { scope: "alice" } });
    await waitFor(() => expect(result.current.data).not.toBeNull());
    await act(async () => result.current.setInlineParametersEnabled(true));
    expect(JSON.parse(fetchMock.mock.calls[1][1]!.body as string)).toEqual({ action: "inline", enabled: true, expectedRevision: 4 });
    expect(result.current.inlineParametersEnabled).toBe(true);
    act(() => result.current.retry());
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
    rerender({ scope: "bob" });
    await waitFor(() => expect(result.current.data?.revision).toBe(1));
    expect(result.current.inlineParametersEnabled).toBe(false);
  });
  beforeEach(() => { fetchMock.mockReset(); vi.stubGlobal("fetch", fetchMock); });
  afterEach(() => vi.unstubAllGlobals());

  it("loads server defaults and serializes model tracking against the latest returned revision", async () => {
    const firstPatch = deferred<Response>();
    fetchMock.mockResolvedValueOnce(response()).mockReturnValueOnce(firstPatch.promise).mockResolvedValueOnce(response(preferences(6, "image/two")));
    const { result } = renderHook(() => useSpacePreferencesSession("alice"));
    expect(result.current.data).toBeNull();
    await waitFor(() => expect(result.current.data?.revision).toBe(4));
    act(() => { result.current.trackModel("image/one"); result.current.trackModel("image/two"); });
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(JSON.parse(fetchMock.mock.calls[1][1]!.body as string)).toEqual({ action: "track", modelKey: "image/one", expectedRevision: 4 });
    await act(async () => firstPatch.resolve(response(preferences(5, "image/one"))));
    await waitFor(() => expect(result.current.data?.revision).toBe(6));
    expect(JSON.parse(fetchMock.mock.calls[2][1]!.body as string)).toEqual({ action: "track", modelKey: "image/two", expectedRevision: 5 });
    expect(result.current.saving).toBe(false);
  });

  it("preserves unknown server state on load failure, refuses writes, and recovers via retry", async () => {
    fetchMock.mockResolvedValueOnce(response(undefined, 503)).mockResolvedValueOnce(response());
    const { result } = renderHook(() => useSpacePreferencesSession("alice"));
    await waitFor(() => expect(result.current.error).toContain("Could not load"));
    expect(result.current.data).toBeNull();
    await act(async () => { await expect(result.current.saveDefaults({})).rejects.toThrow("NOT_LOADED"); });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    act(() => result.current.retry());
    await waitFor(() => expect(result.current.data).toEqual(preferences()));
    expect(result.current.error).toBeNull();
  });

  it("preserves defaults on failed save and permits an explicit retry", async () => {
    fetchMock.mockResolvedValueOnce(response()).mockResolvedValueOnce(response(undefined, 503)).mockResolvedValueOnce(response({ ...preferences(5), defaults: {} }));
    const { result } = renderHook(() => useSpacePreferencesSession("alice"));
    await waitFor(() => expect(result.current.data).not.toBeNull());
    await act(async () => { await expect(result.current.saveDefaults({})).rejects.toThrow("preserved"); });
    expect(result.current.data).toEqual(preferences());
    expect(result.current.saving).toBe(false);
    await act(async () => result.current.saveDefaults({}));
    expect(result.current.data?.defaults).toEqual({});
    expect(result.current.error).toBeNull();
    expect(JSON.parse(fetchMock.mock.calls[2][1]!.body as string).expectedRevision).toBe(4);
  });

  it("refreshes a 409 conflict without replaying the rejected defaults automatically", async () => {
    fetchMock.mockResolvedValueOnce(response()).mockResolvedValueOnce(response(undefined, 409)).mockResolvedValueOnce(response(preferences(8, "image/elsewhere")));
    const { result } = renderHook(() => useSpacePreferencesSession("alice"));
    await waitFor(() => expect(result.current.data).not.toBeNull());
    await act(async () => { await expect(result.current.saveDefaults({})).rejects.toThrow("changed elsewhere"); });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls[2][1]?.method).toBeUndefined();
    expect(result.current.data).toEqual(preferences(8, "image/elsewhere"));
    expect(result.current.error).toContain("Close and reopen Settings");
  });

  it("ignores an old scope GET even if the transport completes after cancellation", async () => {
    const old = deferred<Response>();
    fetchMock.mockReturnValueOnce(old.promise).mockResolvedValueOnce(response(preferences(9, "image/bob")));
    const { result, rerender, unmount } = renderHook(({ scope }) => useSpacePreferencesSession(scope), { initialProps: { scope: "alice" } });
    const signal = fetchMock.mock.calls[0][1]!.signal!;
    rerender({ scope: "bob" });
    expect(signal.aborted).toBe(true);
    await waitFor(() => expect(result.current.data?.revision).toBe(9));
    await act(async () => old.resolve(response()));
    expect(result.current.data).toEqual(preferences(9, "image/bob"));
    const latestSignal = fetchMock.mock.calls[1][1]!.signal!;
    unmount();
    expect(latestSignal.aborted).toBe(true);
  });

  it("clears saving on scope change and cancels queued writes from the previous account", async () => {
    const old = deferred<Response>();
    fetchMock.mockResolvedValueOnce(response()).mockReturnValueOnce(old.promise).mockResolvedValueOnce(response(preferences(1, "image/bob")));
    const { result, rerender } = renderHook(({ scope }) => useSpacePreferencesSession(scope), { initialProps: { scope: "alice" } });
    await waitFor(() => expect(result.current.data).not.toBeNull());
    act(() => { result.current.trackModel("image/one"); result.current.trackModel("image/two"); });
    await waitFor(() => expect(result.current.saving).toBe(true));
    rerender({ scope: "bob" });
    await waitFor(() => expect(result.current.data?.revision).toBe(1));
    await act(async () => old.resolve(response(preferences(5))));
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(result.current.data).toEqual(preferences(1, "image/bob"));
    expect(result.current.saving).toBe(false);
  });

  it("does not replace a successful save with an older overlapping refresh response", async () => {
    const refresh = deferred<Response>();
    fetchMock.mockResolvedValueOnce(response()).mockReturnValueOnce(refresh.promise).mockResolvedValueOnce(response(preferences(5, "image/new")));
    const { result } = renderHook(() => useSpacePreferencesSession("alice"));
    await waitFor(() => expect(result.current.data).not.toBeNull());
    act(() => result.current.retry());
    await act(async () => result.current.saveDefaults(preferences(5, "image/new").defaults));
    expect(result.current.data?.revision).toBe(5);
    await act(async () => refresh.resolve(response()));
    expect(result.current.data).toEqual(preferences(5, "image/new"));
  });

  it("does not run an old account conflict refresh in the new account session", async () => {
    const old = deferred<Response>();
    fetchMock.mockResolvedValueOnce(response()).mockReturnValueOnce(old.promise)
      .mockResolvedValueOnce(response(preferences(1, "image/bob")))
      .mockResolvedValueOnce(response(preferences(1, "image/bob")));
    const { result, rerender } = renderHook(({ scope }) => useSpacePreferencesSession(scope), { initialProps: { scope: "alice" } });
    await waitFor(() => expect(result.current.data).not.toBeNull());
    act(() => result.current.trackModel("image/one"));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    rerender({ scope: "bob" });
    await waitFor(() => expect(result.current.data?.revision).toBe(1));
    await act(async () => old.resolve(response(undefined, 409)));
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(result.current.data).toEqual(preferences(1, "image/bob"));
    expect(result.current.error).toBeNull();
  });
});
