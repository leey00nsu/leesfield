import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MonitoringQuery } from "@/server/monitoring/monitoring-query";
import { getMonitoringOverview } from "@/server/monitoring/overview";
import { prisma } from "@/server/db/prisma";

vi.mock("@/server/db/prisma", () => ({
  prisma: {
    audioGeneration: {
      count: vi.fn(),
    },
    imageGeneration: {
      count: vi.fn(),
    },
    videoGeneration: {
      count: vi.fn(),
    },
    $queryRaw: vi.fn(),
  },
}));

const baseQuery: MonitoringQuery = {
  type: "all",
  statuses: null,
  model: null,
  apiKey: { mode: "all" },
  query: null,
  from: new Date("2026-01-01T00:00:00Z"),
  to: new Date("2026-01-08T00:00:00Z"),
  tz: "UTC",
  limit: 50,
  offset: 0,
  metric: "requests",
};

describe("getMonitoringOverview", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (prisma.audioGeneration.count as ReturnType<typeof vi.fn>).mockResolvedValue(0);
  });

  it("활성/요청/오류율 지표를 계산한다", async () => {
    (prisma.imageGeneration.count as ReturnType<typeof vi.fn>).mockResolvedValue(2);
    (prisma.videoGeneration.count as ReturnType<typeof vi.fn>).mockResolvedValue(3);
    (prisma.$queryRaw as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce([
        {
          total: 10,
          failed: 2,
          avg_ms: 1200,
          p95_ms: 2400,
        },
      ])
      .mockResolvedValueOnce([
        { type: "image", total: 6 },
        { type: "video", total: 3 },
        { type: "audio", total: 1 },
      ]);

    const result = await getMonitoringOverview(baseQuery);

    expect(result.activeCount).toBe(5);
    expect(result.totalCount).toBe(10);
    expect(result.failedCount).toBe(2);
    expect(result.errorRate).toBeCloseTo(0.2, 4);
    expect(result.avgLatencyMs).toBe(1200);
    expect(result.p95LatencyMs).toBe(2400);
    expect(result.usageByType).toEqual({
      image: 6,
      video: 3,
      audio: 1,
      other: 0,
    });
  });
});
