import { createElement, StrictMode, type ReactNode } from "react";
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { GenerationGraphApiError } from "../api/generation-graph-api";
import type { GenerationGraphSnapshotDto } from "../model/graph-types";
import {
  GraphAutosaveController,
  type GraphDraft,
  useGraphAutosave,
} from "./use-graph-autosave";

const baseDraft: GraphDraft = { title: "Graph", nodes: [], edges: [] };
const graph = (version: number, title = "Graph"): GenerationGraphSnapshotDto => ({
  id: "graph_1",
  title,
  version,
  createdAt: "2026-08-24T00:00:00.000Z",
  updatedAt: "2026-08-24T00:00:00.000Z",
  nodes: [],
  edges: [],
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

async function flushPromises() {
  await Promise.resolve();
  await Promise.resolve();
}

describe("GraphAutosaveController", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("debounces edits for 650ms and sends the current version", async () => {
    const save = vi.fn().mockResolvedValue(graph(2, "Changed"));
    const controller = new GraphAutosaveController({
      graphId: "graph_1",
      initialVersion: 1,
      initialDraft: baseDraft,
      save,
    });

    controller.update({ ...baseDraft, title: "Changed" });
    await vi.advanceTimersByTimeAsync(649);
    expect(save).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(save).toHaveBeenCalledWith(
      "graph_1",
      { ...baseDraft, title: "Changed", expectedVersion: 1 },
      expect.any(AbortSignal),
    );
    await flushPromises();
    expect(controller.getSnapshot()).toEqual({ status: "saved", version: 2 });
  });

  it("coalesces image node authoring edits into the latest graph snapshot", async () => {
    const save = vi.fn().mockResolvedValue(graph(2));
    const controller = new GraphAutosaveController({
      graphId: "graph_1",
      initialVersion: 1,
      initialDraft: baseDraft,
      save,
    });
    const nodeDraft = (prompt: string): GraphDraft => ({
      ...baseDraft,
      nodes: [
        {
          id: "node_a",
          type: "imageGeneration",
          position: { x: 0, y: 0 },
          configVersion: 1,
          config: {
            prompt,
            modelKey: "model/a",
            parameters: { width: 1024, height: 1024 },
          },
          selectedOutputImageId: null,
        },
      ],
    });

    controller.update(nodeDraft("first"));
    await vi.advanceTimersByTimeAsync(400);
    controller.update(nodeDraft("latest"));
    await vi.advanceTimersByTimeAsync(649);
    expect(save).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);

    expect(save).toHaveBeenCalledOnce();
    expect(save).toHaveBeenCalledWith(
      "graph_1",
      expect.objectContaining({
        nodes: [expect.objectContaining({ config: expect.objectContaining({ prompt: "latest" }) })],
        expectedVersion: 1,
      }),
      expect.any(AbortSignal),
    );
  });

  it("serializes an edit queued during an in-flight save", async () => {
    const first = deferred<GenerationGraphSnapshotDto>();
    const save = vi.fn().mockReturnValueOnce(first.promise).mockResolvedValueOnce(graph(3, "Second"));
    const controller = new GraphAutosaveController({
      graphId: "graph_1",
      initialVersion: 1,
      initialDraft: baseDraft,
      save,
    });

    controller.update({ ...baseDraft, title: "First" });
    await vi.advanceTimersByTimeAsync(650);
    controller.update({ ...baseDraft, title: "Second" });
    await vi.advanceTimersByTimeAsync(650);
    expect(save).toHaveBeenCalledTimes(1);

    first.resolve(graph(2, "First"));
    await flushPromises();
    await vi.advanceTimersByTimeAsync(0);
    expect(save).toHaveBeenNthCalledWith(
      2,
      "graph_1",
      { ...baseDraft, title: "Second", expectedVersion: 2 },
      expect.any(AbortSignal),
    );
  });

  it("saveNow flushes a dirty draft immediately and returns the saved version", async () => {
    const save = vi.fn().mockResolvedValue(graph(2, "Immediate"));
    const controller = new GraphAutosaveController({
      graphId: "graph_1",
      initialVersion: 1,
      initialDraft: baseDraft,
      save,
    });
    controller.update({ ...baseDraft, title: "Immediate" });

    const completion = controller.saveNow();
    await flushPromises();

    expect(save).toHaveBeenCalledOnce();
    await expect(completion).resolves.toEqual({ status: "saved", version: 2 });
  });

  it("flushes the latest Edge snapshot before execution and returns its new version", async () => {
    const save = vi.fn().mockResolvedValue(graph(5));
    const controller = new GraphAutosaveController({
      graphId: "graph_1",
      initialVersion: 4,
      initialDraft: baseDraft,
      save,
    });
    const edgeDraft: GraphDraft = {
      ...baseDraft,
      edges: [
        {
          id: "edge-primary",
          sourceNodeId: "source",
          targetNodeId: "target",
          kind: "primary",
          sourceHandle: "output",
          targetHandle: "primary",
        },
      ],
    };

    controller.update(edgeDraft);
    const completion = controller.saveNow();
    await flushPromises();

    expect(save).toHaveBeenCalledWith(
      "graph_1",
      { ...edgeDraft, expectedVersion: 4 },
      expect.any(AbortSignal),
    );
    await expect(completion).resolves.toEqual({ status: "saved", version: 5 });
  });

  it("saveNow waits for the in-flight save and its latest queued revision", async () => {
    const first = deferred<GenerationGraphSnapshotDto>();
    const second = deferred<GenerationGraphSnapshotDto>();
    const save = vi
      .fn()
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);
    const controller = new GraphAutosaveController({
      graphId: "graph_1",
      initialVersion: 1,
      initialDraft: baseDraft,
      save,
    });

    controller.update({ ...baseDraft, title: "First" });
    await vi.advanceTimersByTimeAsync(650);
    controller.update({ ...baseDraft, title: "Latest" });
    const completion = controller.saveNow();

    first.resolve(graph(2, "First"));
    await flushPromises();
    await vi.advanceTimersByTimeAsync(0);
    expect(save).toHaveBeenCalledTimes(2);

    let completed = false;
    void completion.then(() => {
      completed = true;
    });
    await flushPromises();
    expect(completed).toBe(false);

    second.resolve(graph(3, "Latest"));
    await flushPromises();
    await expect(completion).resolves.toEqual({ status: "saved", version: 3 });
  });

  it("saveNow rejects typed error and conflict states", async () => {
    const save = vi
      .fn()
      .mockRejectedValue(new GenerationGraphApiError(409, "GRAPH_VERSION_CONFLICT"));
    const controller = new GraphAutosaveController({
      graphId: "graph_1",
      initialVersion: 1,
      initialDraft: baseDraft,
      save,
    });
    controller.update({ ...baseDraft, title: "Conflict" });

    const completion = controller.saveNow();
    await expect(completion).rejects.toMatchObject({
      status: "conflict",
    });
    await expect(controller.saveNow()).rejects.toMatchObject({
      status: "conflict",
    });
  });

  it("saveNow returns the current version without a request when already saved", async () => {
    const save = vi.fn();
    const controller = new GraphAutosaveController({
      graphId: "graph_1",
      initialVersion: 7,
      initialDraft: baseDraft,
      save,
    });
    await expect(controller.saveNow()).resolves.toEqual({
      status: "saved",
      version: 7,
    });
    expect(save).not.toHaveBeenCalled();
  });

  it("retains an error until explicit retry", async () => {
    const save = vi.fn().mockRejectedValueOnce(new Error("network")).mockResolvedValueOnce(graph(2));
    const controller = new GraphAutosaveController({
      graphId: "graph_1",
      initialVersion: 1,
      initialDraft: baseDraft,
      save,
    });

    controller.update({ ...baseDraft, title: "Changed" });
    await vi.advanceTimersByTimeAsync(650);
    await flushPromises();
    expect(controller.getSnapshot().status).toBe("error");

    controller.retry();
    await vi.advanceTimersByTimeAsync(0);
    await flushPromises();
    expect(save).toHaveBeenCalledTimes(2);
    expect(controller.getSnapshot()).toEqual({ status: "saved", version: 2 });
  });

  it("pauses permanently on a version conflict until reset", async () => {
    const save = vi.fn().mockRejectedValue(
      new GenerationGraphApiError(409, "GRAPH_VERSION_CONFLICT"),
    );
    const controller = new GraphAutosaveController({
      graphId: "graph_1",
      initialVersion: 1,
      initialDraft: baseDraft,
      save,
    });

    controller.update({ ...baseDraft, title: "Local" });
    await vi.advanceTimersByTimeAsync(650);
    await flushPromises();
    expect(controller.getSnapshot().status).toBe("conflict");

    controller.update({ ...baseDraft, title: "New local" });
    controller.retry();
    await vi.runAllTimersAsync();
    expect(save).toHaveBeenCalledTimes(1);

    controller.reset({ graphId: "graph_1", version: 4, draft: baseDraft });
    expect(controller.getSnapshot()).toEqual({ status: "saved", version: 4 });
  });

  it("ignores a stale response after switching graph sessions", async () => {
    const first = deferred<GenerationGraphSnapshotDto>();
    const onSaved = vi.fn();
    const save = vi.fn().mockReturnValue(first.promise);
    const controller = new GraphAutosaveController({
      graphId: "graph_1",
      initialVersion: 1,
      initialDraft: baseDraft,
      save,
      onSaved,
    });

    controller.update({ ...baseDraft, title: "Old" });
    await vi.advanceTimersByTimeAsync(650);
    controller.reset({ graphId: "graph_2", version: 7, draft: baseDraft });
    first.resolve(graph(2, "Old"));
    await flushPromises();

    expect(onSaved).not.toHaveBeenCalled();
    expect(controller.getSnapshot()).toEqual({ status: "saved", version: 7 });
  });

  it("React Strict Mode의 effect 재실행 후에도 autosave를 유지한다", async () => {
    const save = vi.fn().mockResolvedValue(graph(2, "Changed"));
    const wrapper = ({ children }: { children: ReactNode }) =>
      createElement(StrictMode, null, children);
    const { result } = renderHook(
      () =>
        useGraphAutosave({
          graphId: "graph_1",
          initialVersion: 1,
          initialDraft: baseDraft,
          save,
        }),
      { wrapper },
    );

    act(() => result.current.update({ ...baseDraft, title: "Changed" }));
    await act(async () => vi.advanceTimersByTimeAsync(650));
    await flushPromises();

    expect(save).toHaveBeenCalledOnce();
    expect(result.current).toMatchObject({ status: "saved", version: 2 });
  });
});
