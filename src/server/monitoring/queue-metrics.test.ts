import { describe, expect, it, vi } from "vitest";
const snapshot = vi.hoisted(() => vi.fn());
vi.mock("@/server/job-queue/job-queue-snapshot", () => ({ getSharedQueueSnapshot: snapshot }));
import { getQueueMetrics } from "./queue-status";

describe("queue metrics compatibility projection", () => {
  it("takes common queue totals once and never adds DLQ history to final failures", async () => {
    const shared = { pending: 7, processing: 3, oldestPendingAgeSeconds: 90,
      byKind: { storage_cleanup: { finalFailed: 2 } }, deadLetters: { unresolved: 12 } };
    snapshot.mockResolvedValue(shared);
    expect(await getQueueMetrics()).toEqual({ pending: 7, processing: 3, oldestPendingAgeSeconds: 90, failedCleanup: 2, shared });
    expect(snapshot).toHaveBeenCalledTimes(1);
  });
});
