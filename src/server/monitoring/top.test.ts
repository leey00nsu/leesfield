import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MonitoringQuery } from "@/server/monitoring/monitoring-query";
import { getMonitoringTop } from "@/server/monitoring/top";
import { prisma } from "@/server/db/prisma";

vi.mock("@/server/db/prisma", () => ({
  prisma: {
    $queryRaw: vi.fn(),
    apiKey: {
      findMany: vi.fn(),
    },
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

describe("getMonitoringTop", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("모델과 API Key 랭킹을 반환한다", async () => {
    (prisma.$queryRaw as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce([
        {
          key: "flux",
          total: 10,
          failed: 1,
          avg_ms: 900,
          p95_ms: 1400,
        },
      ])
      .mockResolvedValueOnce([
        {
          key: "__ui__",
          total: 4,
          failed: 0,
          avg_ms: 700,
          p95_ms: 1000,
        },
        {
          key: "key-1",
          total: 6,
          failed: 1,
          avg_ms: 1000,
          p95_ms: 1500,
        },
      ]);

    (prisma.apiKey.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: "key-1", maskedKey: "lf_live_aaaa...bbbb" },
    ]);

    const result = await getMonitoringTop(baseQuery, 5);

    expect(result.models[0].label).toBe("flux");
    const uiItem = result.apiKeys.find((item) => item.key === "UI");
    expect(uiItem?.label).toBe("UI");
    const apiKeyItem = result.apiKeys.find((item) => item.key === "key-1");
    expect(apiKeyItem?.label).toBe("lf_live_aaaa...bbbb");
  });
});
