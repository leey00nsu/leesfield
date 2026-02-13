import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MonitoringQuery } from "@/server/monitoring/monitoring-query";
import { getMonitoringRequests } from "@/server/monitoring/requests";
import { prisma } from "@/server/db/prisma";

vi.mock("@/server/db/prisma", () => ({
  prisma: {
    imageGeneration: {
      findMany: vi.fn(),
      count: vi.fn(),
    },
    videoGeneration: {
      findMany: vi.fn(),
      count: vi.fn(),
    },
  },
}));

const baseQuery: MonitoringQuery = {
  type: "image",
  statuses: null,
  model: null,
  apiKey: { mode: "all" },
  query: null,
  from: new Date("2026-01-01T00:00:00Z"),
  to: new Date("2026-01-08T00:00:00Z"),
  tz: "UTC",
  limit: 50,
  offset: 10,
  metric: "requests",
};

describe("getMonitoringRequests", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("API Key 표시와 duration을 계산한다", async () => {
    const createdAt = new Date("2026-01-02T10:00:00Z");
    const updatedAt = new Date("2026-01-02T10:00:02Z");
    (prisma.imageGeneration.count as ReturnType<typeof vi.fn>).mockResolvedValue(120);
    (prisma.imageGeneration.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      {
        requestId: "req-1",
        status: "completed",
        modelKey: "flux",
        createdAt,
        updatedAt,
        apiKeyId: "key-1",
        apiKey: { maskedKey: "lf_live_aaaa...bbbb" },
      },
      {
        requestId: "req-2",
        status: "processing",
        modelKey: "flux",
        createdAt,
        updatedAt,
        apiKeyId: null,
        apiKey: null,
      },
    ]);

    const result = await getMonitoringRequests(baseQuery);

    expect(result.items).toHaveLength(2);
    expect(result.total).toBe(120);
    expect(result.limit).toBe(50);
    expect(result.offset).toBe(10);
    expect(result.items[0].apiKeyLabel).toBe("lf_live_aaaa...bbbb");
    expect(result.items[0].durationMs).toBe(2000);
    expect(result.items[1].apiKeyLabel).toBe("UI");
    expect(result.items[1].durationMs).toBeNull();
    expect(prisma.imageGeneration.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        skip: 10,
        take: 50,
      }),
    );
  });
});
