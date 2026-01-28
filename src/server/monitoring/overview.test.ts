import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MonitoringQuery } from "@/server/monitoring/monitoring-query";
import { getMonitoringOverview } from "@/server/monitoring/overview";
import { prisma } from "@/server/db/prisma";

vi.mock("@/server/db/prisma", () => ({
  prisma: {
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
  metric: "requests",
};

describe("getMonitoringOverview", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("활성/요청/오류율 지표를 계산한다", async () => {
    (prisma.imageGeneration.count as ReturnType<typeof vi.fn>).mockResolvedValue(2);
    (prisma.videoGeneration.count as ReturnType<typeof vi.fn>).mockResolvedValue(3);
    (prisma.$queryRaw as ReturnType<typeof vi.fn>).mockResolvedValue([
      {
        total: 10,
        failed: 2,
        avg_ms: 1200,
        p95_ms: 2400,
      },
    ]);

    const result = await getMonitoringOverview(baseQuery);

    expect(result.activeCount).toBe(5);
    expect(result.totalCount).toBe(10);
    expect(result.failedCount).toBe(2);
    expect(result.errorRate).toBeCloseTo(0.2, 4);
    expect(result.avgLatencyMs).toBe(1200);
    expect(result.p95LatencyMs).toBe(2400);
  });
});
