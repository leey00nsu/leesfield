import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockCount = vi.hoisted(() => vi.fn());
const mockAggregate = vi.hoisted(() => vi.fn());

vi.mock("@/server/db/prisma", () => ({
  prisma: {
    imageGeneration: { count: mockCount, aggregate: mockAggregate },
    videoGeneration: { count: mockCount, aggregate: mockAggregate },
    audioGeneration: { count: mockCount, aggregate: mockAggregate },
    mediaOperation: { count: mockCount, aggregate: mockAggregate },
    mediaCleanupTask: { count: mockCount },
  },
}));

import { getQueueMetrics } from "@/server/monitoring/queue-status";

describe("getQueueMetrics", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-17T04:00:00.000Z"));
    mockCount.mockReset();
    mockAggregate.mockReset();
    mockCount
      .mockResolvedValueOnce(4)
      .mockResolvedValueOnce(2)
      .mockResolvedValueOnce(3)
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(2)
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(5)
      .mockResolvedValueOnce(2)
      .mockResolvedValueOnce(1);
    mockAggregate
      .mockResolvedValueOnce({ _min: { createdAt: new Date("2026-09-17T03:58:00.000Z") } })
      .mockResolvedValueOnce({ _min: { createdAt: null } })
      .mockResolvedValueOnce({ _min: { createdAt: new Date("2026-09-17T03:59:00.000Z") } })
      .mockResolvedValueOnce({ _min: { createdAt: new Date("2026-09-17T03:57:00.000Z") } });
  });

  it("returns bounded aggregate queue depth and oldest pending age", async () => {
    await expect(getQueueMetrics()).resolves.toEqual({
      pending: 14,
      processing: 6,
      oldestPendingAgeSeconds: 180,
      failedCleanup: 1,
    });
    expect(mockCount).toHaveBeenCalledTimes(9);
    expect(mockAggregate).toHaveBeenCalledTimes(4);
  });
});
