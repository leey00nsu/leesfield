import { QueryClient } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import { observeServerExecution, ExecutionSelectionTracker } from "./server-execution-tracking";
import { nodeExecutionKeys } from "../hook/use-node-executions";
import type { NodeExecutionDto } from "./node-execution-types";

const pending: NodeExecutionDto = { executionId: "run", executionKind: "generation", mediaType: "video", graphNodeId: "n", status: "processing", progress: 50, modelKey: "any-provider", errorCode: null, outputAssetIds: [], createdAt: "2026-09-12T00:00:00Z", selectedOutputAssetId: null };
const completed = { ...pending, status: "completed" as const, outputAssetIds: ["result"], selectedOutputAssetId: "result" };
afterEach(() => vi.useRealTimers());

describe("server execution observation", () => {
  it.each(["image", "video", "audio"] as const)("keeps observing %s past 120 seconds and transient query errors without resubmission", async mediaType => {
    vi.useFakeTimers();
    const client = new QueryClient();
    const key = nodeExecutionKeys.list("g", "n");
    client.setQueryData(key, [{ ...pending, mediaType }]);
    const done = vi.fn();
    const completion = observeServerExecution(client, "g", "n", "run", new AbortController().signal).then(done);
    await vi.advanceTimersByTimeAsync(180_000);
    client.getQueryCache().find({ queryKey: key })?.setState({ status: "error", error: new Error("offline") });
    expect(done).not.toHaveBeenCalled();
    client.setQueryData(key, [{ ...completed, mediaType }]);
    await completion;
    expect(done).toHaveBeenCalledWith({ ...completed, mediaType });
    client.clear();
  });
  it("disposes on graph exit and cannot consume another graph's result", async () => {
    const client = new QueryClient();
    const controller = new AbortController();
    const completion = observeServerExecution(client, "g", "n", "run", controller.signal);
    const assertion = expect(completion).rejects.toMatchObject({ name: "AbortError" });
    client.setQueryData(nodeExecutionKeys.list("other", "n"), [completed]);
    controller.abort();
    await assertion;
    client.clear();
  });
  it.each(["failed", "cancelled"] as const)("recognizes an actual server %s status", async status => {
    const client = new QueryClient();
    const completion = observeServerExecution(client, "g", "n", "run", new AbortController().signal);
    const assertion = expect(completion).rejects.toThrow(`NODE_EXECUTION_${status.toUpperCase()}`);
    client.setQueryData(nodeExecutionKeys.list("g", "n"), [{ ...pending, status }]);
    await assertion;
    client.clear();
  });
  it("does not let an unacknowledged submission weaken an older history read", () => {
    const tracker = new ExecutionSelectionTracker();
    const oldRead = tracker.beginRead("n");
    tracker.changed("n"); tracker.changed("n");
    tracker.beginSubmission("n");
    expect(tracker.observe("n", [completed], oldRead, null)).toEqual({ preserve: true });
    tracker.submitted("n", "new-run");
    expect(tracker.observe("n", [{ ...completed, executionId: "new-run" }], tracker.beginRead("n"), null))
      .toEqual({ selection: "result" });
  });

  it("preserves selection revisions across reads and resets the baseline for a new execution", () => {
    const tracker = new ExecutionSelectionTracker();
    const first = tracker.beginRead("n");
    tracker.observe("n", [pending], first, null);
    tracker.changed("n"); tracker.changed("n");
    expect(tracker.observe("n", [completed], tracker.beginRead("n"), null)).toEqual({ preserve: true });
    expect(tracker.observe("n", [completed], tracker.beginRead("n"), null)).toEqual({});
    expect(tracker.observe("n", [{ ...completed, executionId: "new" }], tracker.beginRead("n"), null)).toEqual({ selection: "result" });
  });
});
