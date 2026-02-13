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

function createRecord(params: {
  requestId: string;
  status?: string;
  modelKey?: string | null;
  createdAt: Date;
  updatedAt?: Date;
  apiKeyId?: string | null;
  maskedKey?: string | null;
}) {
  const apiKeyId = params.apiKeyId === undefined ? "key-1" : params.apiKeyId;

  return {
    requestId: params.requestId,
    status: params.status ?? "completed",
    modelKey: params.modelKey ?? "flux",
    createdAt: params.createdAt,
    updatedAt: params.updatedAt ?? params.createdAt,
    apiKeyId,
    apiKey:
      apiKeyId === null
        ? null
        : {
            maskedKey: params.maskedKey ?? "lf_live_aaaa...bbbb",
          },
  };
}

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
        orderBy: [{ createdAt: "desc" }, { requestId: "desc" }],
        skip: 10,
        take: 50,
      }),
    );
  });

  it("type=all에서 동률 정렬 시에도 페이지 경계가 고정된다", async () => {
    const query: MonitoringQuery = {
      ...baseQuery,
      type: "all",
      limit: 2,
      offset: 1,
    };
    const sameCreatedAt = new Date("2026-01-03T10:00:00Z");
    const olderCreatedAt = new Date("2026-01-03T09:00:00Z");
    (prisma.imageGeneration.count as ReturnType<typeof vi.fn>).mockResolvedValue(2);
    (prisma.videoGeneration.count as ReturnType<typeof vi.fn>).mockResolvedValue(2);
    (prisma.imageGeneration.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      createRecord({ requestId: "b", createdAt: sameCreatedAt }),
      createRecord({ requestId: "a", createdAt: sameCreatedAt }),
    ]);
    (prisma.videoGeneration.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      createRecord({ requestId: "c", createdAt: sameCreatedAt }),
      createRecord({ requestId: "d", createdAt: olderCreatedAt }),
    ]);

    const result = await getMonitoringRequests(query);

    expect(result.total).toBe(4);
    expect(result.items.map((item) => item.id)).toEqual(["b", "a"]);
    expect(prisma.imageGeneration.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: [{ createdAt: "desc" }, { requestId: "desc" }],
        take: 3,
      }),
    );
    expect(prisma.videoGeneration.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: [{ createdAt: "desc" }, { requestId: "desc" }],
        take: 3,
      }),
    );
  });

  it("type=all에서도 API Key 라벨과 duration 규칙을 유지한다", async () => {
    const query: MonitoringQuery = {
      ...baseQuery,
      type: "all",
      limit: 10,
      offset: 0,
    };
    const createdAt = new Date("2026-01-04T10:00:00Z");
    const completedUpdatedAt = new Date("2026-01-04T10:00:03Z");
    const processingUpdatedAt = new Date("2026-01-04T10:00:05Z");
    (prisma.imageGeneration.count as ReturnType<typeof vi.fn>).mockResolvedValue(1);
    (prisma.videoGeneration.count as ReturnType<typeof vi.fn>).mockResolvedValue(1);
    (prisma.imageGeneration.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      createRecord({
        requestId: "img-1",
        status: "completed",
        createdAt,
        updatedAt: completedUpdatedAt,
      }),
    ]);
    (prisma.videoGeneration.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      createRecord({
        requestId: "vid-1",
        status: "processing",
        createdAt: new Date("2026-01-04T09:59:00Z"),
        updatedAt: processingUpdatedAt,
        apiKeyId: null,
      }),
    ]);

    const result = await getMonitoringRequests(query);

    expect(result.items).toHaveLength(2);
    expect(result.items[0].id).toBe("img-1");
    expect(result.items[0].apiKeyLabel).toBe("lf_live_aaaa...bbbb");
    expect(result.items[0].durationMs).toBe(3000);
    expect(result.items[1].id).toBe("vid-1");
    expect(result.items[1].apiKeyLabel).toBe("UI");
    expect(result.items[1].durationMs).toBeNull();
  });
});
