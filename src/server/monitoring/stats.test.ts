import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MonitoringQuery } from "@/server/monitoring/monitoring-query";
import { getMonitoringStats } from "@/server/monitoring/stats";
import { prisma } from "@/server/db/prisma";

vi.mock("@/server/db/prisma", () => ({
  prisma: {
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

describe("getMonitoringStats", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("일자별 통계 행을 반환한다", async () => {
    (prisma.$queryRaw as ReturnType<typeof vi.fn>).mockResolvedValue([
      {
        day: "2026-01-01",
        total: 10,
        failed: 1,
        avg_ms: 800,
        p95_ms: 1500,
      },
    ]);

    const result = await getMonitoringStats(baseQuery);

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      day: "2026-01-01",
      total: 10,
      failed: 1,
      errorRate: 0.1,
      avgLatencyMs: 800,
      p95LatencyMs: 1500,
    });
  });
});
