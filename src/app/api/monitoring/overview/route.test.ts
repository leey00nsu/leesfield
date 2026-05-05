import { afterEach, describe, expect, it, vi } from "vitest";
import { GET } from "@/app/api/monitoring/overview/route";

const mockGetSession = vi.hoisted(() => vi.fn());
const mockGetMonitoringOverview = vi.hoisted(() => vi.fn());

vi.mock("@/server/auth/session", () => ({
  getSession: mockGetSession,
}));

vi.mock("@/server/monitoring/overview", () => ({
  getMonitoringOverview: mockGetMonitoringOverview,
}));

afterEach(() => {
  vi.clearAllMocks();
});

describe("/api/monitoring/overview", () => {
  it("인증되지 않으면 401을 반환한다", async () => {
    mockGetSession.mockResolvedValue({ isLoggedIn: false });

    const request = new Request("http://localhost/api/monitoring/overview");
    const response = await GET(request);
    const payload = await response.json();

    expect(response.status).toBe(401);
    expect(payload.message).toBe("UNAUTHORIZED");
  });

  it("정상 요청이면 overview를 반환한다", async () => {
    mockGetSession.mockResolvedValue({
      isLoggedIn: true,
      adminEmail: "admin@example.com",
    });
    mockGetMonitoringOverview.mockResolvedValue({
      activeCount: 1,
      totalCount: 5,
      failedCount: 0,
      errorRate: 0,
      avgLatencyMs: 1000,
      p95LatencyMs: 2000,
      usageByType: {
        image: 3,
        video: 1,
        audio: 1,
        other: 0,
      },
    });

    const request = new Request(
      "http://localhost/api/monitoring/overview?from=2026-01-01&to=2026-01-02",
    );
    const response = await GET(request);
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.totalCount).toBe(5);
  });
});
